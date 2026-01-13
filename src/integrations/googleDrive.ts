/**
 * Google Drive Integration Service
 * 
 * Handles OAuth authentication and API operations for Google Drive
 * Provides server-side OAuth flow with secure token management
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './encryption';
import { encryptToken, decryptToken } from './unified-oauth/encryption';
import { createSuccessResponse, createErrorResponse, db, getUserOrganizationId } from '../shared/utils';
import { getGoogleConfig as getGoogleConfigFromFirestore } from '../google/config';
import { encryptionKey } from '../google/secrets';

// Google OAuth configuration - Use environment variables (Firebase Functions v2 compatible)
const getGoogleConfig = () => {
  // Try environment variables first (Firebase Functions v2)
  let configClientId: string | undefined;
  let configClientSecret: string | undefined;
  let configRedirectUri: string | undefined;

  try {
    // Try functions.config() for backward compatibility (may not be available in v2)
    const config = functions.config();
    configClientId = config.google?.client_id;
    configClientSecret = config.google?.client_secret;
    configRedirectUri = config.google?.redirect_uri;
  } catch (error) {
    // functions.config() not available (Firebase Functions v2) - use environment variables only
    console.log('[googleDrive] functions.config() not available, using environment variables only');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || configClientId;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || configClientSecret;
  // NOTE: redirectUri is now always provided by the client request, not from env/config
  // This allows dynamic redirect URIs for dev (localhost) vs production
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || configRedirectUri || 'https://backbone-logic.web.app/dashboard/integrations';

  // Log config source for debugging
  console.log('[googleDrive] getGoogleConfig:', {
    hasEnvClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasConfigClientId: !!configClientId,
    clientIdSource: process.env.GOOGLE_CLIENT_ID ? 'env' : (configClientId ? 'config' : 'none'),
    clientIdPrefix: clientId ? clientId.substring(0, 30) + '...' : 'missing',
    hasClientSecret: !!clientSecret,
    redirectUriSource: process.env.GOOGLE_REDIRECT_URI ? 'env' : (configRedirectUri ? 'config' : 'default')
  });

  return { clientId, clientSecret, redirectUri };
};

// OAuth2 client - Create lazily to avoid module-level config access
let oauth2Client: any = null;

// Get OAuth2 client for credential operations (refresh, API calls) - redirect URI not needed
const getOAuth2ClientForCredentials = () => {
  const config = getGoogleConfig();

  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth client ID and secret must be configured');
  }

  // For credential operations, redirect URI doesn't matter - use a dummy value
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    'http://localhost' // Dummy redirect URI for credential operations only
  );
};

// Get OAuth2 client for OAuth flows (initiation, token exchange) - redirect URI REQUIRED
const getOAuth2Client = (redirectUri: string) => {
  const config = getGoogleConfig();

  // CRITICAL: redirectUri is REQUIRED - no fallbacks
  if (!redirectUri) {
    throw new Error('redirectUri is required for OAuth2 client creation');
  }

  // Validate config with detailed error messages
  if (!config.clientId || !config.clientSecret) {
    const errorDetails = {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasEnvClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasEnvClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      clientIdLength: config.clientId?.length || 0,
      clientSecretLength: config.clientSecret?.length || 0,
      redirectUri: redirectUri
    };

    console.error('[googleDrive] OAuth config error:', errorDetails);

    const errorMsg = 'Google OAuth client ID and secret must be configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables in Firebase Functions, or use firebase functions:config:set google.client_id="..." google.client_secret="...".';
    throw new Error(errorMsg);
  }

  // Validate client ID format (should be a Google OAuth client ID)
  if (!config.clientId.includes('.apps.googleusercontent.com') && !config.clientId.includes('googleusercontent')) {
    console.warn('[googleDrive] Client ID format may be incorrect:', {
      clientId: config.clientId.substring(0, 20) + '...',
      expectedFormat: '*.apps.googleusercontent.com'
    });
  }

  // Always create a new instance to ensure fresh config
  // This prevents issues with stale client instances
  oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri
  );

  console.log('[googleDrive] OAuth2 client created:', {
    hasClientId: !!config.clientId,
    hasClientSecret: !!config.clientSecret,
    redirectUri: redirectUri,
    redirectUriSource: 'provided',
    clientIdPrefix: config.clientId.substring(0, 20) + '...'
  });

  return oauth2Client;
};

// Google API scopes (Drive + Calendar for video conferencing)
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly'
];

/**
 * Initiate Google OAuth flow
 * Returns authorization URL for user to authenticate
 */
// HTTP version for CORS support
export const initiateGoogleOAuthHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173',
    'null'
  ];

  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
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
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    const organizationId = decodedToken.organizationId || 'default';

    // Get redirect URI from request body
    const { redirectUri } = req.body || {};

    // CRITICAL: redirectUri is REQUIRED - no fallbacks
    if (!redirectUri) {
      res.status(400).json({
        success: false,
        error: 'redirectUri is required in request body'
      });
      return;
    }

    const finalRedirectUri = redirectUri.trim();

    // Get OAuth credentials from Firestore (integrationSettings/google)
    // This ensures we use the correct OAuth client ID that has the redirect URIs configured
    let googleConfig;
    try {
      googleConfig = await getGoogleConfigFromFirestore(organizationId);
      console.log('[googleDrive] ✅ Using Firestore config for OAuth:', {
        hasClientId: !!googleConfig.clientId,
        hasClientSecret: !!googleConfig.clientSecret,
        clientId: googleConfig.clientId, // Full client ID for debugging
        clientIdPrefix: googleConfig.clientId?.substring(0, 20) + '...',
        redirectUri: finalRedirectUri, // Full redirect URI for debugging
        redirectUriLength: finalRedirectUri.length,
        origin: req.headers.origin,
        organizationId: organizationId
      });
    } catch (configError: any) {
      console.error('[googleDrive] Failed to get Firestore config, falling back to environment variables:', configError);
      // Fallback to environment variables if Firestore config not found
      const fallbackConfig = getGoogleConfig();
      if (!fallbackConfig.clientId || !fallbackConfig.clientSecret) {
        res.status(400).json({
          success: false,
          error: 'Google OAuth not configured. Please configure in Integration Settings.'
        });
        return;
      }
      googleConfig = fallbackConfig;
    }

    // Use client ID/secret from Firestore config (or fallback)
    const clientId = googleConfig.clientId;
    const clientSecret = googleConfig.clientSecret;

    console.log('[googleDrive] 📋 OAuth initiation request details:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientId: clientId, // Full client ID for debugging
      clientIdPrefix: clientId?.substring(0, 20) + '...',
      redirectUri: finalRedirectUri, // Full redirect URI for debugging
      redirectUriLength: finalRedirectUri.length,
      origin: req.headers.origin,
      organizationId: organizationId,
      configSource: googleConfig === getGoogleConfig() ? 'environment' : 'firestore',
      action: '⚠️ VERIFY: This client ID must have this exact redirect URI in Google Cloud Console!'
    });

    // Generate secure state parameter
    const state = generateSecureState();

    // Store state in Firestore for verification (including redirect URI - CRITICAL for token exchange)
    const stateDocData = {
      userId,
      organizationId,
      provider: 'google',
      redirectUri: finalRedirectUri, // Store the EXACT redirect URI used in auth URL
      // Store client credentials with state if provided (for user-specific OAuth clients)
      clientId: clientId || null,
      clientSecret: clientSecret || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10 minutes
    };

    await db
      .collection('oauthStates')
      .doc(state)
      .set(stateDocData);

    console.log('[googleDrive] State document stored with redirectUri:', {
      state: state.substring(0, 20) + '...',
      redirectUri: finalRedirectUri.substring(0, 50) + '...'
    });

    // Verify the state document was created (with retry logic for eventual consistency)
    // This prevents race conditions where the callback reads the state before it's fully written
    let verifyStateDoc = await db
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!verifyStateDoc.exists) {
      console.warn('[googleDrive] State document not found immediately, retrying for eventual consistency...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      verifyStateDoc = await db
        .collection('oauthStates')
        .doc(state)
        .get();
    }

    if (!verifyStateDoc.exists) {
      console.error('[googleDrive] CRITICAL: State document not found after retry!');
      throw new Error('Failed to create OAuth state document - document not found after creation');
    }

    console.log('[googleDrive] State document verified in Firestore:', {
      state: state.substring(0, 20) + '...',
      hasRedirectUri: !!verifyStateDoc.data()?.redirectUri
    });

    // Create OAuth2 client using Firestore config (or fallback)
    // CRITICAL: Must use the SAME redirectUri that will be used in token exchange
    // CRITICAL: Must use the OAuth client ID from Firestore that has the redirect URIs configured
    if (!clientId || !clientSecret) {
      res.status(400).json({
        success: false,
        error: 'Google OAuth client ID and secret are required. Please configure in Integration Settings.'
      });
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      finalRedirectUri // Use the exact redirect URI from request
    );

    console.log('[googleDrive] Created OAuth2 client:', {
      clientIdPrefix: clientId.substring(0, 20) + '...',
      clientIdFull: clientId, // Log full client ID for debugging
      redirectUri: finalRedirectUri,
      redirectUriLength: finalRedirectUri.length,
      configSource: googleConfig === getGoogleConfig() ? 'environment' : 'firestore',
      organizationId: organizationId
    });

    // Generate authorization URL - OAuth2 client will use the redirectUri it was created with
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });

    // Verify the redirect URI in the auth URL matches what we stored
    // Also store it in the state document for use during token exchange
    let decodedAuthRedirectUri: string | null = null;
    try {
      const authUrlObj = new URL(authUrl);
      const authUrlRedirectUri = authUrlObj.searchParams.get('redirect_uri');
      decodedAuthRedirectUri = authUrlRedirectUri ? decodeURIComponent(authUrlRedirectUri) : null;

      console.log('[googleDrive] ⚠️ CRITICAL DEBUG - Authorization URL generated:', {
        redirectUriInAuthUrl: decodedAuthRedirectUri, // Full URI for debugging
        storedRedirectUri: finalRedirectUri, // Full URI for debugging
        matches: decodedAuthRedirectUri === finalRedirectUri,
        clientId: clientId, // Full client ID for debugging
        organizationId: organizationId,
        origin: req.headers.origin,
        errorMessage: decodedAuthRedirectUri !== finalRedirectUri ? 'REDIRECT URI MISMATCH IN AUTH URL!' : 'OK'
      });

      // CRITICAL: If redirect URIs don't match, log error
      if (decodedAuthRedirectUri && decodedAuthRedirectUri !== finalRedirectUri) {
        console.error('[googleDrive] ❌ CRITICAL ERROR: Redirect URI mismatch detected!', {
          authUrlRedirectUri: decodedAuthRedirectUri,
          storedRedirectUri: finalRedirectUri,
          difference: 'The redirect URI in the auth URL does not match what was requested!',
          clientId: clientId,
          action: 'Check Google Cloud Console - ensure this exact redirect URI is authorized for this OAuth client ID'
        });
      }

      if (decodedAuthRedirectUri && decodedAuthRedirectUri !== finalRedirectUri) {
        console.error('[googleDrive] CRITICAL: Redirect URI mismatch!', {
          authUrlRedirectUri: decodedAuthRedirectUri,
          storedRedirectUri: finalRedirectUri,
          difference: 'Redirect URIs do not match - token exchange will fail!'
        });
      }

      // Update state document with the actual redirect URI from auth URL (source of truth)
      if (decodedAuthRedirectUri) {
        await db
          .collection('oauthStates')
          .doc(state)
          .update({
            authUrlRedirectUri: decodedAuthRedirectUri
          });
        console.log('[googleDrive] Updated state document with authUrlRedirectUri:', {
          authUrlRedirectUri: decodedAuthRedirectUri.substring(0, 50) + '...'
        });
      }
    } catch (urlError) {
      console.warn('[googleDrive] Could not parse auth URL to verify redirect URI:', urlError);
    }

    console.log(`Google OAuth initiated for user ${hashForLogging(userId)} in org ${organizationId}`, {
      redirectUri: finalRedirectUri || 'default',
      authUrlLength: authUrl.length
    });

    res.status(200).json({
      success: true,
      authUrl,
      state
    });

  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Google OAuth',
      errorDetails: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// REMOVED: Callable version - using HTTP version only for simplicity

/**
 * Handle Google OAuth callback (HTTP version for frontend)
 * Exchange authorization code for tokens
 */
export const handleGoogleOAuthCallbackHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (req, res) => {
    try {
      // Get auth token from header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      const organizationId = (decodedToken as any).organizationId || 'default';

      // Get code, state, and client credentials from request body
      const { code, state, clientId, clientSecret } = req.body || {};

      if (!code || !state) {
        res.status(400).json({
          success: false,
          error: 'Authorization code and state are required'
        });
        return;
      }

      // Verify state parameter
      const stateDoc = await admin.firestore()
        .collection('oauthStates')
        .doc(state)
        .get();

      if (!stateDoc.exists) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired state parameter'
        });
        return;
      }

      const stateData = stateDoc.data();
      const storedUserId = stateData?.userId;
      const storedOrganizationId = stateData?.organizationId;

      // Verify user matches state
      if (storedUserId !== userId || storedOrganizationId !== organizationId) {
        res.status(403).json({
          success: false,
          error: 'State parameter does not match current user'
        });
        return;
      }

      // Get redirectUri and client credentials from state (prefer authUrlRedirectUri - it's the source of truth)
      const { redirectUri: requestRedirectUri } = req.body || {};

      // CRITICAL: Use authUrlRedirectUri if available (it's the exact URI from the Google auth URL)
      // Otherwise fall back to storedRedirectUri, then requestRedirectUri
      const finalRedirectUri = stateData?.authUrlRedirectUri?.trim() ||
        stateData?.redirectUri?.trim() ||
        requestRedirectUri?.trim();

      const storedClientId = stateData?.clientId || clientId;
      const storedClientSecret = stateData?.clientSecret || clientSecret;

      // CRITICAL: redirectUri is REQUIRED - no fallbacks
      if (!finalRedirectUri) {
        res.status(400).json({
          success: false,
          error: 'Redirect URI not found in state document or request body'
        });
        return;
      }

      console.log('[googleDrive] OAuth callback processing (HTTP):', {
        hasAuthUrlRedirectUri: !!stateData?.authUrlRedirectUri,
        hasStoredRedirectUri: !!stateData?.redirectUri,
        hasRequestRedirectUri: !!requestRedirectUri,
        finalRedirectUri: finalRedirectUri.substring(0, 50) + '...',
        hasStoredClientId: !!storedClientId,
        hasStoredClientSecret: !!storedClientSecret,
        userId: hashForLogging(userId),
        organizationId
      });

      // Clean up state document
      await stateDoc.ref.delete();

      // Create OAuth2 client - use stored/client credentials if available, otherwise use config
      let oauth2Client;
      let usedClientId = '';
      let usedClientSecret = '';

      if (storedClientId && storedClientSecret) {
        // Use client credentials from state or request (user-specific OAuth clients)
        oauth2Client = new google.auth.OAuth2(
          storedClientId,
          storedClientSecret,
          finalRedirectUri
        );
        usedClientId = storedClientId;
        usedClientSecret = storedClientSecret;
        console.log('[googleDrive] Using client credentials from state/request');
      } else {
        // Use Firebase Functions config credentials (default)
        const config = getGoogleConfig();
        if (!config.clientId || !config.clientSecret) {
          throw new Error('Google OAuth credentials missing in configuration');
        }
        usedClientId = config.clientId;
        usedClientSecret = config.clientSecret;

        oauth2Client = new google.auth.OAuth2(
          config.clientId,
          config.clientSecret,
          finalRedirectUri
        );
        console.log('[googleDrive] Using Firebase Functions config credentials');
      }

      // LOGGING CRITICAL CREDENTIALS (MASKED)
      console.log('[googleDrive] Ready for token exchange:', {
        redirectUri: finalRedirectUri,
        clientIdPrefix: usedClientId ? usedClientId.substring(0, 10) + '...' : 'MISSING',
        clientSecretLength: usedClientSecret ? usedClientSecret.length : 0,
        hasCode: !!code
      });

      // Exchange code for tokens
      // CRITICAL: Explicitly include client_id and client_secret in options
      // This fixes "Request is missing required authentication credential" error
      const tokenOptions: any = {
        code,
        redirect_uri: finalRedirectUri,
        client_id: usedClientId,
        client_secret: usedClientSecret
      };

      console.log('[googleDrive] calling oauth2Client.getToken with options (masked):', {
        ...tokenOptions,
        client_id: tokenOptions.client_id ? '***' : 'missing',
        client_secret: tokenOptions.client_secret ? '***' : 'missing',
        code: '***'
      });

      const tokenResponse = await oauth2Client.getToken(tokenOptions);
      const tokens = tokenResponse.tokens;

      console.log('[googleDrive] Token exchange successful, tokens received:', {
        hasAccessToken: !!tokens?.access_token,
        accessTokenLength: tokens?.access_token?.length || 0,
        accessTokenPrefix: tokens?.access_token ? tokens.access_token.substring(0, 20) + '...' : 'MISSING',
        hasRefreshToken: !!tokens?.refresh_token,
        expiryDate: tokens?.expiry_date,
        scope: tokens?.scope,
        tokenType: tokens?.token_type,
        allTokenKeys: tokens ? Object.keys(tokens) : [],
        fullTokensObject: tokens ? JSON.stringify(tokens).substring(0, 200) + '...' : 'null'
      });

      if (!tokens || !tokens.access_token) {
        console.error('[googleDrive] CRITICAL: No access_token in tokens!', {
          hasTokens: !!tokens,
          tokensType: typeof tokens,
          tokensKeys: tokens ? Object.keys(tokens) : [],
          fullResponse: JSON.stringify(tokenResponse)
        });
        throw new Error('Token exchange succeeded but no access_token received. Tokens: ' + JSON.stringify(tokens));
      }

      // Validate access token format (should be a non-empty string)
      if (typeof tokens.access_token !== 'string' || tokens.access_token.trim().length === 0) {
        throw new Error(`Invalid access_token format: ${typeof tokens.access_token}, value: ${tokens.access_token}`);
      }

      // Get user info - set credentials on OAuth2 client and use google.oauth2 API
      console.log('[googleDrive] Setting credentials on OAuth2 client and fetching user info...');
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfoResponse = await oauth2.userinfo.get();
      const userInfo = userInfoResponse.data as { email: string; name: string; id?: string; picture?: string };

      console.log('[googleDrive] User info retrieved:', {
        email: userInfo.email,
        name: userInfo.name
      });

      // Store tokens in Firestore (encrypted) - UNIFIED OAUTH FORMAT
      // Store tokens as separate encrypted fields (accessToken, refreshToken) to match unified OAuth system
      // This ensures compatibility with refreshOAuthToken function
      const encryptedAccessToken = encryptToken(tokens.access_token!);
      const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined;

      const integrationDoc: any = {
        provider: 'google',
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        accountId: userInfo.id,
        // UNIFIED OAUTH FORMAT: Store tokens as separate encrypted fields
        accessToken: encryptedAccessToken,
        tokenExpiresAt: tokens.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiry_date)) : null,
        isActive: true, // Explicitly mark as active (required for client-side listener)
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        connectedBy: userId,
        lastRefreshedAt: admin.firestore.FieldValue.serverTimestamp(),
        organizationId,
        userId,
        // Legacy fields for backward compatibility
        clientId: usedClientId, // Store the client ID used to create these tokens (critical for token refresh)
        scopes: SCOPES, // Store the OAuth scopes that were granted (required for calendar permissions check)
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: tokens.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiry_date)) : null
      };

      // Only add refreshToken if it exists
      if (encryptedRefreshToken) {
        integrationDoc.refreshToken = encryptedRefreshToken;
      }

      // Create standardized encryptedTokens field (for unified refresh functionality)
      try {
        const unifiedTokens = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || '',
          expiresAt: tokens.expiry_date || null
        };
        integrationDoc.encryptedTokens = encryptTokens(unifiedTokens);
        console.log('[googleDrive] ✅ Created standardized encryptedTokens field');
      } catch (encryptError) {
        console.warn('[googleDrive] ⚠️ Failed to create encryptedTokens field:', encryptError);
      }

      // Store in organization-scoped collection for team-wide access
      // Use org-level document ID (google) so all users in the org can share the same credentials
      // CRITICAL: Use merge: true to avoid wiping existing refreshToken if not provided in this flow
      await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('google')
        .set(integrationDoc, { merge: true });

      // Also create connection record for tracking team members' Drive connections
      await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('driveConnections')
        .doc(userId)
        .set({
          userId,
          accountEmail: userInfo.email,
          accountName: userInfo.name,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true
        });

      console.log(`Google OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}, account: ${userInfo.email}`);

      res.status(200).json({
        success: true,
        data: {
          accountEmail: userInfo.email,
          accountName: userInfo.name
        }
      });

    } catch (error) {
      console.error('Google OAuth callback failed (HTTP):', error);
      res.status(500).json({
        success: false,
        error: 'Failed to complete Google OAuth',
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

/**
 * HTTP endpoint to refresh Google access token
 */
export const refreshGoogleAccessTokenHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4001',
    'http://localhost:4003',
    'http://localhost:4010',
    'http://localhost:5173',
    'null'
  ];

  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('⚠️ [refreshGoogleAccessTokenHttp] Missing or invalid Authorization header');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorDetails: 'Missing or invalid Authorization header. Please ensure you are logged in.'
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token) {
      console.warn('⚠️ [refreshGoogleAccessTokenHttp] Empty token in Authorization header');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorDetails: 'Empty token in Authorization header'
      });
      return;
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (verifyError: any) {
      console.error('❌ [refreshGoogleAccessTokenHttp] Token verification failed:', verifyError);
      const errorMessage = verifyError?.message || String(verifyError);

      // Check for specific Firebase Auth errors
      if (errorMessage.includes('expired') || errorMessage.includes('Expired')) {
        res.status(401).json({
          success: false,
          error: 'Token expired',
          errorDetails: 'Firebase authentication token has expired. Please refresh your session.',
          requiresReconnection: false
        });
        return;
      } else if (errorMessage.includes('invalid') || errorMessage.includes('Invalid')) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          errorDetails: 'Firebase authentication token is invalid. Please log in again.',
          requiresReconnection: false
        });
        return;
      }

      // Generic auth error
      res.status(401).json({
        success: false,
        error: 'Authentication failed',
        errorDetails: `Token verification failed: ${errorMessage}`
      });
      return;
    }

    const userId = decodedToken.uid;
    console.log('✅ [refreshGoogleAccessTokenHttp] Token verified for user:', userId);

    // Get organization ID using helper function (checks multiple sources)
    const organizationId = await getUserOrganizationId(userId, decodedToken.email || '');

    if (!organizationId) {
      console.warn('⚠️ [refreshGoogleAccessTokenHttp] User organization not found for user:', userId);
      res.status(403).json({
        success: false,
        error: 'User organization not found',
        errorDetails: 'User must be associated with an organization to refresh Google Drive tokens'
      });
      return;
    }

    console.log('🔄 [refreshGoogleAccessTokenHttp] Refreshing Google access token for org:', organizationId);
    // Call internal refresh function
    const tokens = await refreshGoogleAccessToken(userId, organizationId);

    res.status(200).json({
      success: true,
      data: {
        accessToken: tokens.access_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
      }
    });
  } catch (error) {
    console.error('Google token refresh failed:', error);

    // Determine appropriate status code based on error type
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let statusCode = 500;
    let errorType = 'Failed to refresh Google access token';

    // Check for token-related errors (should return 401)
    // These indicate the refresh token is invalid, expired, or revoked
    if (errorMessage.includes('Token has been expired or revoked') ||
      errorMessage.includes('invalid_grant') ||
      errorMessage.includes('refresh token is invalid') ||
      errorMessage.includes('refresh token is invalid or revoked') ||
      errorMessage.includes('Google integration not found')) {
      statusCode = 401;
      errorType = 'Google token invalid or expired';
    }
    // Check for configuration errors (should return 400)
    // These indicate OAuth client configuration issues
    else if (errorMessage.includes('Invalid OAuth client configuration') ||
      errorMessage.includes('invalid_client') ||
      errorMessage.includes('OAuth client was not found')) {
      statusCode = 400;
      errorType = 'OAuth configuration error';
    }
    // Check for organization errors (should return 403)
    else if (errorMessage.includes('organization')) {
      statusCode = 403;
      errorType = 'Organization access error';
    }

    // Preserve the full error message for diagnostics
    // The frontend can use errorDetails to show more helpful messages
    res.status(statusCode).json({
      success: false,
      error: errorType,
      errorDetails: errorMessage,
      // Include additional context for debugging
      requiresReconnection: statusCode === 401 && (
        errorMessage.includes('refresh token is invalid') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('Token has been expired or revoked')
      )
    });
  }
});

/**
 * Callable function to refresh Google access token
 * This avoids console errors from HTTP 401 responses
 * Uses v2 API with CORS support for localhost development
 */
export const refreshGoogleAccessTokenCallable = onCall(
  {
    region: 'us-central1',
    cors: true, // Enable CORS support for localhost
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError(
          'unauthenticated',
          'Authentication required',
          'User must be authenticated to refresh Google Drive token'
        );
      }

      const userId = request.auth.uid;

      // Get organization ID from token claims or fetch from user document
      const organizationId = request.auth.token.organizationId ||
        await getUserOrganizationId(userId, request.auth.token.email || '');

      if (!organizationId) {
        throw new HttpsError(
          'permission-denied',
          'User organization not found',
          'User must be associated with an organization to refresh Google Drive tokens'
        );
      }

      console.log('🔄 [refreshGoogleAccessTokenCallable] Refreshing Google access token for org:', organizationId);

      // Call internal refresh function
      const tokens = await refreshGoogleAccessToken(userId, organizationId);

      return {
        success: true,
        data: {
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
        }
      };
    } catch (error: any) {
      console.error('❌ [refreshGoogleAccessTokenCallable] Token refresh failed:', error);

      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check for token-related errors (should return unauthenticated or failed-precondition)
      if (errorMessage.includes('Token has been expired or revoked') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('refresh token is invalid') ||
        errorMessage.includes('refresh token is invalid or revoked') ||
        errorMessage.includes('Google integration not found') ||
        errorMessage.includes('No refresh token available') ||
        errorMessage.includes('No tokens found')) {
        throw new HttpsError(
          'failed-precondition',
          'No refresh token available. Please reconnect the integration.',
          errorMessage
        );
      }

      // Check for configuration errors
      if (errorMessage.includes('Invalid OAuth client configuration') ||
        errorMessage.includes('invalid_client') ||
        errorMessage.includes('OAuth client was not found')) {
        throw new HttpsError(
          'invalid-argument',
          'OAuth configuration error',
          errorMessage
        );
      }

      // Check for organization errors
      if (errorMessage.includes('organization')) {
        throw new HttpsError(
          'permission-denied',
          'Organization access error',
          errorMessage
        );
      }

      // Generic error
      throw new HttpsError(
        'internal',
        'Failed to refresh Google access token',
        errorMessage
      );
    }
  }
);

/**
 * Refresh Google access token (internal function)
 */
export async function refreshGoogleAccessToken(userId: string, organizationId: string): Promise<any> {
  try {
    // Try new org-level location first (organizations/{orgId}/cloudIntegrations/google)
    // This allows all users in the organization to share the same Google Drive credentials
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('google')
      .get();

    // Fallback to old user-specific location for migration compatibility
    if (!integrationDoc.exists) {
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(`google_${userId}`)
        .get();
    }

    // Fallback to old global location for migration compatibility
    if (!integrationDoc.exists) {
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${organizationId}_google_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      console.log('[googleDrive] Integration document not found, cannot refresh token');
      throw new Error('Google integration not found. The integration may have been deleted.');
    }

    const integrationData = integrationDoc.data();

    // Handle both encrypted tokens (from OAuth callback) and plain tokens (from frontend save)
    let tokens: any;
    // Check for tokens field first (used by OAuth callback handler)
    const tokensField = integrationData?.tokens;
    // Also check for encryptedTokens field (legacy/alternative format)
    const encryptedTokens = integrationData?.encryptedTokens;
    const plainAccessToken = integrationData?.accessToken;
    const plainRefreshToken = integrationData?.refreshToken;

    if (tokensField) {
      // Decrypt tokens from 'tokens' field (used by OAuth callback)
      tokens = decryptTokens(tokensField);
    } else if (encryptedTokens) {
      // Decrypt tokens from 'encryptedTokens' field (legacy format)
      tokens = decryptTokens(encryptedTokens);
    } else if (plainAccessToken && plainRefreshToken) {
      // Use tokens if available (decrypt if they are in encrypted format)
      let accessToken = plainAccessToken;
      let refreshToken = plainRefreshToken;

      // Check if tokens are encrypted (colon-hex format from singular encryptToken)
      if (typeof accessToken === 'string' && accessToken.includes(':')) {
        try {
          accessToken = decryptToken(accessToken);
        } catch (e) {
          console.warn('[googleDrive] Failed to decrypt accessToken field, using as-is');
        }
      }

      if (typeof refreshToken === 'string' && refreshToken.includes(':')) {
        try {
          refreshToken = decryptToken(refreshToken);
        } catch (e) {
          console.warn('[googleDrive] Failed to decrypt refreshToken field, using as-is');
        }
      }

      tokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: integrationData?.expiresAt?.toDate?.()?.getTime() || null
      };
    } else {
      throw new Error('No tokens found for Google integration');
    }

    // --- OPTIMIZATION: Check if token is still valid ---
    const now = Date.now();
    const expiryDate = tokens.expiry_date;
    const buffer = 5 * 60 * 1000; // 5 minute buffer

    if (tokens.access_token && expiryDate && (now < (expiryDate - buffer))) {
      console.log(`[googleDrive] ✅ Access token is still valid (expires in ${Math.round((expiryDate - now) / 60000)}m), skipping refresh`);
      return tokens;
    }

    if (tokens.access_token && !expiryDate) {
      console.warn('[googleDrive] ⚠️ Access token exists but no expiry date found, proceeding with refresh for safety');
    }

    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Set credentials and refresh
    // IMPORTANT: Get a fresh OAuth client instance to ensure it has the correct client ID/secret
    // FIX: Use Firestore config instead of global environment/config variables
    let oauth2Client;
    try {
      const googleConfig = await getGoogleConfigFromFirestore(organizationId);
      console.log('[googleDrive] Using Firestore config for token refresh:', {
        clientIdPrefix: googleConfig.clientId ? googleConfig.clientId.substring(0, 20) + '...' : 'missing',
        redirectUri: googleConfig.redirectUri
      });

      oauth2Client = new google.auth.OAuth2(
        googleConfig.clientId,
        googleConfig.clientSecret,
        googleConfig.redirectUri
      );
    } catch (configError) {
      console.warn('[googleDrive] Firestore config lookup failed, falling back to global config:', configError);
      oauth2Client = getOAuth2ClientForCredentials();
    }

    // Validate we have a refresh token
    if (!tokens.refresh_token) {
      throw new Error('No refresh token available for token refresh');
    }

    // IMPORTANT: Refresh tokens are tied to the OAuth client that created them
    // If tokens were created with frontend client, we need to use the same client ID/secret
    // For now, we use the backend's OAuth client (which should match frontend's)
    // If refresh fails with invalid_client, it means the client IDs don't match

    // Set credentials on the client
    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
      // Include access token if available (though it may be expired)
      access_token: tokens.access_token || undefined
    });

    // Log the client ID being used for debugging
    // Access clientId safely depending on how the client was created
    const usedClientId = (oauth2Client as any)._clientId;
    console.log('[googleDrive] Attempting token refresh with client ID:', {
      clientIdPrefix: usedClientId ? usedClientId.substring(0, 20) + '...' : 'missing',
      hasRefreshToken: !!tokens.refresh_token,
      refreshTokenLength: tokens.refresh_token?.length || 0
    });

    // Refresh the access token with better error handling
    let credentials;
    try {
      const refreshResult = await oauth2Client.refreshAccessToken();
      credentials = refreshResult.credentials;
    } catch (refreshError: any) {
      // Provide more detailed error information
      const errorMessage = refreshError?.message || 'Unknown error';
      const errorCode = refreshError?.code;

      // Extract detailed error information from Google API response
      const responseData = refreshError?.response?.data || {};
      const googleError = responseData.error || errorCode;
      const googleErrorDescription = responseData.error_description || responseData.message || errorMessage;

      console.error('[googleDrive] Token refresh failed:', {
        error: errorMessage,
        code: errorCode,
        googleError: googleError,
        googleErrorDescription: googleErrorDescription,
        hasRefreshToken: !!tokens.refresh_token,
        refreshTokenLength: tokens.refresh_token?.length || 0,
        fullError: refreshError,
        response: responseData
      });

      // Check if it's an invalid_client error
      const isInvalidClient = errorMessage.includes('invalid_client') ||
        errorCode === 'invalid_client' ||
        googleError === 'invalid_client' ||
        errorMessage.includes('Invalid OAuth client configuration');

      // Check if it's a refresh token issue
      const isTokenError = googleError === 'invalid_grant' ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('Token has been expired or revoked') ||
        googleErrorDescription?.includes('Token has been expired or revoked');

      if (isInvalidClient || isTokenError) {
        const config = getGoogleConfig();
        const diagnosticInfo = {
          hasClientId: !!config.clientId,
          hasClientSecret: !!config.clientSecret,
          clientIdPrefix: config.clientId ? config.clientId.substring(0, 20) + '...' : 'missing',
          redirectUri: config.redirectUri,
          hasRefreshToken: !!tokens.refresh_token,
          refreshTokenLength: tokens.refresh_token?.length || 0,
          googleError: googleError,
          googleErrorDescription: googleErrorDescription
        };

        console.error('[googleDrive] OAuth error details:', diagnosticInfo);

        // Provide more specific error message based on error type
        if (isTokenError) {
          throw new Error(`Google refresh token is invalid or revoked. The user needs to reconnect their Google account.
          
Error: ${googleErrorDescription || googleError || errorMessage}

To fix:
1. User should disconnect and reconnect Google Drive in Integration Settings
2. This will generate a new refresh token
3. Verify the OAuth client is still active in Google Cloud Console

    Current config: clientId=${usedClientId ? 'set (' + usedClientId.substring(0, 20) + '...)' : 'missing'}, clientSecret=${(oauth2Client as any)._clientSecret ? 'set' : 'missing'}`);
        } else {
          throw new Error(`Invalid OAuth client configuration. Please verify:
1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set correctly in Storage (Integration Settings)
2. The client ID and secret match your Google Cloud Console OAuth credentials
3. The redirect URI is authorized in your Google Cloud Console
4. The OAuth client is not deleted or disabled in Google Cloud Console
5. The refresh token is valid and not revoked

Google API Error: ${googleError || errorCode}
Error Description: ${googleErrorDescription || errorMessage}

Current config: clientId=${usedClientId ? 'set (' + usedClientId.substring(0, 20) + '...)' : 'missing'}, clientSecret=${(oauth2Client as any)._clientSecret ? 'set' : 'missing'}`);
        }
      }

      // Re-throw with original error
      throw refreshError;
    }

    // Encrypt new tokens
    const newEncryptedTokens = encryptTokens(credentials);

    // Update Firestore with both encrypted and plain formats for compatibility
    // CRITICAL: Only update refreshToken if a NEW one was provided by Google
    // Most refresh calls do NOT return a new refresh token
    // Encrypt new tokens before saving for security and consistency
    const updateData: any = {
      accessToken: encryptToken(credentials.access_token),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: credentials.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(credentials.expiry_date)) : null
    };

    if (credentials.refresh_token) {
      updateData.refreshToken = encryptToken(credentials.refresh_token);
    }

    // Also update encryptedTokens field for unified compatibility
    try {
      updateData.encryptedTokens = encryptTokens(credentials);
    } catch (err) { /* non-fatal */ }

    await integrationDoc.ref.update(updateData);

    return credentials;

  } catch (error) {
    console.error('Google token refresh failed:', error);
    throw error;
  }
}

/**
 * List Google Drive folders
 */
export const listGoogleDriveFolders = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const userId = request.auth.uid;
      const organizationId = request.auth.token.organizationId || 'default';
      const { folderId = 'root' } = request.data;

      // Get and refresh tokens
      const tokens = await refreshGoogleAccessToken(userId, organizationId);
      getOAuth2ClientForCredentials().setCredentials(tokens);

      // Initialize Drive API
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // List folders
      const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)',
        orderBy: 'name'
      });

      const folders = response.data.files?.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        parents: file.parents
      })) || [];

      return { folders };

    } catch (error: any) {
      console.error('Failed to list Google Drive folders:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to list folders');
    }
  }
);

/**
 * Get Google Drive files in a folder
 */
export const getGoogleDriveFiles = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const userId = request.auth.uid;
      const organizationId = request.auth.token.organizationId || 'default';
      const { folderId } = request.data;

      if (!folderId) {
        throw new HttpsError('invalid-argument', 'Folder ID is required');
      }

      // Get and refresh tokens
      const tokens = await refreshGoogleAccessToken(userId, organizationId);
      getOAuth2ClientForCredentials().setCredentials(tokens);

      // Initialize Drive API
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // List files in folder
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
        orderBy: 'name'
      });

      const files = response.data.files?.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink
      })) || [];

      return createSuccessResponse({ files });

    } catch (error: any) {
      console.error('Failed to get Google Drive files:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to get files');
    }
  }
);

/**
 * Create Google Drive folder
 */
export const createGoogleDriveFolder = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const userId = request.auth.uid;
      const organizationId = request.auth.token.organizationId || 'default';
      const { name, parentId = 'root' } = request.data;

      if (!name) {
        throw new HttpsError('invalid-argument', 'Folder name is required');
      }

      // Get and refresh tokens
      const tokens = await refreshGoogleAccessToken(userId, organizationId);
      getOAuth2ClientForCredentials().setCredentials(tokens);

      // Initialize Drive API
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Create folder
      const response = await drive.files.create({
        requestBody: {
          name: name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId]
        },
        fields: 'id, name, mimeType, createdTime, modifiedTime, parents'
      });

      const folder = {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime,
        parents: response.data.parents
      };

      return createSuccessResponse({ folder });

    } catch (error: any) {
      console.error('Failed to create Google Drive folder:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to create folder');
    }
  }
);

/**
 * Upload file to Google Drive
 */
export const uploadToGoogleDrive = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const userId = request.auth.uid;
      const organizationId = request.auth.token.organizationId || 'default';
      const { fileName, fileContent, mimeType, folderId = 'root' } = request.data;

      if (!fileName || !fileContent) {
        throw new HttpsError('invalid-argument', 'File name and content are required');
      }

      // Get and refresh tokens
      const tokens = await refreshGoogleAccessToken(userId, organizationId);
      getOAuth2ClientForCredentials().setCredentials(tokens);

      // Initialize Drive API
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // Convert base64 content to buffer
      const fileBuffer = Buffer.from(fileContent, 'base64');

      // Upload file
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType: mimeType || 'application/octet-stream',
          body: fileBuffer
        },
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink'
      });

      const file = {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        size: response.data.size,
        createdTime: response.data.createdTime,
        modifiedTime: response.data.modifiedTime,
        webViewLink: response.data.webViewLink
      };

      return createSuccessResponse({ file });

    } catch (error: any) {
      console.error('Failed to upload to Google Drive:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to upload file');
    }
  }
);

// REMOVED: exchangeGoogleCodeForTokens - using handleGoogleOAuthCallbackHttp instead

/**
 * Download file from Google Drive
 */
export const downloadGoogleDriveFile = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileId } = data;

    if (!fileId) {
      throw new Error('File ID is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2ClientForCredentials().setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata first
    const fileMetadata = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size'
    });

    // Download file content
    const fileContent = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: 'arraybuffer' });

    // Convert to base64 for transmission
    const base64Content = Buffer.from(fileContent.data as ArrayBuffer).toString('base64');

    return createSuccessResponse({
      fileId: fileMetadata.data.id,
      fileName: fileMetadata.data.name,
      mimeType: fileMetadata.data.mimeType,
      size: fileMetadata.data.size,
      content: base64Content
    });

  } catch (error) {
    console.error('Failed to download Google Drive file:', error);
    return createErrorResponse('Failed to download file', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Delete file from Google Drive
 */
export const deleteGoogleDriveFile = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileId } = data;

    if (!fileId) {
      throw new Error('File ID is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2ClientForCredentials().setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Delete file
    await drive.files.delete({
      fileId: fileId
    });

    console.log(`Google Drive file ${fileId} deleted by user ${hashForLogging(userId)}`);

    return createSuccessResponse({
      success: true,
      fileId: fileId
    });

  } catch (error) {
    console.error('Failed to delete Google Drive file:', error);
    return createErrorResponse('Failed to delete file', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Google integration status
 */
export const getGoogleIntegrationStatus = onCall(
  {
    region: 'us-central1',
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const userId = request.auth.uid;
      const organizationId = request.auth.token.organizationId || 'standalone';

      // Look in org-level location first (organizations/{orgId}/cloudIntegrations/google)
      // This allows all users in the organization to share the same Google Drive credentials
      let integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('google')
        .get();

      // Fallback to old user-specific location for migration compatibility
      if (!integrationDoc.exists) {
        integrationDoc = await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc(`google_${userId}`)
          .get();
      }

      // Fallback to old global location for migration compatibility
      if (!integrationDoc.exists) {
        integrationDoc = await admin.firestore()
          .collection('cloudIntegrations')
          .doc(`${organizationId}_google_${userId}`)
          .get();
      }

      if (!integrationDoc.exists) {
        return { connected: false };
      }

      const integrationData = integrationDoc.data();

      // Check if connection is explicitly inactive
      if (integrationData?.isActive === false) {
        return { connected: false };
      }

      // Check if access token is expired
      const expiresAt = integrationData?.expiresAt?.toDate();
      const isExpired = expiresAt && expiresAt < new Date();

      // Connection is valid if:
      // 1. Not explicitly inactive AND
      // 2. (Access token not expired OR refresh token exists)
      // This allows the connection to persist even after access token expires, as long as refresh token exists
      const hasRefreshToken = !!integrationData?.refreshToken;
      const isConnected = !isExpired || hasRefreshToken;

      return {
        connected: isConnected,
        accountEmail: integrationData?.accountEmail,
        accountName: integrationData?.accountName,
        expiresAt: expiresAt?.toISOString()
      };

    } catch (error: any) {
      console.error('Failed to get Google integration status:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to get integration status');
    }
  }
);

/**
 * Index Google Drive folder - List files and store metadata for organization-wide access
 */
export const indexGoogleDriveFolder = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { folderId, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!folderId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Folder ID and organization ID are required');
      }

      console.log(`Indexing Google Drive folder ${folderId} for org ${organizationId} by user ${hashForLogging(userId)}`);

      // Get org-level encrypted tokens from Firestore
      // Try org-level location first (organizations/{orgId}/cloudIntegrations/google)
      let integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('google')
        .get();

      // Fallback to old user-specific location for migration compatibility
      if (!integrationDoc.exists) {
        integrationDoc = await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc(`google_${userId}`)
          .get();
      }

      if (!integrationDoc.exists) {
        throw new HttpsError('not-found', 'Google Drive not connected');
      }

      const integrationData = integrationDoc.data();
      if (!integrationData?.encryptedTokens) {
        throw new HttpsError('not-found', 'No OAuth tokens found');
      }

      // Decrypt tokens
      const tokens = decryptTokens(integrationData.encryptedTokens);

      // Set up OAuth client with user's tokens
      getOAuth2ClientForCredentials().setCredentials(tokens);
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      // List files in the folder
      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, parents)',
        pageSize: 1000
      });

      const files = response.data.files || [];
      console.log(`Found ${files.length} files in folder ${folderId}`);

      // Store indexed files in Firestore (organization-wide collection)
      const batch = admin.firestore().batch();
      const indexedFilesRef = admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('indexedFiles');

      for (const file of files) {
        const fileDoc = {
          name: file.name,
          driveFileId: file.id,
          mimeType: file.mimeType,
          size: file.size ? parseInt(file.size) : 0,
          webViewLink: file.webViewLink,
          parentFolderId: folderId,
          driveUserId: userId,
          driveUserEmail: integrationData.accountEmail,
          indexedBy: userId,
          indexedAt: admin.firestore.FieldValue.serverTimestamp(),
          organizationId: organizationId
        };

        batch.set(indexedFilesRef.doc(file.id!), fileDoc);
      }

      await batch.commit();

      console.log(`Successfully indexed ${files.length} files from folder ${folderId}`);

      return createSuccessResponse({
        success: true,
        filesIndexed: files.length,
        folderId: folderId
      });

    } catch (error: any) {
      console.error('Failed to index Google Drive folder:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to index folder');
    }
  }
);
