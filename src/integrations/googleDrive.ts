/**
 * Google Drive Integration Service
 * 
 * Handles OAuth authentication and API operations for Google Drive
 * Provides server-side OAuth flow with secure token management
 */

import { google } from 'googleapis';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './encryption';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';

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
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || configRedirectUri || 'https://backbone-client.web.app/auth/google/callback';
  
  return { clientId, clientSecret, redirectUri };
};

// OAuth2 client - Create lazily to avoid module-level config access
let oauth2Client: any = null;
const getOAuth2Client = (redirectUri?: string) => {
  const config = getGoogleConfig();
  
  // Use provided redirectUri or fall back to config
  const finalRedirectUri = redirectUri || config.redirectUri;
  
  // Validate config with detailed error messages
  if (!config.clientId || !config.clientSecret) {
    const errorDetails = {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasEnvClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasEnvClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      clientIdLength: config.clientId?.length || 0,
      clientSecretLength: config.clientSecret?.length || 0,
      redirectUri: finalRedirectUri
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
    finalRedirectUri
  );
  
  console.log('[googleDrive] OAuth2 client created:', {
    hasClientId: !!config.clientId,
    hasClientSecret: !!config.clientSecret,
    redirectUri: finalRedirectUri,
    redirectUriSource: redirectUri ? 'provided' : 'config',
    clientIdPrefix: config.clientId.substring(0, 20) + '...'
  });
  
  return oauth2Client;
};

// Google Drive API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/documents'
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

    // Get client ID, secret, and redirect URI from request body
    // This allows user-specific OAuth clients from integration config
    const { clientId, clientSecret, redirectUri } = req.body || {};
    const finalRedirectUri = redirectUri || undefined;

    console.log('[googleDrive] OAuth initiation request:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      redirectUri: redirectUri ? redirectUri.substring(0, 50) + '...' : 'using default',
      origin: req.headers.origin
    });

    // Generate secure state parameter
    const state = generateSecureState();

    // Store state in Firestore for verification (including client credentials if provided)
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set({
        userId,
        organizationId,
        provider: 'google',
        redirectUri: finalRedirectUri,
        // Store client credentials with state if provided (for user-specific OAuth clients)
        clientId: clientId || null,
        clientSecret: clientSecret || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10 minutes
      });

    // Create OAuth2 client - use provided client ID/secret or fall back to config
    let oauth2Client;
    if (clientId && clientSecret) {
      // Use user-provided client credentials from integration config
      oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        finalRedirectUri || getGoogleConfig().redirectUri
      );
      console.log('[googleDrive] Using user-provided OAuth client credentials');
    } else {
      // Use Firebase Functions config credentials (default)
      oauth2Client = getOAuth2Client(finalRedirectUri);
      console.log('[googleDrive] Using Firebase Functions config OAuth credentials');
    }

    // Generate authorization URL with the correct redirect URI
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });

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

/**
 * Initiate Google OAuth flow (Callable version)
 * Returns authorization URL for user to authenticate
 */
export const initiateGoogleOAuth = functions.https.onCall(async (data, context) => {
  try {
    // Verify user authentication
    if (!context.auth) {
      return createErrorResponse('Authentication required', 'UNAUTHENTICATED');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Generate secure state parameter
    const state = generateSecureState();

    // Store state in Firestore for verification
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set({
        userId,
        organizationId,
        provider: 'google',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10 minutes
      });

    // Generate authorization URL
    const authUrl = getOAuth2Client().generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent' // Force consent to get refresh token
    });

    console.log(`Google OAuth initiated for user ${hashForLogging(userId)} in org ${organizationId}`);

    return createSuccessResponse({
      authUrl,
      state
    });

  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    return createErrorResponse('Failed to initiate Google OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Handle Google OAuth callback (HTTP version for frontend)
 * Exchange authorization code for tokens
 */
export const handleGoogleOAuthCallbackHttp = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'http://localhost:3000',
    'http://localhost:3001',
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

    // Get redirectUri and client credentials from state (prefer stored, fall back to request body)
    const { redirectUri: requestRedirectUri } = req.body || {};
    const storedRedirectUri = stateData?.redirectUri || requestRedirectUri;
    const storedClientId = stateData?.clientId || clientId;
    const storedClientSecret = stateData?.clientSecret || clientSecret;
    
    console.log('[googleDrive] OAuth callback processing (HTTP):', {
      hasStoredRedirectUri: !!storedRedirectUri,
      hasStoredClientId: !!storedClientId,
      hasStoredClientSecret: !!storedClientSecret,
      userId: hashForLogging(userId),
      organizationId
    });
    
    // Clean up state document
    await stateDoc.ref.delete();

    // Create OAuth2 client - use stored/client credentials if available, otherwise use config
    let oauth2Client;
    if (storedClientId && storedClientSecret) {
      // Use client credentials from state or request (user-specific OAuth clients)
      oauth2Client = new google.auth.OAuth2(
        storedClientId,
        storedClientSecret,
        storedRedirectUri || getGoogleConfig().redirectUri
      );
      console.log('[googleDrive] Using client credentials from state/request');
    } else {
      // Use Firebase Functions config credentials (default)
      oauth2Client = getOAuth2Client(storedRedirectUri);
      console.log('[googleDrive] Using Firebase Functions config credentials');
    }
    
    // Exchange code for tokens
    const tokenOptions: any = { code };
    if (storedRedirectUri) {
      tokenOptions.redirect_uri = storedRedirectUri;
    }
    
    const tokenResponse = await oauth2Client.getToken(tokenOptions);
    const tokens = tokenResponse.tokens;

    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Store tokens in Firestore (encrypted) - same location as callable version
    const encryptedTokens = encryptTokens({
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date
    });

    const integrationDoc = {
      provider: 'google',
      accountEmail: userInfo.data.email,
      accountName: userInfo.data.name,
      tokens: encryptedTokens,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: tokens.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiry_date)) : null
    };

    // Store in organization-scoped collection for team-wide access
    // Use org-level document ID (google) so all users in the org can share the same credentials
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('google')
      .set(integrationDoc);

    // Also create connection record for tracking team members' Drive connections
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('driveConnections')
      .doc(userId)
      .set({
        userId,
        accountEmail: userInfo.data.email,
        accountName: userInfo.data.name,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true
      });

    console.log(`Google OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}, account: ${userInfo.data.email}`);

    res.status(200).json({
      success: true,
      data: {
        accountEmail: userInfo.data.email,
        accountName: userInfo.data.name
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
 * Handle Google OAuth callback (Callable version)
 * Exchange authorization code for tokens
 */
export const handleGoogleOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    const { code, state, clientId, clientSecret, redirectUri } = data;

    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    // Verify state parameter
    const stateDoc = await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!stateDoc.exists) {
      throw new Error('Invalid or expired state parameter');
    }

    const stateData = stateDoc.data();
    const userId = stateData?.userId;
    const organizationId = stateData?.organizationId;

    if (!userId || !organizationId) {
      throw new Error('Invalid state data');
    }

    // Get redirectUri and client credentials from state (prefer stored, fall back to request)
    const requestRedirectUri = redirectUri;
    const storedRedirectUri = stateData?.redirectUri || requestRedirectUri;
    const storedClientId = stateData?.clientId || clientId;
    const storedClientSecret = stateData?.clientSecret || clientSecret;
    
    console.log('[googleDrive] OAuth callback processing:', {
      hasStoredRedirectUri: !!storedRedirectUri,
      hasStoredClientId: !!storedClientId,
      hasStoredClientSecret: !!storedClientSecret,
      storedRedirectUri: storedRedirectUri ? storedRedirectUri.substring(0, 50) + '...' : 'using default',
      userId: hashForLogging(userId),
      organizationId
    });
    
    // Clean up state document
    await stateDoc.ref.delete();

    // Create OAuth2 client - use stored client credentials if available, otherwise use config
    let oauth2Client;
    if (storedClientId && storedClientSecret) {
      // Use client credentials from state (user-specific OAuth clients)
      oauth2Client = new google.auth.OAuth2(
        storedClientId,
        storedClientSecret,
        storedRedirectUri || getGoogleConfig().redirectUri
      );
      console.log('[googleDrive] Using stored client credentials from state');
    } else {
      // Use Firebase Functions config credentials (default)
      oauth2Client = getOAuth2Client(storedRedirectUri);
      console.log('[googleDrive] Using Firebase Functions config credentials');
    }
    
    // Explicitly pass redirect_uri to getToken to ensure it matches the auth URL
    const tokenOptions: any = { code };
    if (storedRedirectUri) {
      tokenOptions.redirect_uri = storedRedirectUri;
    }
    
    console.log('[googleDrive] Exchanging code for tokens:', {
      hasRedirectUri: !!tokenOptions.redirect_uri,
      redirectUri: tokenOptions.redirect_uri ? tokenOptions.redirect_uri.substring(0, 50) + '...' : 'using client default'
    });
    
    let tokens;
    try {
      const tokenResponse = await oauth2Client.getToken(tokenOptions);
      tokens = tokenResponse.tokens;
    } catch (tokenError: any) {
      const errorMessage = tokenError?.message || 'Unknown error';
      const errorCode = tokenError?.code;
      const responseData = tokenError?.response?.data || {};
      
      console.error('[googleDrive] Token exchange failed:', {
        error: errorMessage,
        code: errorCode,
        googleError: responseData.error,
        googleErrorDescription: responseData.error_description,
        redirectUri: tokenOptions.redirect_uri || 'client default',
        storedRedirectUri: storedRedirectUri ? storedRedirectUri.substring(0, 50) + '...' : 'none',
        clientId: oauth2Client._clientId ? oauth2Client._clientId.substring(0, 20) + '...' : 'missing',
        fullError: tokenError
      });
      
      // Provide more helpful error message
      if (errorCode === 'invalid_client' || responseData.error === 'invalid_client') {
        throw new Error(`Invalid OAuth client. The redirect URI used (${tokenOptions.redirect_uri || 'default'}) must match exactly what was used in the authorization URL and must be authorized in Google Cloud Console.`);
      }
      
      throw tokenError;
    }
    
    if (!tokens.access_token) {
      throw new Error('Failed to obtain access token');
    }
    
    console.log('[googleDrive] Token exchange successful:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'no expiry'
    });

    // Set credentials and get user info
    const client = getOAuth2Client();
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store encrypted tokens in organization-scoped Firestore collection
    const integrationDoc = {
      userId,
      provider: 'google',
      accountEmail: userInfo.data.email,
      accountName: userInfo.data.name,
      encryptedTokens,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: tokens.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiry_date)) : null
    };

    // Store in organization-scoped collection for team-wide access
    // Use org-level document ID (google) so all users in the org can share the same credentials
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('google')
      .set(integrationDoc);

    // Also create connection record for tracking team members' Drive connections
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('driveConnections')
      .doc(userId)
      .set({
        userId,
        accountEmail: userInfo.data.email,
        accountName: userInfo.data.name,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true
      });

    console.log(`Google OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}, account: ${userInfo.data.email}`);

    return createSuccessResponse({
      accountEmail: userInfo.data.email,
      accountName: userInfo.data.name,
      connected: true
    });

  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return createErrorResponse('Failed to complete Google OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Refresh Google access token (Callable version)
 */
export const refreshGoogleAccessTokenCallable = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    
    return createSuccessResponse({
      success: true,
      message: 'Token refreshed successfully'
    });

  } catch (error) {
    console.error('Google token refresh failed:', error);
    return createErrorResponse('Failed to refresh token', error instanceof Error ? error.message : 'Unknown error');
  }
});

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
    const encryptedTokens = integrationData?.encryptedTokens;
    const plainAccessToken = integrationData?.accessToken;
    const plainRefreshToken = integrationData?.refreshToken;
    
    if (encryptedTokens) {
      // Decrypt tokens if they're encrypted
      tokens = decryptTokens(encryptedTokens);
    } else if (plainAccessToken && plainRefreshToken) {
      // Use plain tokens if available (from frontend save)
      tokens = {
        access_token: plainAccessToken,
        refresh_token: plainRefreshToken,
        expiry_date: integrationData?.expiresAt?.toDate?.()?.getTime() || null
      };
    } else {
      throw new Error('No tokens found for Google integration');
    }

    if (!tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Set credentials and refresh
    // IMPORTANT: Get a fresh OAuth client instance to ensure it has the correct client ID/secret
    const oauth2Client = getOAuth2Client();
    
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
    const config = getGoogleConfig();
    console.log('[googleDrive] Attempting token refresh with client ID:', {
      clientIdPrefix: config.clientId ? config.clientId.substring(0, 20) + '...' : 'missing',
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
        hasClientId: !!oauth2Client._clientId,
        redirectUri: oauth2Client._redirectUri,
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

Current config: clientId=${config.clientId ? 'set (' + config.clientId.substring(0, 20) + '...)' : 'missing'}, clientSecret=${config.clientSecret ? 'set' : 'missing'}`);
        } else {
          throw new Error(`Invalid OAuth client configuration. Please verify:
1. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set correctly in Firebase Functions
   - Set via: firebase functions:config:set google.client_id="..." google.client_secret="..."
   - Or via environment variables: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
2. The client ID and secret match your Google Cloud Console OAuth credentials
3. The redirect URI (${config.redirectUri}) is authorized in your Google Cloud Console
4. The OAuth client is not deleted or disabled in Google Cloud Console
5. The refresh token is valid and not revoked

Google API Error: ${googleError || errorCode}
Error Description: ${googleErrorDescription || errorMessage}

Current config: clientId=${config.clientId ? 'set (' + config.clientId.substring(0, 20) + '...)' : 'missing'}, clientSecret=${config.clientSecret ? 'set' : 'missing'}`);
        }
      }
      
      // Re-throw with original error
      throw refreshError;
    }

    // Encrypt new tokens
    const newEncryptedTokens = encryptTokens(credentials);

    // Update Firestore with both encrypted and plain formats for compatibility
    const updateData: any = {
      encryptedTokens: newEncryptedTokens,
      accessToken: credentials.access_token, // Also store plain for frontend access
      refreshToken: credentials.refresh_token,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: credentials.expiry_date ? admin.firestore.Timestamp.fromDate(new Date(credentials.expiry_date)) : null
    };

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
export const listGoogleDriveFolders = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId = 'root' } = data;

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2Client().setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List folders
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)',
      orderBy: 'name'
    });

    const folders = response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      parents: file.parents
    })) || [];

    return createSuccessResponse({ folders });

  } catch (error) {
    console.error('Failed to list Google Drive folders:', error);
    return createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Google Drive files in a folder
 */
export const getGoogleDriveFiles = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId } = data;

    if (!folderId) {
      throw new Error('Folder ID is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2Client().setCredentials(tokens);

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List files in folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
      orderBy: 'name'
    });

    const files = response.data.files?.map(file => ({
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

  } catch (error) {
    console.error('Failed to get Google Drive files:', error);
    return createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Create Google Drive folder
 */
export const createGoogleDriveFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, parentId = 'root' } = data;

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2Client().setCredentials(tokens);

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

  } catch (error) {
    console.error('Failed to create Google Drive folder:', error);
    return createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Upload file to Google Drive
 */
export const uploadToGoogleDrive = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileName, fileContent, mimeType, folderId = 'root' } = data;

    if (!fileName || !fileContent) {
      throw new Error('File name and content are required');
    }

    // Get and refresh tokens
    const tokens = await refreshGoogleAccessToken(userId, organizationId);
    getOAuth2Client().setCredentials(tokens);

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

  } catch (error) {
    console.error('Failed to upload to Google Drive:', error);
    return createErrorResponse('Failed to upload file', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Exchange authorization code for access tokens
 */
export const exchangeGoogleCodeForTokens = functions.https.onCall(async (data, context) => {
  try {
    // Verify authentication
    if (!context.auth) {
      return createErrorResponse('Authentication required', 'UNAUTHENTICATED');
    }

    const { code, redirectUri, clientId, clientSecret } = data;

    if (!code) {
      return createErrorResponse('Authorization code is required', 'INVALID_ARGUMENT');
    }

    // Use user-provided credentials or fallback to environment config
    const config = getGoogleConfig();
    const googleClientId = clientId || config.clientId;
    const googleClientSecret = clientSecret || config.clientSecret;
    const googleRedirectUri = redirectUri || config.redirectUri;

    if (!googleClientId || !googleClientSecret) {
      return createErrorResponse('Google OAuth credentials not configured', 'FAILED_PRECONDITION');
    }

    // Create OAuth2 client with user-provided credentials
    const userOAuth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      googleRedirectUri
    );

    // Exchange code for tokens with user's credentials
    const { tokens } = await userOAuth2Client.getToken({
      code: code,
      redirect_uri: googleRedirectUri
    });

    if (!tokens.access_token) {
      return createErrorResponse('Failed to obtain access token', 'INTERNAL');
    }

    // Encrypt tokens for storage
    const encryptedTokens = encryptTokens(tokens);

    // Store tokens in Firestore
    const userId = context.auth.uid;
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return createErrorResponse('User not found', 'NOT_FOUND');
    }

    const organizationId = userData.organizationId || 'default-org';

    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrations')
      .doc('google_drive')
      .set({
        provider: 'google_drive',
        tokens: encryptedTokens,
        userId: userId,
        organizationId: organizationId,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    console.log(`Google Drive tokens stored for user ${hashForLogging(userId)} in org ${organizationId}`);

    // Get user info from Google
    userOAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: userOAuth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const accountEmail = userInfo.data.email || 'Unknown';
    const accountName = userInfo.data.name || 'Google Drive User';

    return createSuccessResponse({
      success: true,
      accountEmail: accountEmail,
      accountName: accountName,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date
      }
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    return createErrorResponse(
      'Failed to exchange authorization code for tokens',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

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
    getOAuth2Client().setCredentials(tokens);

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
    getOAuth2Client().setCredentials(tokens);

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
export const getGoogleIntegrationStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'standalone';

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
      return createSuccessResponse({ connected: false });
    }

    const integrationData = integrationDoc.data();
    
    // Check if connection is explicitly inactive
    if (integrationData?.isActive === false) {
      return createSuccessResponse({ connected: false });
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

    return createSuccessResponse({
      connected: isConnected,
      accountEmail: integrationData?.accountEmail,
      accountName: integrationData?.accountName,
      expiresAt: expiresAt?.toISOString()
    });

  } catch (error) {
    console.error('Failed to get Google integration status:', error);
    return createErrorResponse('Failed to get integration status', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Index Google Drive folder - List files and store metadata for organization-wide access
 */
export const indexGoogleDriveFolder = functions.https.onCall(async (data, context) => {
  try {
    // Verify authentication
    if (!context.auth) {
      return createErrorResponse('Authentication required', 'UNAUTHENTICATED');
    }

    const { folderId, organizationId } = data;
    const userId = context.auth.uid;

    if (!folderId || !organizationId) {
      return createErrorResponse('Folder ID and organization ID are required', 'INVALID_ARGUMENT');
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
      return createErrorResponse('Google Drive not connected', 'NOT_FOUND');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData?.encryptedTokens) {
      return createErrorResponse('No OAuth tokens found', 'NOT_FOUND');
    }

    // Decrypt tokens
    const tokens = decryptTokens(integrationData.encryptedTokens);
    
    // Set up OAuth client with user's tokens
    getOAuth2Client().setCredentials(tokens);
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

  } catch (error) {
    console.error('Failed to index Google Drive folder:', error);
    return createErrorResponse('Failed to index folder', error instanceof Error ? error.message : 'Unknown error');
  }
});
