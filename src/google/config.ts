/**
 * Google Drive Configuration Management
 * 
 * Functions to save and retrieve Google Drive OAuth configuration from Firestore
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as functions from 'firebase-functions'; // Import v1 for config() access
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { encryptionKey, getEncryptionKey } from './secrets';

/**
 * Encrypt sensitive data
 */
function encryptToken(text: string): string {
  const algorithm = 'aes-256-gcm';
  // Ensure the key is exactly 32 bytes for AES-256-GCM
  // Use SHA-256 hash to derive a consistent 32-byte key from the secret
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const algorithm = 'aes-256-gcm';
  // Ensure the key is exactly 32 bytes for AES-256-GCM
  // Use SHA-256 hash to derive a consistent 32-byte key from the secret
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get Google Drive configuration from Firestore
 */
export async function getGoogleConfig(organizationId: string) {
  console.log(`🔍 [GoogleConfig] Fetching config for org: ${organizationId}`);

  // Priority 1: Check integrationSettings/google (used by licensing website)
  const integrationSettingsDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationSettings')
    .doc('google')
    .get();

  if (integrationSettingsDoc.exists) {
    const settingsData = integrationSettingsDoc.data()!;
    if (settingsData.isConfigured && settingsData.clientId && settingsData.clientSecret) {
      console.log(`✅ [GoogleConfig] Found config in integrationSettings/google for org: ${organizationId}`);
      
      // Decrypt client secret if encrypted
      let clientSecret = settingsData.clientSecret;
      if (clientSecret.includes(':')) {
        try {
          clientSecret = decryptToken(clientSecret);
        } catch (error) {
          console.warn('⚠️ [GoogleConfig] Failed to decrypt client secret, using as-is');
        }
      }
      
      return {
        clientId: settingsData.clientId,
        clientSecret: clientSecret,
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
        ]
      };
    }
  }

  // Priority 2: Read from integrationConfigs (alternative location)
  // Check for google_docs or google_drive type configs
  const configsSnapshot = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('integrationConfigs')
    .where('type', 'in', ['google_docs', 'google_drive'])
    .limit(1)
    .get();

  if (!configsSnapshot.empty) {
    const configDoc = configsSnapshot.docs[0];
    const data = configDoc.data();
    
    if (data.credentials?.clientId && data.credentials?.clientSecret) {
      console.log(`✅ [GoogleConfig] Found config in integrationConfigs for org: ${organizationId}`);
      
      // Decrypt client secret if encrypted
      let clientSecret = data.credentials.clientSecret;
      if (clientSecret.includes(':')) {
        try {
          clientSecret = decryptToken(clientSecret);
        } catch (error) {
          console.warn('⚠️ [GoogleConfig] Failed to decrypt client secret, using as-is');
        }
      }
      
      return {
        clientId: data.credentials.clientId,
        clientSecret: clientSecret,
        redirectUri: data.settings?.redirectUri || 'https://backbone-logic.web.app/integration-settings',
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
        ]
      };
    }
  }

  // Fallback to environment variables for backward compatibility
  let envClientId = process.env.GOOGLE_CLIENT_ID;
  let envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  let envRedirectUri = process.env.GOOGLE_REDIRECT_URI;

  // 🔥 CRITICAL FIX: Also check functions.config() for Firebase Functions v1 compatibility
  // This is where the credentials are actually stored in the current deployment
  if (!envClientId || !envClientSecret) {
    try {
      // Access v1 functions.config() - imported at top level
      const functionsConfig = functions.config();
      if (functionsConfig && functionsConfig.google) {
        envClientId = envClientId || functionsConfig.google.client_id;
        envClientSecret = envClientSecret || functionsConfig.google.client_secret;
        envRedirectUri = envRedirectUri || functionsConfig.google.redirect_uri;
        console.log(`🔍 [GoogleConfig] Found credentials in functions.config().google`);
      }
    } catch (error: any) {
      console.log(`⚠️ [GoogleConfig] functions.config() not available:`, error?.message || error);
    }
  }

  // NOTE: redirectUri should come from the client request, not env/config
  // This is a fallback only - the actual redirect URI is provided by the client
  envRedirectUri = envRedirectUri || 'https://backbone-logic.web.app/integration-settings';

  if (envClientId && envClientSecret) {
    console.log(`⚠️ [GoogleConfig] Using environment/functions.config variables (legacy mode) for org: ${organizationId}`);
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        // Google Calendar and Meet scopes
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/meetings.space.created',
        'https://www.googleapis.com/auth/meetings.space.readonly'
      ],
    };
  }

  console.warn(`⚠️ [GoogleConfig] No config found for org: ${organizationId}`);
  throw new HttpsError(
    'failed-precondition',
    'Google Drive integration not configured. Please configure in Integration Settings.'
  );
}

/**
 * Save Google Drive configuration to Firestore
 * Callable version (for backward compatibility)
 */
export const saveGoogleConfig = onCall(
  {
    region: 'us-central1',
    invoker: 'public', // Required for CORS preflight requests
    cors: true, // Enable CORS support
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    // Verify authentication
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, clientId, clientSecret, redirectUri } = data;

    if (!organizationId || !clientId || !clientSecret) {
      throw new HttpsError('invalid-argument', 'Missing required configuration fields');
    }

    console.log(`💾 [GoogleConfig] Saving config for org: ${organizationId} by user: ${auth.uid}`);

    try {
      // Check custom claims first (most reliable)
      const { getAuth } = await import('firebase-admin/auth');
      const adminAuth = getAuth();
      const userRecord = await adminAuth.getUser(auth.uid);
      const customClaims = userRecord.customClaims || {};
      const claimsRole = customClaims.role || customClaims.licensingRole;
      const isAdminFromClaims = customClaims.isAdmin === true || 
                                 customClaims.isOrganizationOwner === true ||
                                 (claimsRole && ['OWNER', 'ADMIN', 'SUPERADMIN', 'ORGANIZATION_OWNER'].includes(claimsRole.toUpperCase()));

      // Check teamMembers collection (primary source for org users)
      let userData: any = null;
      let userRole: string | null = null;
      
      const teamMemberQuery = await db.collection('teamMembers')
        .where('userId', '==', auth.uid)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();

      if (!teamMemberQuery.empty) {
        userData = teamMemberQuery.docs[0].data();
        userRole = userData.role;
      } else {
        // Fallback to users collection
        const userDoc = await db.collection('users').doc(auth.uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          userRole = userData?.role;
        }
      }

      // Verify user belongs to organization
      const userOrgId = customClaims.organizationId || userData?.organizationId;
      
      if (!userOrgId) {
        console.warn(`⚠️ [GoogleConfig] User ${auth.uid} has no organization ID in claims or database`);
        throw new HttpsError('permission-denied', 'User organization not found. Please ensure you are properly assigned to an organization.');
      }
      
      if (userOrgId !== organizationId) {
        console.warn(`⚠️ [GoogleConfig] User ${auth.uid} org mismatch: ${userOrgId} !== ${organizationId}`);
        throw new HttpsError('permission-denied', 'User does not belong to this organization');
      }

      // Check if user is admin (check custom claims first, then database)
      const isAdmin = isAdminFromClaims || 
                     (userRole && ['OWNER', 'ADMIN', 'SUPERADMIN', 'ORGANIZATION_OWNER'].includes(userRole.toUpperCase()));

      if (!isAdmin) {
        console.warn(`⚠️ [GoogleConfig] User ${auth.uid} is not admin. Claims: ${JSON.stringify(customClaims)}, DB role: ${userRole}`);
        throw new HttpsError('permission-denied', 'Only organization admins can configure integrations');
      }
      
      console.log(`✅ [GoogleConfig] User ${auth.uid} verified as admin for org ${organizationId}`);

      // Encrypt sensitive fields
      const encryptedClientSecret = encryptToken(clientSecret);

      // Save configuration
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .set({
          clientId,
          clientSecret: encryptedClientSecret,
          redirectUri: redirectUri || 'https://backbone-logic.web.app/integration-settings',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            // Google Calendar and Meet scopes
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/meetings.space.created',
            'https://www.googleapis.com/auth/meetings.space.readonly'
          ],
          isConfigured: true,
          configuredBy: auth.uid,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [GoogleConfig] Config saved successfully for org: ${organizationId}`);

      return {
        success: true,
        message: 'Google Drive configuration saved successfully',
      };

    } catch (error) {
      console.error(`❌ [GoogleConfig] Error saving config:`, error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', 'Failed to save Google Drive configuration');
    }
  }
);

/**
 * Save Google Drive configuration to Firestore - HTTP version with CORS support
 * Use this version when calling from frontend to avoid CORS issues
 */
export const saveGoogleConfigHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    // Set CORS headers first (before any errors)
    const { setCorsHeaders } = await import('../shared/utils');
    try {
      setCorsHeaders(req, res);
    } catch (corsError) {
      console.warn('⚠️ [GoogleConfig] Error setting CORS headers:', corsError);
      // Set basic CORS headers manually
      const origin = req.headers.origin;
      if (origin) {
        res.set('Access-Control-Allow-Origin', origin);
      }
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Max-Age', '3600');
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method Not Allowed' });
      return;
    }

    try {
      // Verify user authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const { getAuth } = await import('firebase-admin/auth');
      const auth = getAuth();
      const decodedToken = await auth.verifyIdToken(token);
      const userId = decodedToken.uid;

      const { organizationId, clientId, clientSecret, redirectUri } = req.body;

      if (!organizationId || !clientId || !clientSecret) {
        res.status(400).json({ success: false, error: 'Missing required configuration fields' });
        return;
      }

      console.log(`💾 [GoogleConfig] Saving config (HTTP) for org: ${organizationId} by user: ${userId}`);

      // Check custom claims first (most reliable)
      const userRecord = await auth.getUser(userId);
      const customClaims = userRecord.customClaims || {};
      const claimsRole = customClaims.role || customClaims.licensingRole;
      const isAdminFromClaims = customClaims.isAdmin === true || 
                                 customClaims.isOrganizationOwner === true ||
                                 (claimsRole && ['OWNER', 'ADMIN', 'SUPERADMIN', 'ORGANIZATION_OWNER'].includes(claimsRole.toUpperCase()));

      // Check teamMembers collection (primary source for org users)
      let userData: any = null;
      let userRole: string | null = null;
      
      const teamMemberQuery = await db.collection('teamMembers')
        .where('userId', '==', userId)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();

      if (!teamMemberQuery.empty) {
        userData = teamMemberQuery.docs[0].data();
        userRole = userData.role;
      } else {
        // Fallback to users collection
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          userRole = userData?.role;
        }
      }

      // Verify user belongs to organization
      // Check custom claims first, then database
      const userOrgId = customClaims.organizationId || userData?.organizationId;
      
      if (!userOrgId) {
        console.warn(`⚠️ [GoogleConfig] User ${userId} has no organization ID in claims or database`);
        res.status(403).json({ success: false, error: 'User organization not found. Please ensure you are properly assigned to an organization.' });
        return;
      }
      
      if (userOrgId !== organizationId) {
        console.warn(`⚠️ [GoogleConfig] User ${userId} org mismatch: ${userOrgId} !== ${organizationId}`);
        res.status(403).json({ success: false, error: 'User does not belong to this organization' });
        return;
      }

      // Check if user is admin (check custom claims first, then database)
      const isAdmin = isAdminFromClaims || 
                     (userRole && ['OWNER', 'ADMIN', 'SUPERADMIN', 'ORGANIZATION_OWNER'].includes(userRole.toUpperCase()));

      if (!isAdmin) {
        console.warn(`⚠️ [GoogleConfig] User ${userId} is not admin. Claims: ${JSON.stringify(customClaims)}, DB role: ${userRole}`);
        res.status(403).json({ success: false, error: 'Only organization admins can configure integrations' });
        return;
      }
      
      console.log(`✅ [GoogleConfig] User ${userId} verified as admin for org ${organizationId}`);

      // Encrypt sensitive fields
      const encryptedClientSecret = encryptToken(clientSecret);

      // Save configuration
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .set({
          clientId,
          clientSecret: encryptedClientSecret,
          redirectUri: redirectUri || 'https://backbone-logic.web.app/integration-settings',
          scopes: [
            'https://www.googleapis.com/auth/drive.readonly',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
            // Google Calendar and Meet scopes
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/meetings.space.created',
            'https://www.googleapis.com/auth/meetings.space.readonly'
          ],
          isConfigured: true,
          configuredBy: userId,
          configuredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

      console.log(`✅ [GoogleConfig] Config saved successfully (HTTP) for org: ${organizationId}`);

      res.status(200).json({
        success: true,
        message: 'Google Drive configuration saved successfully',
      });

    } catch (error: any) {
      console.error(`❌ [GoogleConfig] Error saving config (HTTP):`, error);

      // Ensure CORS headers are set even on error
      try {
        setCorsHeaders(req, res);
      } catch (corsError) {
        // If setCorsHeaders fails, set basic CORS manually
        const origin = req.headers.origin;
        if (origin) {
          res.set('Access-Control-Allow-Origin', origin);
        }
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      }

      const errorMessage = error.message || 'Failed to save Google Drive configuration';
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }
);

/**
 * Get Google Drive configuration status
 */
export const getGoogleConfigStatus = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    const { auth, data } = request;

    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId } = data;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    try {
      // Check integrationSettings/google first (explicit configuration)
      const configDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('google')
        .get();

      if (configDoc.exists) {
        const config = configDoc.data()!;
        return {
          isConfigured: config.isConfigured || false,
          clientId: config.clientId ? config.clientId.substring(0, 20) + '...' : null,
          configuredAt: config.configuredAt || null,
          configuredBy: config.configuredBy || null,
          source: 'firestore',
        };
      }

      // Fallback 1: Check cloudIntegrations/google (OAuth tokens from OAuth flow)
      const cloudIntegrationDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('google')
        .get();

      if (cloudIntegrationDoc.exists) {
        const cloudData = cloudIntegrationDoc.data()!;
        // Check if connection is active (isActive !== false)
        const isActive = cloudData.isActive !== false;
        const hasTokens = !!(cloudData.tokens || cloudData.encryptedTokens || cloudData.accessToken || cloudData.refreshToken);

        if (isActive && hasTokens) {
          console.log(`✅ [GoogleConfig] Found active connection in cloudIntegrations/google for org: ${organizationId}`);
          return {
            isConfigured: true,
            clientId: null, // OAuth tokens don't include client ID
            configuredAt: cloudData.createdAt || cloudData.updatedAt || null,
            configuredBy: null, // OAuth flow doesn't track configuredBy
            source: 'cloudIntegrations',
            accountEmail: cloudData.accountEmail || null,
            accountName: cloudData.accountName || null,
          };
        } else {
          console.log(`⚠️ [GoogleConfig] cloudIntegrations/google exists but not active or missing tokens for org: ${organizationId}`);
        }
      }

      // Fallback 2: Check environment variables
      const hasEnvConfig = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      return {
        isConfigured: hasEnvConfig,
        clientId: hasEnvConfig ? process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...' : null,
        configuredAt: null,
        configuredBy: null,
        source: hasEnvConfig ? 'environment' : 'none',
      };

    } catch (error) {
      console.error(`❌ [GoogleConfig] Error fetching config status:`, error);
      throw new HttpsError('internal', 'Failed to fetch Google Drive configuration status');
    }
  }
);

