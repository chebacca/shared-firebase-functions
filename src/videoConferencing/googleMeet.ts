/**
 * Google Meet Video Conferencing Functions
 *
 * Functions to create, schedule, and manage Google Meet meetings
 */

// CORS allowed origins for video conferencing functions
const CORS_ORIGINS = [
  'http://localhost:4002',
  'http://localhost:4003',
  'http://localhost:4006',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4010',
  'http://localhost:5173',
  'https://backbone-client.web.app',
  'https://backbone-logic.web.app',
  'https://backbone-callsheet-standalone.web.app',
  'https://clipshowpro.web.app'
];

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions'; // Import v1 for config() access
import { db, getUserOrganizationId, validateOrganizationAccess, isAdminUser } from '../shared/utils';
import { getGoogleConfig } from '../google/config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from '../google/secrets';
import { decryptTokens } from '../integrations/encryption';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';

/**
 * Helper to get Firebase Functions v1 config (for backward compatibility)
 */
function getFunctionsConfig(): any {
  try {
    // Access v1 functions.config() - this works even in v2 functions when imported at top level
    return functions.config();
  } catch (error: any) {
    console.log(`⚠️ [GoogleMeet] Could not access functions.config():`, error?.message || error);
    return null;
  }
}

/**
 * Decrypt token (reuse from google/oauth pattern)
 */
function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get authenticated Google OAuth client for organization
 */
async function getAuthenticatedGoogleClient(organizationId: string) {
  console.log(`🔍 [GoogleMeet] Getting authenticated client for org: ${organizationId}`);

  // Prefer org-level googleConnections; fall back to cloudIntegrations/google so existing Firestore OAuth can be reused
  const connectionsSnapshot = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('googleConnections')
    .where('type', '==', 'organization')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  let connection: any | null = null;

  if (!connectionsSnapshot.empty) {
    console.log(`✅ [GoogleMeet] Found connection in googleConnections`);
    const googleConnData = connectionsSnapshot.docs[0].data();
    console.log(`🔍 [GoogleMeet] googleConnections data structure:`, {
      hasAccessToken: !!(googleConnData.accessToken || googleConnData.access_token),
      hasRefreshToken: !!(googleConnData.refreshToken || googleConnData.refresh_token),
      hasTokens: !!(googleConnData.tokens || googleConnData.encryptedTokens),
      accountEmail: googleConnData.accountEmail,
      type: googleConnData.type,
      isActive: googleConnData.isActive,
    });
    // Check if this connection has valid tokens
    const hasAccessToken = googleConnData.accessToken || googleConnData.access_token;
    if (hasAccessToken) {
      connection = googleConnData;
      console.log(`✅ [GoogleMeet] googleConnections has valid access token`);
    } else {
      console.log(`⚠️ [GoogleMeet] googleConnections found but no access token, checking fallback locations...`);
      connection = null; // Will trigger fallback checks
    }
  } else {
    console.log(`⚠️ [GoogleMeet] No googleConnections found, checking fallback locations...`);
  }

  // If no valid connection from googleConnections, check fallback locations
  if (!connection) {
    // Fallback 1: cloudIntegrations/google
    const cloudIntegrationDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('google')
      .get();

    if (cloudIntegrationDoc.exists) {
      console.log(`✅ [GoogleMeet] Found cloudIntegrations/google document`);
      const cloudData = cloudIntegrationDoc.data() || {};
      if (cloudData.isActive !== false) {
        const encryptedTokens = (cloudData as any).tokens || (cloudData as any).encryptedTokens;

        let decrypted: any = null;
        if (encryptedTokens) {
          try {
            // Try to decrypt if it looks like encrypted data (base64 string)
            if (typeof encryptedTokens === 'string' && encryptedTokens.length > 50) {
              decrypted = decryptTokens(encryptedTokens);
            } else if (typeof encryptedTokens === 'object') {
              // Tokens might already be decrypted/plain object
              decrypted = encryptedTokens;
            }
          } catch (decryptError: any) {
            console.warn(`⚠️ [GoogleMeet] Failed to decrypt tokens: ${decryptError.message}`);
            // If decryption fails, try using tokens as-is (might be plain object)
            if (typeof encryptedTokens === 'object') {
              decrypted = encryptedTokens;
            }
          }
        }

        // Also check for plain tokens in the document
        if (!decrypted) {
          if ((cloudData as any).accessToken || (cloudData as any).access_token) {
            console.log(`✅ [GoogleMeet] Found plain tokens in cloudIntegrations/google`);
            decrypted = {
              access_token: (cloudData as any).accessToken || (cloudData as any).access_token,
              refresh_token: (cloudData as any).refreshToken || (cloudData as any).refresh_token,
            };
          }
        }

        if (decrypted?.access_token || decrypted?.accessToken) {
          console.log(`✅ [GoogleMeet] Successfully extracted tokens from cloudIntegrations/google`);
          connection = {
            type: 'organization',
            isActive: cloudData.isActive !== false,
            accountEmail: cloudData.accountEmail,
            accountName: cloudData.accountName,
            accessToken: decrypted.access_token || decrypted.accessToken,
            refreshToken: decrypted.refresh_token || decrypted.refreshToken,
            tokenExpiresAt: cloudData.expiresAt || cloudData.tokenExpiresAt,
            clientId: cloudData.clientId, // Store client ID used to create these tokens
            scopes: cloudData.scopes || [], // Preserve scopes from the connection document
          };

          // CRITICAL: Validate scopes if they were tracked
          if (cloudData.scopes && Array.isArray(cloudData.scopes)) {
            const requiredCalendarScopes = [
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/calendar.events'
            ];
            const hasCalendarScopes = requiredCalendarScopes.every(scope => cloudData.scopes.includes(scope));

            if (!hasCalendarScopes && cloudData.scopes.length > 0) {
              console.warn(`⚠️ [GoogleMeet] cloudIntegrations/google connection missing calendar scopes. Has: ${cloudData.scopes.join(', ')}`);
            }
          }
        } else {
          console.warn(`⚠️ [GoogleMeet] cloudIntegrations/google exists but no valid tokens found`);
          console.warn(`Token structure:`, {
            hasTokens: !!encryptedTokens,
            tokensType: typeof encryptedTokens,
            hasAccessToken: !!(cloudData as any).accessToken || !!(cloudData as any).access_token,
          });
        }
      }
    }

    // Fallback 2: integrationConfigs (for google_meet, googleMeet, google_drive, google_docs)
    if (!connection) {
      console.log(`🔍 [GoogleMeet] Checking integrationConfigs...`);
      const integrationConfigsQuery = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .where('type', 'in', ['google_meet', 'googleMeet', 'google_drive', 'google_docs'])
        .where('enabled', '==', true)
        .limit(1)
        .get();

      if (!integrationConfigsQuery.empty) {
        console.log(`✅ [GoogleMeet] Found integrationConfig in integrationConfigs`);
        const config = integrationConfigsQuery.docs[0].data();
        // Check if it has credentials with tokens
        if (config.credentials?.accessToken || config.credentials?.access_token) {
          connection = {
            type: 'organization',
            isActive: true,
            accountEmail: config.accountEmail,
            accountName: config.accountName,
            accessToken: config.credentials.accessToken || config.credentials.access_token,
            refreshToken: config.credentials.refreshToken || config.credentials.refresh_token,
            tokenExpiresAt: config.credentials.expiresAt || config.credentials.tokenExpiresAt,
          };
        }
      }
    }

    // Fallback 3: integrationSettings/google
    if (!connection) {
      console.log(`🔍 [GoogleMeet] Checking integrationSettings/google...`);
      const integrationSettingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .get();

      if (integrationSettingsDoc.exists) {
        console.log(`✅ [GoogleMeet] Found integrationSettings/google document`);
        const settingsData = integrationSettingsDoc.data() || {};
        if (settingsData.isConfigured === true) {
          // Check for tokens in the settings
          const tokens = (settingsData as any).tokens || (settingsData as any).encryptedTokens;

          let decrypted: any = null;
          if (tokens) {
            try {
              // Try to decrypt if it looks like encrypted data (base64 string)
              if (typeof tokens === 'string' && tokens.length > 50) {
                decrypted = decryptTokens(tokens);
              } else if (typeof tokens === 'object') {
                // Tokens might already be decrypted/plain object
                decrypted = tokens;
              }
            } catch (decryptError: any) {
              console.warn(`⚠️ [GoogleMeet] Failed to decrypt tokens from integrationSettings: ${decryptError.message}`);
              // If decryption fails, try using tokens as-is (might be plain object)
              if (typeof tokens === 'object') {
                decrypted = tokens;
              }
            }
          }

          // Also check for plain tokens in the document
          if (!decrypted) {
            if ((settingsData as any).accessToken || (settingsData as any).access_token) {
              console.log(`✅ [GoogleMeet] Found plain tokens in integrationSettings/google`);
              decrypted = {
                access_token: (settingsData as any).accessToken || (settingsData as any).access_token,
                refresh_token: (settingsData as any).refreshToken || (settingsData as any).refresh_token,
              };
            }
          }

          if (decrypted?.access_token || decrypted?.accessToken) {
            console.log(`✅ [GoogleMeet] Successfully extracted tokens from integrationSettings/google`);
            connection = {
              type: 'organization',
              isActive: true,
              accountEmail: settingsData.accountEmail,
              accountName: settingsData.accountName,
              accessToken: decrypted.access_token || decrypted.accessToken,
              refreshToken: decrypted.refresh_token || decrypted.refreshToken,
              tokenExpiresAt: settingsData.expiresAt || settingsData.tokenExpiresAt,
            };
          } else {
            console.warn(`⚠️ [GoogleMeet] integrationSettings/google is configured but no valid tokens found`);
          }
        }
      }
    }
  }

  if (!connection) {
    console.error(`❌ [GoogleMeet] No active Google connection found in any location for org: ${organizationId}`);
    throw new HttpsError('failed-precondition', 'No active Google connection found for organization');
  }

  console.log(`✅ [GoogleMeet] Found connection with account: ${connection.accountEmail || connection.accountName || 'unknown'}`);

  // Use the client ID stored with the tokens if available, otherwise get from config
  // This ensures we use the same client ID that was used to create the tokens
  let config: any = null;

  // If we have a stored clientId in the connection, try to use it first
  if (connection.clientId) {
    console.log(`🔍 [GoogleMeet] Connection has stored clientId: ${connection.clientId.substring(0, 20)}...`);

    // First check environment variables
    let envClientId = process.env.GOOGLE_CLIENT_ID;
    let envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let envRedirectUri = process.env.GOOGLE_REDIRECT_URI;

    // 🔥 CRITICAL FIX: Also check functions.config() for Firebase Functions v1 compatibility
    if (!envClientId || !envClientSecret) {
      const functionsConfig = getFunctionsConfig();
      if (functionsConfig && functionsConfig.google) {
        envClientId = envClientId || functionsConfig.google.client_id;
        envClientSecret = envClientSecret || functionsConfig.google.client_secret;
        envRedirectUri = envRedirectUri || functionsConfig.google.redirect_uri;
        console.log(`🔍 [GoogleMeet] Found credentials in functions.config().google`);
      }
    }

    if (envClientId === connection.clientId && envClientSecret) {
      console.log(`✅ [GoogleMeet] Found matching credentials in environment/functions.config variables`);
      config = {
        clientId: envClientId,
        clientSecret: envClientSecret,
        redirectUri: envRedirectUri || 'https://backbone-logic.web.app/integration-settings',
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/meetings.space.created',
          'https://www.googleapis.com/auth/meetings.space.readonly'
        ],
      };
    } else {
      // Check integrationSettings/google for matching client ID
      const integrationSettingsDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .get();

      if (integrationSettingsDoc.exists) {
        const settingsData = integrationSettingsDoc.data()!;
        if (settingsData.clientId === connection.clientId && settingsData.isConfigured) {
          console.log(`✅ [GoogleMeet] Found matching credentials in integrationSettings/google`);
          const decryptedSecret = decryptToken(settingsData.clientSecret);
          config = {
            clientId: settingsData.clientId,
            clientSecret: decryptedSecret,
            redirectUri: settingsData.redirectUri || 'https://backbone-logic.web.app/integration-settings',
            scopes: settingsData.scopes || [
              'https://www.googleapis.com/auth/drive.readonly',
              'https://www.googleapis.com/auth/drive.file',
              'https://www.googleapis.com/auth/documents',
              'https://www.googleapis.com/auth/userinfo.email',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/calendar.events',
              'https://www.googleapis.com/auth/meetings.space.created',
              'https://www.googleapis.com/auth/meetings.space.readonly'
            ],
          };
        }
      }
    }
  }

  // If we don't have config yet, try getGoogleConfig (standard flow)
  if (!config) {
    try {
      config = await getGoogleConfig(organizationId);
    } catch (error: any) {
      // If getGoogleConfig fails but we have a connection with tokens, that's okay
      // We'll use environment variables as a last resort
      // 🔥 FIX: Check if we have tokens (not just clientId) - tokens from cloudIntegrations/google
      // might not have clientId stored, but they can still work with environment variables
      const hasTokens = !!(connection.accessToken || connection.access_token);
      if (connection.clientId || hasTokens) {
        console.warn(`⚠️ [GoogleMeet] getGoogleConfig failed, but we have ${connection.clientId ? 'clientId' : 'tokens'}. Checking environment variables...`);
        let envClientId = process.env.GOOGLE_CLIENT_ID;
        let envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
        let envRedirectUri = process.env.GOOGLE_REDIRECT_URI;

        // 🔥 CRITICAL FIX: Also check functions.config() for Firebase Functions v1 compatibility
        if (!envClientId || !envClientSecret) {
          const functionsConfig = getFunctionsConfig();
          if (functionsConfig && functionsConfig.google) {
            envClientId = envClientId || functionsConfig.google.client_id;
            envClientSecret = envClientSecret || functionsConfig.google.client_secret;
            envRedirectUri = envRedirectUri || functionsConfig.google.redirect_uri;
            console.log(`🔍 [GoogleMeet] Found credentials in functions.config().google (fallback)`);
          }
        }

        if (envClientId && envClientSecret) {
          console.log(`✅ [GoogleMeet] Using environment/functions.config variables as fallback`);
          config = {
            clientId: envClientId,
            clientSecret: envClientSecret,
            redirectUri: envRedirectUri || 'https://backbone-logic.web.app/integration-settings',
            scopes: [
              'https://www.googleapis.com/auth/drive.readonly',
              'https://www.googleapis.com/auth/drive.file',
              'https://www.googleapis.com/auth/documents',
              'https://www.googleapis.com/auth/userinfo.email',
              'https://www.googleapis.com/auth/userinfo.profile',
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/calendar.events',
              'https://www.googleapis.com/auth/meetings.space.created',
              'https://www.googleapis.com/auth/meetings.space.readonly'
            ],
          };
        } else {
          // No credentials found anywhere
          throw new HttpsError(
            'failed-precondition',
            'Google OAuth credentials not found. Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in Firebase Functions environment variables or functions.config().google, or configure in Integration Settings.'
          );
        }
      } else {
        // Re-throw the original error
        throw error;
      }
    }
  }

  // Verify we have valid config
  if (!config || !config.clientId || !config.clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Google OAuth credentials not found. Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in Firebase Functions environment variables, or configure in Integration Settings.'
    );
  }

  // Final verification: if we have a stored clientId, ensure it matches (should already be handled above)
  if (connection.clientId && connection.clientId !== config.clientId) {
    console.warn(`⚠️ [GoogleMeet] Client ID still doesn't match after credential lookup. This may cause token refresh issues.`);
    console.warn(`   Stored client ID: ${connection.clientId.substring(0, 20)}...`);
    console.warn(`   Config client ID: ${config.clientId.substring(0, 20)}...`);
    // Continue anyway - the tokens might still work if they were created with the current config
  }

  // Decrypt tokens when stored in googleConnections (colon-delimited) or use plaintext from cloudIntegrations fallback
  let accessToken =
    typeof connection.accessToken === 'string' && connection.accessToken.includes(':')
      ? decryptToken(connection.accessToken)
      : connection.accessToken;

  let refreshToken =
    connection.refreshToken && typeof connection.refreshToken === 'string' && connection.refreshToken.includes(':')
      ? decryptToken(connection.refreshToken)
      : connection.refreshToken || null;

  // Validate we have at least an access token
  if (!accessToken) {
    console.error(`❌ [GoogleMeet] No access token found in connection data`);
    throw new HttpsError('failed-precondition', 'No access token found in Google connection');
  }

  // VALIDATION: Check for required scopes (Calendar permissions)
  // This helps provide a clear error message if the user needs to re-authorize
  const requiredCalendarScopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const scopes = connection.scopes || [];
  const hasCalendarScopes = requiredCalendarScopes.every(scope => scopes.includes(scope));

  // If we have scopes tracked but missing calendar ones, or if scopes are missing entirely
  // and we're about to do a calendar operation, we should warn or fail early.
  // Note: We'll allow it if scopes is empty ONLY IF it's an old connection, 
  // but most new connections should have scopes tracked.
  if (scopes.length === 0) {
    console.warn(`[GoogleMeet] Connection document is missing the 'scopes' field. This may be an older connection.`);
    // We'll allow it to continue and hope for the best, unless the API call actually fails
  } else if (!hasCalendarScopes) {
    console.error(`❌ [GoogleMeet] Google OAuth connection is missing calendar permissions`);
    console.error(`   Has scopes: ${scopes.join(', ')}`);
    throw new HttpsError(
      'failed-precondition',
      'Google OAuth connection is missing calendar permissions. Please disconnect and reconnect your Google account in Integration Settings: https://backbone-logic.web.app/integration-settings'
    );
  }

  console.log(`✅ [GoogleMeet] Using tokens - hasAccessToken: ${!!accessToken}, hasRefreshToken: ${!!refreshToken}`);

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Try to refresh token if needed, but don't fail if refresh doesn't work
  // The access token might still be valid even if refresh fails
  try {
    const token = await oauth2Client.getAccessToken();
    console.log(`✅ [GoogleMeet] Successfully got access token`);
    if (token) {
      oauth2Client.setCredentials({
        access_token: token.token || accessToken,
        refresh_token: refreshToken,
      });
    }
  } catch (error: any) {
    console.warn(`⚠️ [GoogleMeet] Token refresh failed: ${error.message}`);
    if (refreshToken) {
      try {
        console.log(`🔄 [GoogleMeet] Attempting manual token refresh...`);
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        console.log(`✅ [GoogleMeet] Successfully refreshed access token`);
      } catch (refreshError: any) {
        console.warn(`⚠️ [GoogleMeet] Manual refresh failed: ${refreshError.message}`);
        console.warn(`⚠️ [GoogleMeet] This may indicate the refresh token was created with different OAuth credentials`);
        console.warn(`⚠️ [GoogleMeet] Will attempt to use existing access token - if it fails, user may need to re-authenticate`);
        // Continue with existing access token - it might still work
        // If it doesn't, the Calendar API call will fail and we'll handle that error
        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    } else {
      // No refresh token, but we have access token - try to use it
      if (accessToken) {
        console.log(`⚠️ [GoogleMeet] No refresh token, using access token only`);
        oauth2Client.setCredentials({
          access_token: accessToken,
        });
      } else {
        throw new HttpsError('failed-precondition', 'No access token or refresh token available');
      }
    }
  }

  return oauth2Client;
}

/**
 * Create instant Google Meet meeting
 */
export const createMeetMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, title, participants } = request.data as {
        organizationId: string;
        title?: string;
        participants?: string[];
      };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get authenticated client
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Create a calendar event with Google Meet conference
      const event = {
        summary: title || 'Instant Meeting',
        start: {
          dateTime: new Date().toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour default
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomBytes(16).toString('hex'),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        attendees: participants?.map(email => ({ email })) || [],
      };

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      const meetingData = createdEvent.data;
      const meetLink = meetingData.conferenceData?.entryPoints?.[0]?.uri || meetingData.hangoutLink;

      if (!meetLink) {
        throw new HttpsError('internal', 'Failed to create meeting link');
      }

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'google-meet',
          title: meetingData.summary || title || 'Instant Meeting',
          meetingUrl: meetLink,
          joinUrl: meetLink,
          startTime: meetingData.start?.dateTime ? Timestamp.fromDate(new Date(meetingData.start.dateTime)) : Timestamp.now(),
          endTime: meetingData.end?.dateTime ? Timestamp.fromDate(new Date(meetingData.end.dateTime)) : null,
          participants: participants || [],
          calendarEventId: meetingData.id,
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'active',
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.summary,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          calendarEventId: meetingData.id,
          startTime: meetingData.start?.dateTime,
          endTime: meetingData.end?.dateTime,
        },
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error creating meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', `Failed to create Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Schedule Google Meet meeting
 */
export const scheduleMeetMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for public access via callable SDK
    cors: CORS_ORIGINS, // Use explicit origins array for stability
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, title, startTime, endTime, participants, description } = request.data as {
        organizationId: string;
        title: string;
        startTime: string;
        endTime?: string;
        participants?: string[];
        description?: string;
      };

      if (!organizationId || !title || !startTime) {
        throw new HttpsError('invalid-argument', 'Organization ID, title, and start time are required');
      }

      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const auth = request.auth;
      const userId = auth.uid;
      const userEmail = auth.token.email || '';

      // Verify user belongs to the organization
      const userOrganizationId = await getUserOrganizationId(userId, userEmail);
      if (!userOrganizationId) {
        throw new HttpsError('permission-denied', 'User is not associated with any organization');
      }

      // Verify user belongs to the requested organization
      if (userOrganizationId !== organizationId) {
        // Check if user is a member of the organization via teamMembers collection
        const teamMemberQuery = await db
          .collection('teamMembers')
          .where('userId', '==', userId)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();

        if (teamMemberQuery.empty) {
          // Also check users collection for the organization
          const userDoc = await db.collection('users').doc(userId).get();
          const userData = userDoc.data();

          if (userData?.organizationId !== organizationId) {
            throw new HttpsError(
              'permission-denied',
              'User does not have access to this organization'
            );
          }
        }
      }

      // Optional: Check if user is admin (for logging/auditing purposes)
      let isAdmin = false;
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          isAdmin = isAdminUser(userData || {});
        }
      } catch (error) {
        console.warn('Could not check admin status:', error);
      }

      console.log(`✅ [scheduleMeetMeeting] ${isAdmin ? 'Admin' : 'User'} ${userId} scheduling meeting for org ${organizationId}`);

      // Get authenticated client (will throw if connection not found or invalid)
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Calculate end time if not provided (default 1 hour)
      const endTimeValue = endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

      // Create calendar event with Google Meet conference
      const event = {
        summary: title,
        description: description || '',
        start: {
          dateTime: startTime,
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTimeValue,
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomBytes(16).toString('hex'),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        attendees: participants?.map(email => ({ email })) || [],
      };

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      const meetingData = createdEvent.data;
      const meetLink = meetingData.conferenceData?.entryPoints?.[0]?.uri || meetingData.hangoutLink;

      if (!meetLink) {
        throw new HttpsError('internal', 'Failed to create meeting link');
      }

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'google-meet',
          title: meetingData.summary || title,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          startTime: Timestamp.fromDate(new Date(startTime)),
          endTime: Timestamp.fromDate(new Date(endTimeValue)),
          participants: participants || [],
          calendarEventId: meetingData.id,
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'scheduled',
          organizationId: organizationId,
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.summary,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          calendarEventId: meetingData.id,
          startTime: meetingData.start?.dateTime,
          endTime: meetingData.end?.dateTime,
        },
      };
    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error scheduling meeting:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Failed to schedule Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Update Google Meet meeting
 */
export const updateMeetMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId, title, startTime, endTime, participants } = request.data as {
        organizationId: string;
        meetingId: string;
        title?: string;
        startTime?: string;
        endTime?: string;
        participants?: string[];
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;
      const calendarEventId = meetingData.calendarEventId;

      if (!calendarEventId) {
        throw new HttpsError('failed-precondition', 'Meeting does not have a calendar event');
      }

      // Get authenticated client
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Update calendar event
      const updateData: any = {};
      if (title) updateData.summary = title;
      if (startTime) updateData.start = { dateTime: startTime, timeZone: 'UTC' };
      if (endTime) updateData.end = { dateTime: endTime, timeZone: 'UTC' };
      if (participants) updateData.attendees = participants.map(email => ({ email }));

      await calendar.events.patch({
        calendarId: 'primary',
        eventId: calendarEventId,
        requestBody: updateData,
      });

      // Update Firestore
      const updateFields: any = {};
      if (title) updateFields.title = title;
      if (startTime) updateFields.startTime = Timestamp.fromDate(new Date(startTime));
      if (endTime) updateFields.endTime = Timestamp.fromDate(new Date(endTime));
      if (participants) updateFields.participants = participants;

      await meetingDoc.ref.update(updateFields);

      return {
        success: true,
        message: 'Meeting updated successfully',
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error updating meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // Check for insufficient permissions errors
      if (error.message?.includes('Insufficient Permission') ||
        error.message?.includes('insufficient permission') ||
        error.response?.data?.error === 'insufficientPermissions' ||
        error.code === 403) {
        throw new HttpsError(
          'permission-denied',
          'Insufficient permissions to update Google Calendar events. Please re-authenticate your Google account in Integration Settings with calendar permissions enabled.'
        );
      }

      throw new HttpsError('internal', `Failed to update Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Cancel Google Meet meeting
 */
export const cancelMeetMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId } = request.data as {
        organizationId: string;
        meetingId: string;
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;
      const calendarEventId = meetingData.calendarEventId;

      // Delete calendar event if exists
      if (calendarEventId) {
        try {
          const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: calendarEventId,
          });
        } catch (error) {
          console.warn('⚠️ [GoogleMeet] Could not delete calendar event:', error);
        }
      }

      // Update meeting status
      await meetingDoc.ref.update({
        status: 'cancelled',
        cancelledAt: Timestamp.now(),
      });

      return {
        success: true,
        message: 'Meeting cancelled successfully',
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error cancelling meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', `Failed to cancel Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Get Google Meet meeting details
 */
export const getMeetMeetingDetails = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId } = request.data as {
        organizationId: string;
        meetingId: string;
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;

      return {
        success: true,
        meeting: {
          id: meetingDoc.id,
          ...meetingData,
          startTime: meetingData.startTime?.toDate()?.toISOString(),
          endTime: meetingData.endTime?.toDate()?.toISOString(),
          createdAt: meetingData.createdAt?.toDate()?.toISOString(),
        },
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error getting meeting details:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', `Failed to get meeting details: ${error.message || 'Unknown error'}`);
    }
  }
);

