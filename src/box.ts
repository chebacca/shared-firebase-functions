/**
 * Box Integration Service
 * 
 * Handles OAuth authentication and API operations for Box
 * Provides server-side OAuth flow with secure token management
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './integrations/encryption';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from './shared/utils';
import { sendSystemAlert } from './utils/systemAlerts';

// Box OAuth configuration - lazy loaded to avoid initialization errors during Firebase analysis
async function getBoxConfig(organizationId?: string): Promise<{
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
}> {
  // First, try to get from organization-specific Firestore config (if organizationId provided)
  if (organizationId) {
    try {
      const orgConfigDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('box')
        .get();
      
      if (orgConfigDoc.exists) {
        const orgConfig = orgConfigDoc.data();
        if (orgConfig?.clientId && orgConfig?.clientSecret) {
          // Decrypt client secret if encrypted
          let clientSecret = orgConfig.clientSecret;
          try {
            const decrypted = decryptTokens(orgConfig.clientSecret);
            // decryptTokens returns an object, extract the clientSecret from it
            clientSecret = typeof decrypted === 'object' && decrypted.clientSecret 
              ? decrypted.clientSecret 
              : orgConfig.clientSecret;
          } catch {
            // If decryption fails, assume it's already plaintext
            clientSecret = orgConfig.clientSecret;
          }
          
          return {
            clientId: orgConfig.clientId,
            clientSecret: typeof clientSecret === 'string' ? clientSecret : String(clientSecret),
            redirectUri: orgConfig.redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
            scope: orgConfig.scope || 'root_readwrite'
          };
        }
      }
    } catch (error) {
      console.warn('[BoxConfig] Failed to get org-specific config:', error);
    }
  }
  
  // Fall back to environment variables (preferred for newer deployments)
  const envClientId = process.env.BOX_CLIENT_ID;
  const envClientSecret = process.env.BOX_CLIENT_SECRET;
  const envRedirectUri = process.env.BOX_REDIRECT_URI;
  const envScope = process.env.BOX_SCOPE;
  
  // Finally, get from Firebase Functions config (deprecated but still supported)
  const configClientId = functions.config().box?.client_id;
  const configClientSecret = functions.config().box?.client_secret;
  const configRedirectUri = functions.config().box?.redirect_uri;
  const configScope = functions.config().box?.scope;
  
  return {
    clientId: envClientId || configClientId,
    clientSecret: envClientSecret || configClientSecret,
    redirectUri: envRedirectUri || configRedirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
    scope: envScope || configScope || 'root_readwrite' // Default scope, can be overridden in config
  };
}

// Box SDK client - LAZY loaded to avoid protobuf issues at module initialization
// Only import Box SDK when actually needed (not for OAuth URL generation)
async function getBoxSDK(organizationId?: string) {
  // Lazy import Box SDK only when needed (not at module load time)
  const BoxSDK = require('box-node-sdk');
  const config = await getBoxConfig(organizationId);
  if (!config.clientId || !config.clientSecret) {
    console.error('[BoxSDK] Configuration missing:', {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasEnvClientId: !!process.env.BOX_CLIENT_ID,
      hasEnvClientSecret: !!process.env.BOX_CLIENT_SECRET,
      hasConfigClientId: !!functions.config().box?.client_id,
      hasConfigClientSecret: !!functions.config().box?.client_secret,
      organizationId
    });
    throw new Error('Box client ID and secret must be configured. Please set BOX_CLIENT_ID and BOX_CLIENT_SECRET environment variables or configure via Firebase Functions config.');
  }
  return new BoxSDK({
    clientID: config.clientId,
    clientSecret: config.clientSecret
  });
}

/**
 * Verify Firebase Auth token from Authorization header
 */
async function verifyAuthToken(req: any): Promise<{ userId: string; organizationId: string }> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header required');
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Get organizationId from custom claims (avoiding direct property access)
    let organizationId = 'default';
    if (decodedToken.organizationId) {
      organizationId = String(decodedToken.organizationId);
    } else {
      // Try to get from user record custom claims
      try {
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        const customClaims = userRecord.customClaims || {};
        if (customClaims.organizationId) {
          organizationId = String(customClaims.organizationId);
        }
      } catch (userError) {
        console.warn('Could not get user record for custom claims, using default org');
      }
    }
    
    return {
      userId: String(decodedToken.uid),
      organizationId: organizationId
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid authentication token');
  }
}

/**
 * @deprecated This function has been migrated to the new modular structure.
 * Use `boxOAuthInitiate` from './box/oauth' instead.
 * This function is kept for backward compatibility only.
 * 
 * Initiate Box OAuth flow - HTTP version with CORS support
 * Returns authorization URL for user to authenticate
 */
export const initiateBoxOAuthHttp = functions.https.onRequest(async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Box OAuth HTTP request received:`, {
    method: req.method,
    hasAuth: !!req.headers.authorization,
    timestamp: new Date().toISOString()
  });

  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      console.log(`[${requestId}] Handling OPTIONS preflight`);
      res.status(200).send('');
      return;
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      res.status(405).send('Method Not Allowed');
      return;
    }

    console.log(`[${requestId}] Step 1: Verifying authentication token...`);
    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);
    console.log(`[${requestId}] Step 1 complete:`, {
      userId: hashForLogging(userId),
      organizationId,
      hasUserId: !!userId,
      hasOrgId: !!organizationId
    });

    console.log(`[${requestId}] Step 2: Generating secure state...`);
    // Generate secure state parameter
    const state = generateSecureState();
    console.log(`[${requestId}] Step 2 complete: state generated (length: ${state.length})`);

    console.log(`[${requestId}] Step 3: Getting Box config from Firestore...`);
    // Always retrieve Box config from Firestore (never accept credentials from client)
    // This ensures we always use the configured credentials, not placeholders
    const boxConfig = await getBoxConfig(organizationId);
    
    // Parse request body to get client-provided redirect URI (for local dev support)
    let clientRedirectUri: string | undefined;
    try {
      const requestBody = req.body || {};
      clientRedirectUri = requestBody.redirectUri;
      console.log(`[${requestId}] Client-provided redirect URI:`, clientRedirectUri);
    } catch (error) {
      console.warn(`[${requestId}] Could not parse request body for redirect URI:`, error);
    }
    
    // Use client-provided redirect URI if available (for local dev), otherwise use config
    const finalRedirectUri = clientRedirectUri || boxConfig.redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html';
    
    console.log(`[${requestId}] Step 3 complete:`, {
      hasClientId: !!boxConfig.clientId,
      hasClientSecret: !!boxConfig.clientSecret,
      configRedirectUri: boxConfig.redirectUri,
      clientRedirectUri: clientRedirectUri,
      finalRedirectUri: finalRedirectUri,
      scope: boxConfig.scope,
      credentialsSource: 'Firestore'
    });
    
    if (!boxConfig.clientId || !boxConfig.clientSecret) {
      throw new Error('Box client ID and secret must be configured in Integration Settings. Please configure Box credentials first.');
    }

    console.log(`[${requestId}] Step 4: Preparing Firestore data (using plain timestamps to avoid protobuf issues)...`);
    // Store state in Firestore for verification
    // Use plain timestamps (milliseconds) to avoid ALL protobuf serialization issues
    // Explicitly convert to Number to ensure no protobuf types are used
    const nowMillis = Number(Date.now());
    const expiresAtMillis = Number(Date.now() + 30 * 60 * 1000); // 30 minutes from now - increased from 10 to allow more time for OAuth flow
    
    // Store credentials in state document for callback (always retrieved from Firestore, never from client)
    // Encrypt credentials before storing for security
    const encryptedCredentials = encryptTokens({
      clientId: boxConfig.clientId,
      clientSecret: boxConfig.clientSecret
    });
    console.log(`[${requestId}] Step 4a: Credentials retrieved from Firestore and encrypted for state document`, {
      hasClientId: !!boxConfig.clientId,
      hasClientSecret: !!boxConfig.clientSecret,
      clientIdLength: boxConfig.clientId?.length || 0,
      encryptedLength: encryptedCredentials.length
    });
    
    const firestoreData: Record<string, any> = {
      userId: String(userId), // Ensure string
      organizationId: String(organizationId), // Ensure string
      provider: 'box',
      createdAtMillis: nowMillis, // Explicitly plain number - no protobuf serialization
      expiresAtMillis: expiresAtMillis, // Explicitly plain number - no protobuf serialization
      redirectUri: finalRedirectUri, // Store redirect URI for callback verification (use final redirect URI)
      oauthCredentials: encryptedCredentials // Always store credentials from Firestore
    };
    
    console.log(`[${requestId}] Step 4 data prepared:`, {
      userId: hashForLogging(String(userId)),
      organizationId: String(organizationId),
      provider: 'box',
      expiresAt: new Date(expiresAtMillis).toISOString(),
      hasCredentials: !!firestoreData.oauthCredentials
    });

    console.log(`[${requestId}] Step 5: Writing to Firestore...`);
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set(firestoreData);
    console.log(`[${requestId}] Step 5 complete: Firestore write successful`);

    console.log(`[${requestId}] Step 6: Generating authorization URL manually (avoiding Box SDK protobuf issues)...`);
    // Build Box OAuth URL manually to avoid Box SDK protobuf serialization issues
    // Box OAuth URL format: https://account.box.com/api/oauth2/authorize?...
    const boxAuthBaseUrl = 'https://account.box.com/api/oauth2/authorize';
    const authUrlParams = new URLSearchParams({
      response_type: 'code',
      client_id: boxConfig.clientId,
      redirect_uri: finalRedirectUri, // Use final redirect URI (client-provided or config)
      state: state,
      scope: boxConfig.scope // Use configured scope
    });
    const authUrl = `${boxAuthBaseUrl}?${authUrlParams.toString()}`;
    console.log(`[${requestId}] Step 6 complete: Auth URL generated (length: ${authUrl.length})`);

    console.log(`[${requestId}] Box OAuth initiated successfully for user ${hashForLogging(userId)} in org ${organizationId}`);

    const response = createSuccessResponse({
      authUrl,
      state
    });

    console.log(`[${requestId}] Sending success response...`);
    res.status(200).json(response);
    console.log(`[${requestId}] Request completed successfully`);

  } catch (error) {
    console.error(`[${requestId}] Box OAuth initiation failed:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error && error.stack ? error.stack : String(error);
    const response = createErrorResponse('Failed to initiate Box OAuth', errorDetails);
    res.status(400).json(response);
  }
});

/**
 * @deprecated This function has been migrated to the new modular structure.
 * Use `boxOAuthInitiate` from './box/oauth' instead.
 * This function is kept for backward compatibility only.
 * 
 * Initiate Box OAuth flow (Callable version - kept for backwards compatibility)
 * Returns authorization URL for user to authenticate
 */
export const initiateBoxOAuth = functions.https.onCall(async (data, context) => {
  try {
    // Verify user authentication
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Generate secure state parameter
    const state = generateSecureState();

    // Store state in Firestore for verification
    // Use plain timestamps (milliseconds) to avoid protobuf serialization issues
    const nowMillis = Date.now();
    const expiresAtMillis = Date.now() + 60 * 60 * 1000; // 60 minutes - increased to allow more time for OAuth flow
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set({
        userId: String(userId),
        organizationId: String(organizationId),
        provider: 'box',
        createdAtMillis: nowMillis, // Plain number - no protobuf serialization
        expiresAtMillis: expiresAtMillis // Plain number - no protobuf serialization
      });

    // Generate authorization URL
    const boxConfig = await getBoxConfig(organizationId);
    const boxSDK = await getBoxSDK(organizationId);
    const authUrl = boxSDK.getAuthorizationURL({
      response_type: 'code',
      client_id: boxConfig.clientId,
      redirect_uri: boxConfig.redirectUri,
      state: state,
      scope: boxConfig.scope // Use configured scope
    });

    console.log(`Box OAuth initiated for user ${hashForLogging(userId)} in org ${organizationId}`);

    return createSuccessResponse({
      authUrl,
      state
    });

  } catch (error) {
    console.error('Box OAuth initiation failed:', error);
    return createErrorResponse('Failed to initiate Box OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * @deprecated This function has been migrated to the new modular structure.
 * Use `boxOAuthCallback` from './box/oauth' instead.
 * This function is kept for backward compatibility only.
 * 
 * Handle Box OAuth callback
 * Exchange authorization code for tokens
 */
export const handleBoxOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    const { code, state } = data;

    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    console.log(`[BoxOAuth] Processing callback for state: ${state.substring(0, 20)}..., code: ${code.substring(0, 20)}...`);

    // Verify state parameter
    const stateDoc = await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!stateDoc.exists) {
      // Log more details to help diagnose the issue
      console.error(`[BoxOAuth] State document not found:`, {
        statePrefix: state.substring(0, 20),
        stateLength: state.length,
        collection: 'oauthStates',
        timestamp: new Date().toISOString(),
        // Check if there are any recent states for this user/org
        note: 'State may have expired, been deleted, or never created'
      });
      
      // Check if there are any recent states in the collection (for debugging)
      try {
        const recentStates = await admin.firestore()
          .collection('oauthStates')
          .where('provider', '==', 'box')
          .orderBy('createdAtMillis', 'desc')
          .limit(5)
          .get();
        
        console.log(`[BoxOAuth] Recent Box OAuth states found: ${recentStates.size}`);
        let index = 0;
        recentStates.forEach((doc) => {
          index++;
          const data = doc.data();
          console.log(`[BoxOAuth] Recent state ${index}:`, {
            id: doc.id.substring(0, 20),
            createdAt: data.createdAtMillis ? new Date(data.createdAtMillis).toISOString() : 'N/A',
            expiresAt: data.expiresAtMillis ? new Date(data.expiresAtMillis).toISOString() : 'N/A',
            userId: data.userId ? hashForLogging(data.userId) : 'N/A'
          });
        });
      } catch (queryError) {
        console.warn(`[BoxOAuth] Could not query recent states:`, queryError);
      }
      
      throw new Error('Invalid or expired state parameter. The OAuth session may have expired. Please try connecting to Box again.');
    }

    const stateData = stateDoc.data();
    const userId = stateData?.userId;
    const organizationId = stateData?.organizationId;

    console.log(`[BoxOAuth] State document found:`, {
      userId: hashForLogging(userId || ''),
      organizationId: organizationId || 'none',
      hasExpiresAtMillis: !!stateData?.expiresAtMillis,
      expiresAtMillis: stateData?.expiresAtMillis,
      expiresAt: stateData?.expiresAt,
      hasRedirectUri: !!stateData?.redirectUri,
      redirectUri: stateData?.redirectUri
    });

    if (!userId || !organizationId) {
      console.error(`[BoxOAuth] Invalid state data:`, { userId: !!userId, organizationId: !!organizationId });
      throw new Error('Invalid state data');
    }

    // Check if code was already processed (prevent duplicate processing)
    if (stateData?.codeUsed === true) {
      console.warn(`[BoxOAuth] Authorization code already used for this state - may be duplicate callback`);
      // Check if integration already exists (successful previous attempt)
      const existingIntegration = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(`box_${userId}`)
        .get();
      
      if (existingIntegration.exists) {
        console.log(`[BoxOAuth] Integration already exists - returning success from previous attempt`);
        const integrationData = existingIntegration.data();
        return createSuccessResponse({
          accountEmail: integrationData?.accountEmail,
          accountName: integrationData?.accountName,
          connected: true
        });
      } else {
        throw new Error('Authorization code was already used. Please restart the OAuth flow.');
      }
    }

    // Check expiration (handle both old and new format)
    // Prioritize expiresAtMillis (new format) over expiresAt (old format)
    let isExpired = false;
    
    // Check expiresAtMillis first (new format - plain number)
    if (stateData?.expiresAtMillis) {
      const expiresAt = Number(stateData.expiresAtMillis);
      const now = Date.now();
      isExpired = expiresAt < now;
      console.log(`[BoxOAuth] Checking expiration (millis format):`, {
        expiresAt: new Date(expiresAt).toISOString(),
        now: new Date(now).toISOString(),
        isExpired
      });
    }
    // Fallback to expiresAt timestamp (old format)
    else if (stateData?.expiresAt) {
      if (typeof stateData.expiresAt.toDate === 'function') {
        isExpired = stateData.expiresAt.toDate() < new Date();
      } else if (typeof stateData.expiresAt === 'number') {
        isExpired = stateData.expiresAt < Date.now();
      }
    }
    
    if (isExpired) {
      console.warn(`[BoxOAuth] State expired, cleaning up...`);
      await stateDoc.ref.delete(); // Clean up expired state
      throw new Error('State parameter has expired');
    }

    // Get Box config - prefer credentials from state document, fallback to Firebase config
    const defaultConfig = await getBoxConfig(organizationId);
    let boxConfig = {
      clientId: defaultConfig.clientId,
      clientSecret: defaultConfig.clientSecret,
      redirectUri: stateData?.redirectUri || defaultConfig.redirectUri,
      scope: defaultConfig.scope
    };
    
    // If credentials were stored in state document, use them (user-provided credentials)
    // PRIORITY: Stored credentials take precedence over default config
    if (stateData?.oauthCredentials) {
      try {
        const storedCredentials = decryptTokens(stateData.oauthCredentials);
        console.log(`[BoxOAuth] Decrypted credentials from state document:`, {
          hasClientId: !!storedCredentials.clientId,
          hasClientSecret: !!storedCredentials.clientSecret,
          clientIdLength: storedCredentials.clientId?.length || 0,
          clientSecretLength: storedCredentials.clientSecret?.length || 0
        });
        
        // Use stored credentials if available (even if empty string, prefer stored over default)
        if (storedCredentials.clientId) {
          boxConfig.clientId = storedCredentials.clientId;
        }
        if (storedCredentials.clientSecret) {
          boxConfig.clientSecret = storedCredentials.clientSecret;
        }
        
        console.log(`[BoxOAuth] Using credentials from state document - credentials will be used for token exchange`);
      } catch (decryptError) {
        console.warn(`[BoxOAuth] Failed to decrypt stored credentials, using Firebase config:`, decryptError);
        // Continue with default config if decryption fails
      }
    } else {
      console.log(`[BoxOAuth] No stored credentials in state document, using default config from Firebase`);
    }
    
    // Log which credentials will be used (without exposing secrets)
    console.log(`[BoxOAuth] Final credentials configuration:`, {
      clientIdSource: stateData?.oauthCredentials ? 'state document' : 'default config',
      hasClientId: !!boxConfig.clientId,
      hasClientSecret: !!boxConfig.clientSecret,
      clientIdLength: boxConfig.clientId?.length || 0,
      redirectUri: boxConfig.redirectUri,
      scope: boxConfig.scope
    });
    
    if (!boxConfig.clientId || !boxConfig.clientSecret) {
      throw new Error('Box client ID and secret must be configured in Firebase Functions config or provided during OAuth initiation');
    }
    
    // Mark code as used BEFORE token exchange to prevent duplicate processing
    // This prevents race conditions if callback is processed multiple times
    await stateDoc.ref.update({
      codeUsed: true,
      codeUsedAt: Date.now()
    });
    console.log(`[BoxOAuth] Marked authorization code as used to prevent duplicate processing`);
    
    // Exchange code for tokens
    // IMPORTANT: redirectUri must match EXACTLY the one used in the authorization URL
    // Create Box SDK with credentials from state or config
    const BoxSDK = require('box-node-sdk');
    const boxSDK = new BoxSDK({
      clientID: boxConfig.clientId,
      clientSecret: boxConfig.clientSecret
    });
    
    // Log redirect URI for debugging - must match exactly (case-sensitive, no trailing slashes unless used)
    console.log(`[BoxOAuth] Exchanging code for tokens:`, {
      redirectUri: boxConfig.redirectUri,
      redirectUriFromState: stateData?.redirectUri,
      redirectUriFromConfig: defaultConfig.redirectUri,
      hasCode: !!code,
      codeLength: code?.length,
      clientId: hashForLogging(boxConfig.clientId || '')
    });
    
    let tokenInfo: any;
    try {
      // Box SDK v3 requires redirectURI parameter (must match authorization URL EXACTLY)
      // The redirect URI must be identical to what was used in authorization URL
      // USE THE REDIRECT URI FROM STATE IF AVAILABLE (critical for local dev support)
      const redirectUriToUse = stateData?.redirectUri || boxConfig.redirectUri;
      const normalizedRedirectUri = redirectUriToUse.trim();
      
      console.log(`[BoxOAuth] Attempting token exchange with redirectURI: ${normalizedRedirectUri}`, {
        source: stateData?.redirectUri ? 'state (local/dynamic)' : 'config (static)',
        originalConfig: boxConfig.redirectUri
      });
      
      tokenInfo = await boxSDK.getTokensAuthorizationCodeGrant(code, {
        redirectURI: normalizedRedirectUri
      });
      
      if (!tokenInfo.accessToken) {
        throw new Error('Failed to obtain access token');
      }
      
      console.log(`✅ [BoxOAuth] Successfully obtained Box access token for user ${hashForLogging(userId)}`);
    } catch (tokenError: any) {
      console.error('❌ [BoxOAuth] Token exchange failed:', tokenError);
      console.error('Token error details:', {
        message: tokenError.message,
        statusCode: tokenError.statusCode,
        response: tokenError.response,
        redirectUri: boxConfig.redirectUri,
        normalizedRedirectUri: boxConfig.redirectUri.trim(),
        errorCode: tokenError.code,
        errorType: tokenError.type
      });
      
      // Check if it's an invalid_grant error (code already used or expired)
      if (tokenError.message && (
        tokenError.message.includes('invalid_grant') ||
        tokenError.message.includes("doesn't exist") ||
        tokenError.message.includes('invalid for the client')
      )) {
        // Authorization code was already used or expired - cannot retry
        console.error('❌ [BoxOAuth] Authorization code invalid (already used or expired) - cannot retry');
        throw new Error(`Authorization code is invalid or has expired. Please restart the OAuth flow. Original error: ${tokenError.message}`);
      }
      
      // If redirectURI failed, try without options (some SDK versions handle it differently)
      if (tokenError.message && tokenError.message.includes('redirect')) {
        console.warn('⚠️ [Box] Token exchange failed with redirectURI, trying without redirectURI parameter...');
        try {
          tokenInfo = await boxSDK.getTokensAuthorizationCodeGrant(code);
          if (!tokenInfo.accessToken) {
            throw new Error('Failed to obtain access token');
          }
          console.log(`✅ [Box] Successfully obtained token without redirectURI parameter`);
        } catch (fallbackError: any) {
          console.error('❌ [BoxOAuth] Token exchange fallback also failed:', fallbackError);
          // Don't delete state here - let retry handle it
          throw new Error(`Failed to exchange authorization code for tokens: ${tokenError.message || 'Unknown error'}`);
        }
      } else {
        // Don't delete state here - let retry handle it
        throw new Error(`Failed to exchange authorization code for tokens: ${tokenError.message || 'Unknown error'}`);
      }
    }

    // Get user info
    // In Box SDK v3, getBasicClient returns a client that needs to be used with the users API
    // Try multiple methods to get user info for compatibility
    let userInfo: any;
    try {
      const client = boxSDK.getBasicClient(tokenInfo.accessToken);
      
      // Check if client.users.getCurrentUser exists
      if (client.users && typeof client.users.getCurrentUser === 'function') {
        userInfo = await client.users.getCurrentUser();
      } else if (client.users && typeof client.users.getCurrentUserFields === 'function') {
        // Fallback to getCurrentUserFields with empty fields array
        userInfo = await client.users.getCurrentUserFields([]);
      } else {
        // Last resort: use persistent client (may need refresh token)
        if (tokenInfo.refreshToken) {
          const persistentClient = boxSDK.getPersistentClient(tokenInfo.accessToken, tokenInfo.refreshToken);
          if (persistentClient.users && typeof persistentClient.users.getCurrentUser === 'function') {
            userInfo = await persistentClient.users.getCurrentUser();
          } else {
            throw new Error('Unable to find getCurrentUser method in Box SDK client');
          }
        } else {
          throw new Error('Refresh token not available and getCurrentUser method not found');
        }
      }
      
      console.log(`✅ [BoxOAuth] Successfully retrieved user info:`, {
        login: userInfo.login || userInfo.email || 'unknown',
        name: userInfo.name || 'unknown',
        id: userInfo.id || 'unknown'
      });
    } catch (userInfoError: any) {
      console.error('❌ [BoxOAuth] Failed to get user info via SDK:', {
        error: userInfoError.message,
        stack: userInfoError.stack
      });
      
      // Fallback: Use direct HTTP call to Box API
      try {
        console.log('🔄 [BoxOAuth] Attempting direct HTTP call to Box API...');
        const https = require('https');
        const userInfoUrl = 'https://api.box.com/2.0/users/me';
        
        const userInfoResponse = await new Promise((resolve, reject) => {
          const req = https.get(userInfoUrl, {
            headers: {
              'Authorization': `Bearer ${tokenInfo.accessToken}`,
              'Content-Type': 'application/json'
            }
          }, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const parsed = JSON.parse(data);
                  console.log(`✅ [BoxOAuth] HTTP response parsed successfully:`, {
                    login: parsed.login || parsed.email || 'unknown',
                    name: parsed.name || 'unknown',
                    id: parsed.id || 'unknown'
                  });
                  resolve(parsed);
                } catch (parseError) {
                  console.error(`❌ [BoxOAuth] Failed to parse Box API response:`, parseError);
                  reject(new Error(`Failed to parse Box API response: ${parseError}`));
                }
              } else {
                console.error(`❌ [BoxOAuth] Box API returned status ${res.statusCode}:`, data.substring(0, 200));
                reject(new Error(`Box API returned status ${res.statusCode}: ${data.substring(0, 200)}`));
              }
            });
          });
          
          req.on('error', (error: any) => {
            console.error(`❌ [BoxOAuth] HTTP request error:`, error.message);
            reject(error);
          });
          
          req.setTimeout(10000, () => {
            console.error(`❌ [BoxOAuth] HTTP request timeout after 10 seconds`);
            req.destroy();
            reject(new Error('Request timeout'));
          });
        });
        
        userInfo = userInfoResponse;
        console.log(`✅ [BoxOAuth] Successfully retrieved user info via HTTP:`, {
          login: userInfo.login || userInfo.email || 'unknown',
          name: userInfo.name || 'unknown',
          id: userInfo.id || 'unknown'
        });
      } catch (httpError: any) {
        console.error('❌ [BoxOAuth] Failed to get user info via HTTP:', {
          error: httpError.message,
          stack: httpError.stack
        });
        // If we can't get user info, we can still save tokens and use a placeholder
        // The user info can be retrieved later when needed
        userInfo = {
          login: '', // Will be populated later from token
          name: 'Box User'
        };
        console.warn('⚠️ [BoxOAuth] Continuing without user info - will be retrieved later');
      }
    }

    // Encrypt tokens for storage
    const tokens = {
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken,
      expiresAt: tokenInfo.expiresAt
    };
    const encryptedTokens = encryptTokens(tokens);

    // Store encrypted tokens in Firestore
    // Use organization-scoped collection to match Google Drive pattern
    const expiresAtTimestamp = tokenInfo.expiresAt 
      ? admin.firestore.Timestamp.fromDate(new Date(tokenInfo.expiresAt))
      : null;
    
    // Store Box credentials in integration document if they were provided during OAuth
    // This allows token refresh to work even if Firebase config is not set
    let encryptedOAuthCredentials: string | undefined;
    if (stateData?.oauthCredentials) {
      // Credentials were provided during OAuth initiation, store them for future use
      encryptedOAuthCredentials = stateData.oauthCredentials;
      console.log(`[BoxOAuth] Storing Box credentials in integration document for future token refresh`);
    }
    
    const integrationDoc = {
      userId: String(userId),
      organizationId: String(organizationId),
      provider: 'box',
      accountEmail: String(userInfo.login || ''),
      accountName: String(userInfo.name || ''),
      encryptedTokens,
      isActive: true, // Mark as active for easier detection
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp
    };
    
    // Add OAuth credentials if available (for token refresh)
    if (encryptedOAuthCredentials) {
      (integrationDoc as any).oauthCredentials = encryptedOAuthCredentials;
    }

    // Store in organization-scoped collection at org level (not user level) for team-wide access
    // Document ID: 'box' - all users in org share the same Box connection (consistent with Google Drive)
    console.log(`[BoxOAuth] Writing to Firestore: organizations/${organizationId}/cloudIntegrations/box`);
    try {
      await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box')
        .set(integrationDoc);
      
      console.log(`✅ [BoxOAuth] Successfully saved cloud integration document: box (org-level)`);
      
      // Verify the write succeeded by reading it back
      const verifyDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box')
        .get();
      
      if (verifyDoc.exists) {
        console.log(`✅ [BoxOAuth] Verification: Document confirmed in Firestore`);
      } else {
        console.error(`❌ [BoxOAuth] Verification failed: Document not found after write`);
      }
    } catch (firestoreError: any) {
      console.error(`❌ [BoxOAuth] Firestore write failed:`, {
        error: firestoreError.message,
        stack: firestoreError.stack,
        code: firestoreError.code,
        organizationId,
        userId: hashForLogging(userId)
      });
      throw new Error(`Failed to save Box integration to Firestore: ${firestoreError.message}`);
    }

    // NOW delete the state document - only after successful token exchange and storage
    // This prevents race conditions and allows retries
    try {
      await stateDoc.ref.delete();
      console.log(`✅ [BoxOAuth] State document cleaned up successfully`);
    } catch (deleteError) {
      // Log but don't fail if state deletion fails - it's just cleanup
      // State might already be deleted by concurrent request - that's OK
      console.warn(`⚠️ [BoxOAuth] Failed to delete state document (non-critical, may already be deleted):`, deleteError);
    }

    // Create or update integration record (matches Slack pattern)
    try {
      const integrationRecordRef = admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('box-integration');

      // Check if record exists to preserve createdAt
      const existingRecord = await integrationRecordRef.get();
      const existingData = existingRecord.data();

      // Extract credentials if they were provided during OAuth (from stateData)
      let credentialsToSave: Record<string, string> = {};
      if (stateData?.oauthCredentials) {
        try {
          const storedCredentials = decryptTokens(stateData.oauthCredentials);
          // Save credentials to integrationConfigs for UI display
          if (storedCredentials.clientId) {
            credentialsToSave.clientId = storedCredentials.clientId;
          }
          if (storedCredentials.clientSecret) {
            // Store client secret (it's already encrypted in state, but we store it plain in integrationConfigs for user visibility)
            // Note: This is less secure but allows users to see/edit their credentials
            credentialsToSave.clientSecret = storedCredentials.clientSecret;
          }
          console.log(`[BoxOAuth] Saving credentials to integrationConfigs: clientId=${!!credentialsToSave.clientId}, clientSecret=${!!credentialsToSave.clientSecret}`);
        } catch (decryptError) {
          console.warn(`[BoxOAuth] Failed to decrypt credentials for integrationConfigs:`, decryptError);
          // Preserve existing credentials if decryption fails
          credentialsToSave = existingData?.credentials || {};
        }
      } else {
        // No credentials in state - preserve existing credentials if they exist
        credentialsToSave = existingData?.credentials || {};
      }

      const integrationRecord = {
        id: 'box-integration',
        name: 'Box Integration',
        type: 'box',
        enabled: true,
        organizationId: organizationId,
        accountEmail: String(userInfo.login || ''),
        accountName: String(userInfo.name || ''),
        credentials: credentialsToSave, // Save credentials if provided
        settings: existingData?.settings || {},
        testStatus: 'success',
        testMessage: `Connected to Box as ${userInfo.login || 'Box account'}`,
        createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
      console.log(`✅ [BoxOAuth] Created/updated integration record for Box`);
    } catch (recordError) {
      // Don't fail the whole OAuth flow if integration record creation fails
      console.warn('⚠️ [BoxOAuth] Failed to create integration record:', recordError);
    }

    console.log(`Box OAuth completed for user ${hashForLogging(userId)} in org ${organizationId}, account: ${userInfo.login}`);

    return createSuccessResponse({
      accountEmail: userInfo.login,
      accountName: userInfo.name,
      connected: true
    });

  } catch (error) {
    console.error('Box OAuth callback failed:', error);
    return createErrorResponse('Failed to complete Box OAuth', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Refresh Box access token
 */
export async function refreshBoxAccessToken(userId: string, organizationId: string): Promise<any> {
  try {
    // Use organization-level token (box) - all users in org share the same Box connection
    // Try new org-level location first (organizations/{orgId}/cloudIntegrations/box)
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('box')
      .get();

    // Fallback to old box_org location for migration compatibility
    if (!integrationDoc.exists) {
      console.log(`[BoxTokenRefresh] Org-level token (box) not found, trying box_org for migration...`);
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box_org')
        .get();
    }

    // Fallback to old per-user location for migration compatibility
    if (!integrationDoc.exists) {
      console.log(`[BoxTokenRefresh] Trying per-user location for migration...`);
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(`box_${userId}`)
        .get();
    }

    // Fallback to old global location for migration compatibility
    if (!integrationDoc.exists) {
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${organizationId}_box_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      console.error(`[BoxTokenRefresh] Integration not found for org ${organizationId}`);
      throw new Error('Box integration not found. Please have an admin connect the Box account.');
    }

    const integrationData = integrationDoc.data();
    const encryptedTokens = integrationData?.encryptedTokens;

    if (!encryptedTokens) {
      console.error(`[BoxTokenRefresh] No encrypted tokens found for user ${hashForLogging(userId)}`);
      throw new Error('No tokens found for Box integration. Please re-connect your Box account.');
    }

    // Decrypt tokens
    let tokens;
    try {
      tokens = decryptTokens(encryptedTokens);
      console.log(`[BoxTokenRefresh] Successfully decrypted tokens for user ${hashForLogging(userId)}`);
    } catch (decryptError: any) {
      console.error(`[BoxTokenRefresh] Failed to decrypt tokens:`, decryptError.message);
      throw new Error('Failed to decrypt Box tokens. Please re-connect your Box account.');
    }

    // Check if access token is still valid (not expired)
    // If expiresAt is set and not expired, use the existing access token
    if (tokens.expiresAt && tokens.accessToken) {
      const expiresAt = tokens.expiresAt instanceof Date 
        ? tokens.expiresAt 
        : typeof tokens.expiresAt === 'string' 
          ? new Date(tokens.expiresAt)
          : tokens.expiresAt?.toDate?.();
      
      if (expiresAt && expiresAt > new Date(Date.now() + 60000)) { // 1 minute buffer
        console.log(`[BoxTokenRefresh] Access token still valid, using existing token`);
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        };
      }
    }

    // Token expired or no expiry info, refresh it
    if (!tokens.refreshToken) {
      console.error(`[BoxTokenRefresh] No refresh token available for user ${hashForLogging(userId)}`);
      throw new Error('No refresh token available. Please re-connect your Box account.');
    }

    console.log(`[BoxTokenRefresh] Refreshing access token for user ${hashForLogging(userId)}`);

    // Get Box config - try organization-specific config first, then fall back to defaults
    const defaultConfig = await getBoxConfig(organizationId);
    let boxConfig = {
      clientId: defaultConfig.clientId,
      clientSecret: defaultConfig.clientSecret
    };

    // Check if credentials are stored in the integration document (for user-provided credentials)
    if (integrationData?.oauthCredentials) {
      try {
        const storedCredentials = decryptTokens(integrationData.oauthCredentials);
        boxConfig.clientId = storedCredentials.clientId || boxConfig.clientId;
        boxConfig.clientSecret = storedCredentials.clientSecret || boxConfig.clientSecret;
        console.log(`[BoxTokenRefresh] Using credentials from integration document`);
      } catch (decryptError) {
        console.warn(`[BoxTokenRefresh] Failed to decrypt stored credentials, using Firebase config:`, decryptError);
      }
    }

    if (!boxConfig.clientId || !boxConfig.clientSecret) {
      console.error(`[BoxTokenRefresh] Missing Box credentials:`, {
        hasClientId: !!boxConfig.clientId,
        hasClientSecret: !!boxConfig.clientSecret,
        hasStoredCredentials: !!integrationData?.oauthCredentials,
        hasEnvClientId: !!process.env.BOX_CLIENT_ID,
        hasConfigClientId: !!functions.config().box?.client_id,
        organizationId
      });
      throw new Error('Box client ID and secret must be configured. Please set BOX_CLIENT_ID and BOX_CLIENT_SECRET environment variables or configure via Firebase Functions config (firebase functions:config:set box.client_id="..." box.client_secret="...").');
    }

    // Refresh token
    const BoxSDK = require('box-node-sdk');
    const boxSDK = new BoxSDK({
      clientID: boxConfig.clientId,
      clientSecret: boxConfig.clientSecret
    });

    let tokenInfo;
    try {
      tokenInfo = await boxSDK.getTokensRefreshGrant(tokens.refreshToken);
      console.log(`[BoxTokenRefresh] Successfully refreshed token for user ${hashForLogging(userId)}`);
    } catch (refreshError: any) {
      console.error(`[BoxTokenRefresh] Token refresh failed:`, {
        error: refreshError.message,
        stack: refreshError.stack,
        statusCode: refreshError.statusCode,
        statusText: refreshError.statusText,
        userId: hashForLogging(userId),
        organizationId
      });
      
      // Check if refresh token has expired
      const isRefreshTokenExpired = 
        refreshError.message?.toLowerCase().includes('refresh token') && 
        refreshError.message?.toLowerCase().includes('expired');
      
      if (isRefreshTokenExpired || refreshError.statusCode === 400) {
        // Mark integration as inactive so user knows to reconnect
        try {
          const orgLevelRef = admin.firestore()
            .collection('organizations')
            .doc(organizationId)
            .collection('cloudIntegrations')
            .doc('box');
          
          await orgLevelRef.update({
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[BoxTokenRefresh] Marked Box integration as inactive due to expired refresh token`);
        } catch (updateError) {
          console.warn(`[BoxTokenRefresh] Failed to mark integration as inactive:`, updateError);
        }

        // Send system alert
        await sendSystemAlert(
          organizationId,
          'Box Integration Failed',
          'The Box integration has been disconnected due to an expired refresh token. Please re-authenticate in Integration Settings.',
          {
            error: refreshError.message,
            statusCode: refreshError.statusCode
          }
        );
        
        throw new Error('Box refresh token has expired. Please have an admin re-connect the Box account in Integration Settings.');
      }
      
      throw new Error(`Failed to refresh Box token: ${refreshError.message}. Please have an admin re-connect the Box account.`);
    }

    // Encrypt new tokens
    // Box may or may not return a new refresh token - if not provided, keep the existing one
    const newTokens = {
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken || tokens.refreshToken, // Use new refresh token if provided, otherwise keep existing
      expiresAt: tokenInfo.expiresAt
    };
    
    if (!newTokens.refreshToken) {
      console.warn(`[BoxTokenRefresh] No refresh token in refresh response, keeping existing token`);
    }
    
    const newEncryptedTokens = encryptTokens(newTokens);

    // Update Firestore - use new location format
    const expiresAtTimestamp = tokenInfo.expiresAt 
      ? admin.firestore.Timestamp.fromDate(new Date(tokenInfo.expiresAt))
      : null;
    
    const updateData: any = {
      encryptedTokens: newEncryptedTokens,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp
    };

    // Always update/migrate to org-level location (box)
    const orgLevelRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('box');

    if (integrationDoc.ref.path === orgLevelRef.path) {
      // Already in org-level location, just update
      await orgLevelRef.update(updateData);
      console.log(`[BoxTokenRefresh] Updated org-level token for org ${organizationId}`);
    } else {
      // Migrate to org-level location
      console.log(`[BoxTokenRefresh] Migrating token from ${integrationDoc.ref.path} to org-level location`);
      await orgLevelRef.set({
        ...integrationData,
        ...updateData,
        createdAt: integrationData?.createdAt || admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[BoxTokenRefresh] Successfully migrated to org-level token for org ${organizationId}`);
    }

    return newTokens;

  } catch (error) {
    console.error('[BoxTokenRefresh] Box token refresh failed:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: hashForLogging(userId),
      organizationId
    });
    throw error;
  }
}

/**
 * List Box folders
 */
export const listBoxFolders = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderId = '0' } = data; // '0' is root folder in Box

    console.log(`[BoxFolders] Listing folders for user ${hashForLogging(userId)} in org ${organizationId}, folderId: ${folderId}`);

    // Get and refresh organization-level tokens (all users share the same Box connection)
    let tokens;
    try {
      tokens = await refreshBoxAccessToken(userId, organizationId);
      console.log(`[BoxFolders] Successfully refreshed org-level tokens for org ${organizationId}`);
      
      // Log which account this is for (check org-level token first)
      let integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box')
        .get();
      
      // Fallback to old box_org location for migration
      if (!integrationDoc.exists) {
        integrationDoc = await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc('box_org')
          .get();
      }
      
      // Fallback to per-user location for migration
      if (!integrationDoc.exists) {
        integrationDoc = await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc(`box_${userId}`)
          .get();
      }
      
      if (integrationDoc.exists) {
        const integrationData = integrationDoc.data();
        console.log(`[BoxFolders] Box account info:`, {
          accountEmail: integrationData?.accountEmail || 'unknown',
          accountName: integrationData?.accountName || 'unknown',
          isActive: integrationData?.isActive || false,
          tokenLocation: integrationDoc.id === 'box' || integrationDoc.id === 'box_org' ? 'org-level' : 'per-user'
        });
      }
    } catch (tokenError: any) {
      console.error(`[BoxFolders] Failed to refresh tokens:`, {
        error: tokenError.message,
        stack: tokenError.stack,
        userId: hashForLogging(userId),
        organizationId
      });
      throw new Error(`Failed to get Box access token: ${tokenError.message}. Please have an admin connect the Box account.`);
    }

    if (!tokens || !tokens.accessToken) {
      throw new Error('No access token available. Please re-connect your Box account.');
    }

    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    console.log(`[BoxFolders] Calling Box API to list folders in folderId: ${folderId}`);
    
    // List folders
    let response;
    try {
      response = await client.folders.getItems(folderId, {
        fields: 'id,name,type,created_at,modified_at,parent',
        limit: 1000
      });
      
      // Log the raw response structure IMMEDIATELY after getting it
      console.log(`[BoxFolders] IMMEDIATE response check:`, {
        responseType: typeof response,
        responseConstructor: response?.constructor?.name,
        responseKeys: response ? Object.keys(response) : [],
        hasEntries: 'entries' in (response || {}),
        entriesValue: response?.entries,
        entriesType: typeof response?.entries,
        entriesIsArray: Array.isArray(response?.entries),
        entriesLength: response?.entries?.length || 0,
        // Check if it's a Box SDK response wrapper
        hasTotalCount: 'totalCount' in (response || {}),
        hasItemCollection: 'itemCollection' in (response || {}),
        // Try to stringify a sample
        responseSample: response ? JSON.stringify(response).substring(0, 500) : 'null'
      });
      
      // Log the raw response structure
      console.log(`[BoxFolders] Raw Box API response:`, {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : [],
        entriesLength: response?.entries?.length || 0,
        hasEntries: !!response?.entries,
        entriesIsArray: Array.isArray(response?.entries)
      });
      
      console.log(`[BoxFolders] Successfully received response from Box API: ${response.entries?.length || 0} items`);
      
      // Log detailed information about what was returned
      if (response.entries && response.entries.length > 0) {
        const itemTypes = response.entries.reduce((acc: any, item: any) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {});
        console.log(`[BoxFolders] Item types breakdown:`, itemTypes);
        console.log(`[BoxFolders] Sample items:`, response.entries.slice(0, 3).map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type
        })));
        
        // Log ALL items to see what we're getting
        console.log(`[BoxFolders] All items with types:`, response.entries.map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          typeDetails: typeof item.type,
          allKeys: Object.keys(item)
        })));
      } else {
        console.warn(`[BoxFolders] No entries returned from Box API for folderId: ${folderId}`);
      }
    } catch (apiError: any) {
      console.error(`[BoxFolders] Box API error:`, {
        error: apiError.message,
        stack: apiError.stack,
        statusCode: apiError.statusCode,
        statusText: apiError.statusText,
        folderId
      });
      
      // Provide more specific error messages
      if (apiError.statusCode === 401) {
        throw new Error('Box authentication failed. Please re-connect your Box account.');
      } else if (apiError.statusCode === 404) {
        throw new Error(`Box folder not found: ${folderId}`);
      } else if (apiError.statusCode === 403) {
        throw new Error('Access denied. Please check your Box account permissions.');
      } else {
        throw new Error(`Box API error: ${apiError.message || 'Unknown error'}`);
      }
    }

    // Log response structure AFTER try-catch to see what we have
    console.log(`[BoxFolders] After try-catch, checking response structure:`, {
      hasResponse: !!response,
      responseType: typeof response,
      responseKeys: response ? Object.keys(response) : [],
      hasEntries: !!response?.entries,
      entriesType: typeof response?.entries,
      entriesIsArray: Array.isArray(response?.entries),
      entriesLength: response?.entries?.length || 0,
      // Try to see if entries is nested differently
      responseStr: JSON.stringify(response).substring(0, 1000)
    });

    // Handle case where response.entries might be undefined or empty
    if (!response || !response.entries || !Array.isArray(response.entries)) {
      console.warn(`[BoxFolders] Invalid response structure:`, {
        hasResponse: !!response,
        hasEntries: !!response?.entries,
        entriesType: typeof response?.entries,
        entriesIsArray: Array.isArray(response?.entries),
        responseStringified: response ? JSON.stringify(response).substring(0, 500) : 'null'
      });
      return { success: true, folders: [] };
    }

    console.log(`[BoxFolders] About to filter ${response.entries.length} items for folders...`);

    const folders = response.entries
      .filter(item => {
        const isFolder = item && item.type === 'folder';
        if (!isFolder && item) {
          console.log(`[BoxFolders] Skipping non-folder item:`, { id: item.id, name: item.name, type: item.type });
        }
        return isFolder;
      })
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        type: folder.type,
        createdTime: folder.created_at,
        modifiedTime: folder.modified_at,
        parents: folder.parent ? [folder.parent.id] : []
      }));

    console.log(`[BoxFolders] Successfully processed ${folders.length} folders out of ${response.entries.length} total items`);

    // Use createSuccessResponse to wrap folders in data property (consistent with other functions)
    return createSuccessResponse({ folders });

  } catch (error) {
    console.error('[BoxFolders] Failed to list Box folders:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: context.auth?.uid ? hashForLogging(context.auth.uid) : 'unknown',
      organizationId: context.auth?.token?.organizationId || 'unknown',
      folderId: data?.folderId || 'unknown'
    });
    return createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Box files in a folder
 */
export const getBoxFiles = functions.https.onCall(async (data, context) => {
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

    // Get and refresh organization-level tokens (all users share the same Box connection)
    const tokens = await refreshBoxAccessToken(userId, organizationId);
    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    // List files in folder
    const response = await client.folders.getItems(folderId, {
      fields: 'id,name,type,size,created_at,modified_at,shared_link',
      limit: 1000
    });

    const files = response.entries
      .filter(item => item.type === 'file')
      .map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdTime: file.created_at,
        modifiedTime: file.modified_at,
        downloadUrl: file.shared_link?.download_url
      }));

    // Use createSuccessResponse to wrap files in data property (consistent with other functions)
    return createSuccessResponse({ files });

  } catch (error) {
    console.error('Failed to get Box files:', error);
    return createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Create Box folder
 */
export const createBoxFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, parentId = '0' } = data; // '0' is root folder in Box

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get and refresh tokens
    const tokens = await refreshBoxAccessToken(userId, organizationId);
    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    // Create folder
    const response = await client.folders.create(parentId, name);

    const folder = {
      id: response.id,
      name: response.name,
      type: response.type,
      createdTime: response.created_at,
      modifiedTime: response.modified_at,
      parents: response.parent ? [response.parent.id] : []
    };

    return createSuccessResponse({ folder });

  } catch (error) {
    console.error('Failed to create Box folder:', error);
    return createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Upload file to Box - HTTP version with CORS support
 */
export const uploadToBoxHttp = functions.https.onRequest(async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Box upload HTTP request received:`, {
    method: req.method,
    hasAuth: !!req.headers.authorization,
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });

  try {
    // Handle preflight requests FIRST (before setting other headers)
    if (req.method === 'OPTIONS') {
      console.log(`[${requestId}] Handling OPTIONS preflight from origin: ${req.headers.origin}`);
      // Set CORS headers for preflight
      setCorsHeaders(req, res);
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.set('Access-Control-Max-Age', '3600');
      res.status(200).send('');
      return;
    }
    
    // Set CORS headers for actual request
    setCorsHeaders(req, res);

    // Only allow POST requests
    if (req.method !== 'POST') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      res.status(405).send('Method Not Allowed');
      return;
    }

    console.log(`[${requestId}] Step 1: Verifying authentication token...`);
    // Verify user authentication
    const { userId, organizationId } = await verifyAuthToken(req);
    console.log(`[${requestId}] Step 1 complete:`, {
      userId: hashForLogging(userId),
      organizationId,
      hasUserId: !!userId,
      hasOrgId: !!organizationId
    });

    const { fileName, fileContent, folderId = '0' } = req.body;

    if (!fileName || !fileContent) {
      console.log(`[${requestId}] Missing required fields:`, { hasFileName: !!fileName, hasFileContent: !!fileContent });
      res.status(400).json(createErrorResponse('File name and content are required'));
      return;
    }

    console.log(`[${requestId}] Step 2: Getting and refreshing Box tokens...`);
    // Get and refresh tokens
    const tokens = await refreshBoxAccessToken(userId, organizationId);
    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    console.log(`[${requestId}] Step 3: Converting base64 to buffer and uploading...`);
    // Convert base64 content to buffer
    const fileBuffer = Buffer.from(fileContent, 'base64');
    
    console.log(`[${requestId}] Upload parameters:`, {
      folderId,
      fileName,
      fileSize: fileBuffer.length,
      bufferType: fileBuffer.constructor.name
    });

    // Upload file using Box SDK
    // Box SDK v3 uploadFile signature: uploadFile(parentFolderId, fileName, fileContent, options?, callback?)
    // The SDK returns a promise when no callback is provided
    let uploadResponse;
    try {
      // Pass null for options to use defaults, SDK will return a promise
      uploadResponse = await client.files.uploadFile(folderId, fileName, fileBuffer, null);
      console.log(`[${requestId}] Box SDK uploadFile returned:`, {
        type: typeof uploadResponse,
        constructor: uploadResponse?.constructor?.name,
        hasId: !!uploadResponse?.id,
        hasEntries: !!uploadResponse?.entries,
        keys: uploadResponse ? Object.keys(uploadResponse) : []
      });
    } catch (uploadError: any) {
      console.error(`[${requestId}] Box SDK uploadFile error:`, {
        message: uploadError?.message,
        statusCode: uploadError?.statusCode,
        response: uploadError?.response?.body || uploadError?.response,
        stack: uploadError?.stack
      });
      throw uploadError;
    }
    
    // Box SDK returns response with entries array containing the uploaded file
    const uploadedFile = uploadResponse?.entries?.[0] || uploadResponse;
    
    console.log(`[${requestId}] Box API response structure:`, {
      hasEntries: !!uploadResponse?.entries,
      entriesLength: uploadResponse?.entries?.length,
      directId: uploadResponse?.id,
      entriesId: uploadResponse?.entries?.[0]?.id,
      finalFileId: uploadedFile?.id,
      fileName: uploadedFile?.name,
      responseKeys: uploadResponse ? Object.keys(uploadResponse) : []
    });

    if (!uploadedFile || !uploadedFile.id) {
      console.error(`[${requestId}] ❌ Box upload response missing file ID. Full response:`, JSON.stringify(uploadResponse, null, 2));
      throw new Error('Box upload response missing file ID');
    }

    // Create a shared link for the file so it can be accessed
    let sharedLink = uploadedFile.shared_link;
    if (!sharedLink) {
      try {
        console.log(`[${requestId}] Creating shared link for file ${uploadedFile.id}...`);
        const sharedLinkResponse = await client.files.update(uploadedFile.id, {
          shared_link: {
            access: 'open',
            permissions: {
              can_download: true,
              can_preview: true
            }
          }
        });
        sharedLink = sharedLinkResponse.shared_link;
        console.log(`[${requestId}] ✅ Created shared link:`, {
          url: sharedLink?.url,
          downloadUrl: sharedLink?.download_url
        });
      } catch (linkError) {
        console.warn(`[${requestId}] ⚠️ Failed to create shared link (file still uploaded):`, linkError);
        // Continue without shared link - file is still uploaded successfully
      }
    }

    const file = {
      id: String(uploadedFile.id),
      name: uploadedFile.name,
      type: uploadedFile.type,
      size: uploadedFile.size,
      createdTime: uploadedFile.created_at,
      modifiedTime: uploadedFile.modified_at,
      downloadUrl: sharedLink?.download_url || `https://app.box.com/file/${uploadedFile.id}`,
      webViewLink: sharedLink?.url || `https://app.box.com/file/${uploadedFile.id}`
    };

    console.log(`[${requestId}] ✅ Upload successful:`, { 
      fileId: file.id, 
      fileName: file.name,
      hasSharedLink: !!sharedLink,
      downloadUrl: file.downloadUrl,
      webViewLink: file.webViewLink
    });
    res.status(200).json(createSuccessResponse({ file }));

  } catch (error: any) {
    console.error(`[${requestId}] ❌ Failed to upload to Box:`, error);
    
    // Handle specific Box API errors
    if (error?.statusCode === 409 || error?.status === 409) {
      const errorMessage = error?.body?.message || error?.message || 'A file with this name already exists';
      console.log(`[${requestId}] File already exists error:`, errorMessage);
      res.status(409).json(createErrorResponse('File already exists', errorMessage));
      return;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error?.statusCode || error?.status || 500;
    res.status(statusCode).json(createErrorResponse('Failed to upload file', errorMessage));
  }
});

/**
 * Upload file to Box - Callable version (kept for backwards compatibility)
 * TEMPORARILY DISABLED due to GCF gen1 CPU configuration issue
 * Use uploadToBoxHttp instead
 */
/*
export const uploadToBox = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileName, fileContent, folderId = '0' } = data; // '0' is root folder in Box

    if (!fileName || !fileContent) {
      throw new Error('File name and content are required');
    }

    // Get and refresh tokens
    const tokens = await refreshBoxAccessToken(userId, organizationId);
    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    // Convert base64 content to buffer
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Upload file
    const response = await client.files.uploadFile(folderId, fileName, fileBuffer);

    const file = {
      id: response.id,
      name: response.name,
      type: response.type,
      size: response.size,
      createdTime: response.created_at,
      modifiedTime: response.modified_at,
      downloadUrl: response.shared_link?.download_url
    };

    return createSuccessResponse({ file });

  } catch (error) {
    console.error('Failed to upload to Box:', error);
    return createErrorResponse('Failed to upload file', error instanceof Error ? error.message : 'Unknown error');
  }
});
*/

/**
 * Index Box folder - List files and store metadata with shared links for organization-wide access
 */
export const indexBoxFolder = functions.https.onCall(async (data, context) => {
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

    console.log(`📁 [BoxIndexing] Indexing Box folder ${folderId} for org ${organizationId} by user ${hashForLogging(userId)}`);

    // Get organization-level encrypted tokens from Firestore (all users share the same Box connection)
    // Try org-level location first (organizations/{orgId}/cloudIntegrations/box)
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('box')
      .get();

    // Fallback to old box_org location for migration
    if (!integrationDoc.exists) {
      console.log(`[BoxIndexing] Org-level token (box) not found, trying box_org for migration...`);
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box_org')
        .get();
    }

    // Fallback to per-user location for migration
    let integrationDocToUse = integrationDoc;
    if (!integrationDoc.exists) {
      console.log(`[BoxIndexing] Trying per-user location for migration...`);
      integrationDocToUse = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(`box_${userId}`)
        .get();
    }

    if (!integrationDocToUse.exists) {
      return createErrorResponse('Box not connected. Please have an admin connect the Box account.', 'NOT_FOUND');
    }

    const integrationData = integrationDocToUse.data();
    if (!integrationData?.encryptedTokens) {
      return createErrorResponse('No OAuth tokens found', 'NOT_FOUND');
    }

    // Decrypt tokens and refresh if needed (uses org-level token)
    const tokens = await refreshBoxAccessToken(userId, organizationId);
    
    // Set up Box client
    const boxSDK = await getBoxSDK(organizationId);
    const client = boxSDK.getBasicClient(tokens.accessToken);

    // List files in the folder (limit to 1000 for now)
    console.log(`📋 [BoxIndexing] Listing files in folder ${folderId}`);
    const folderItems = await client.folders.getItems(folderId, {
      fields: 'id,name,type,size,created_at,modified_at,shared_link,parent',
      limit: 1000
    });

    const files = folderItems.entries || [];
    console.log(`📦 [BoxIndexing] Found ${files.length} items in folder ${folderId}`);

    // Filter to only files (not folders) and create shared links for video files
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.mpg', '.mpeg'];
    const batch = admin.firestore().batch();
    const indexedFilesRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('boxIndexedFiles');

    let filesIndexed = 0;
    let sharedLinksCreated = 0;

    for (const item of files) {
      // Only process files, skip folders
      if (item.type !== 'file') {
        continue;
      }

      const fileName = item.name || '';
      const isVideo = videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
      
      let sharedLink = item.shared_link?.url;

      // If it's a video file and doesn't have a shared link, create one
      if (isVideo && !sharedLink) {
        try {
          console.log(`🔗 [BoxIndexing] Creating shared link for video: ${fileName}`);
          const updatedFile = await client.files.update(item.id, {
            shared_link: {
              access: 'open', // Anyone with the link can view
              permissions: {
                can_download: true,
                can_preview: true
              }
            }
          });
          sharedLink = updatedFile.shared_link?.url;
          if (sharedLink) {
            sharedLinksCreated++;
            console.log(`✅ [BoxIndexing] Created shared link for ${fileName}`);
          }
        } catch (linkError) {
          console.warn(`⚠️ [BoxIndexing] Failed to create shared link for ${fileName}:`, linkError);
          // Continue indexing even if shared link creation fails
        }
      }

      // Store indexed file in Firestore
      const fileDoc = {
        name: fileName,
        boxFileId: item.id,
        mimeType: '', // Box API doesn't always provide mime type in list
        size: item.size || 0,
        webViewLink: sharedLink || undefined,
        downloadUrl: sharedLink || undefined, // Use shared link for download too
        parentFolderId: folderId,
        boxUserId: userId,
        boxUserEmail: integrationData.accountEmail || '',
        indexedBy: userId,
        indexedAt: admin.firestore.FieldValue.serverTimestamp(),
        organizationId: organizationId,
        createdAt: item.created_at || null,
        modifiedAt: item.modified_at || null,
        hasSharedLink: !!sharedLink,
        isVideo: isVideo
      };

      batch.set(indexedFilesRef.doc(item.id), fileDoc);
      filesIndexed++;
    }

    await batch.commit();

    console.log(`✅ [BoxIndexing] Successfully indexed ${filesIndexed} files from folder ${folderId}`);
    console.log(`🔗 [BoxIndexing] Created ${sharedLinksCreated} new shared links for videos`);

    return createSuccessResponse({
      success: true,
      filesIndexed: filesIndexed,
      folderId: folderId,
      sharedLinksCreated: sharedLinksCreated
    });

  } catch (error) {
    console.error('❌ [BoxIndexing] Failed to index Box folder:', error);
    return createErrorResponse('Failed to index folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Box integration status
 */
export const getBoxIntegrationStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Check organization-level token first (all users share the same Box connection)
    // Try org-level location first (organizations/{orgId}/cloudIntegrations/box)
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('box')
      .get();

    // Fallback to old box_org location for migration compatibility
    if (!integrationDoc.exists) {
      console.log(`[BoxIntegrationStatus] Org-level token (box) not found, trying box_org for migration...`);
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('box_org')
        .get();
    }

    // Fallback to per-user location for migration compatibility
    if (!integrationDoc.exists) {
      console.log(`[BoxIntegrationStatus] Trying per-user location for migration...`);
      integrationDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc(`box_${userId}`)
        .get();
    }

    // Fallback to old global location for migration compatibility
    if (!integrationDoc.exists) {
      integrationDoc = await admin.firestore()
        .collection('cloudIntegrations')
        .doc(`${organizationId}_box_${userId}`)
        .get();
    }

    if (!integrationDoc.exists) {
      return createSuccessResponse({ connected: false });
    }

    const integrationData = integrationDoc.data();
    
    // Handle both old format (milliseconds) and new format (Timestamp)
    let expiresAt: Date | null = null;
    
    // Check expiresAt timestamp first (new format)
    if (integrationData?.expiresAt) {
      if (typeof integrationData.expiresAt.toDate === 'function') {
        expiresAt = integrationData.expiresAt.toDate();
      } else if (typeof integrationData.expiresAt === 'number') {
        expiresAt = new Date(integrationData.expiresAt);
      }
    }
    // Fallback to expiresAtMillis (old format - plain number)
    else if (integrationData?.expiresAtMillis) {
      expiresAt = new Date(Number(integrationData.expiresAtMillis));
    }
    
    const isExpired = expiresAt && expiresAt < new Date();

    return createSuccessResponse({
      connected: !isExpired,
      accountEmail: integrationData?.accountEmail,
      accountName: integrationData?.accountName,
      expiresAt: expiresAt?.toISOString() || null
    });

  } catch (error) {
    console.error('Failed to get Box integration status:', error);
    return createErrorResponse('Failed to get integration status', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Box access token (decrypted)
 * Returns the decrypted access token for client-side use
 */
export const getBoxAccessToken = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Get and refresh organization-level tokens (this handles decryption)
    // All users in the org share the same Box connection
    const tokens = await refreshBoxAccessToken(userId, organizationId);

    return createSuccessResponse({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt instanceof Date 
        ? tokens.expiresAt.toISOString()
        : typeof tokens.expiresAt === 'string'
          ? tokens.expiresAt
          : tokens.expiresAt?.toDate?.()?.toISOString() || null
    });

  } catch (error) {
    console.error('Failed to get Box access token:', error);
    return createErrorResponse('Failed to get access token', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Save Box configuration to Firestore
 * Similar to saveSlackConfig - stores organization-specific Box credentials
 */
/**
 * @deprecated This function has been migrated to the new modular structure.
 * Use `saveBoxConfig` from './box/config' instead.
 * This function is kept for backward compatibility only.
 */
export const saveBoxConfig = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { organizationId, clientId, clientSecret, redirectUri, scope } = data;

    if (!organizationId || !clientId || !clientSecret) {
      throw new Error('Missing required configuration fields: organizationId, clientId, and clientSecret are required');
    }

    console.log(`💾 [BoxConfig] Saving config for org: ${organizationId} by user: ${context.auth.uid}`);

    // Verify user is admin of the organization
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData || userData.organizationId !== organizationId) {
      throw new Error('User does not belong to this organization');
    }

    // Check if user is admin
    if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
      throw new Error('Only organization admins can configure integrations');
    }

    // Encrypt client secret before storing
    // encryptTokens expects an object, so we wrap the clientSecret
    const encryptedClientSecret = encryptTokens({ clientSecret });

    // Save configuration to integrationConfigs (unified storage)
    const configRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc('box-integration');

    // Check if record exists to preserve createdAt
    const existingRecord = await configRef.get();
    const existingData = existingRecord.data();

    const configData = {
      id: 'box-integration',
      name: 'Box Integration',
      type: 'box',
      enabled: true,
      organizationId: organizationId,
      credentials: {
        clientId: clientId,
        clientSecret: encryptedClientSecret
      },
      settings: {
        redirectUri: redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
        scope: scope || 'root_readwrite'
      },
      createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await configRef.set(configData, { merge: true });

    // Also save to integrationSettings for backward compatibility (temporary during migration)
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationSettings')
      .doc('box')
      .set({
        clientId,
        clientSecret: encryptedClientSecret,
        redirectUri: redirectUri || 'https://clipshowpro.web.app/auth/box/callback.html',
        scope: scope || 'root_readwrite',
        isConfigured: true,
        configuredBy: context.auth.uid,
        configuredAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    console.log(`✅ [BoxConfig] Config saved successfully to integrationConfigs for org: ${organizationId}`);

    return createSuccessResponse({
      success: true,
      message: 'Box configuration saved successfully'
    });

  } catch (error) {
    console.error(`❌ [BoxConfig] Error saving config:`, error);
    return createErrorResponse(
      'Failed to save Box configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

/**
 * Proxy Box file streaming with authentication
 * Handles Range headers for video seeking
 * 
 * This function proxies requests to Box API to enable video streaming
 * with HTML5 video elements, which cannot add custom Authorization headers.
 */
export const boxStream = functions.https.onRequest(async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Box stream request received:`, {
    method: req.method,
    fileId: req.query.fileId,
    hasAuth: !!req.query.auth,
    hasRange: !!req.headers.range,
  });

  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      console.log(`[${requestId}] Handling OPTIONS preflight`);
      res.status(200).send('');
      return;
    }

    // Only allow GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      console.log(`[${requestId}] Invalid method: ${req.method}`);
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Verify Firebase auth token
    const authToken = req.query.auth as string;
    if (!authToken) {
      console.log(`[${requestId}] No auth token provided`);
      res.status(401).send('Authentication required');
      return;
    }

    let userId: string;
    let organizationId: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authToken);
      userId = decoded.uid;
      organizationId = decoded.organizationId || 'default';
    } catch (tokenError) {
      console.error(`[${requestId}] Token verification failed:`, tokenError);
      res.status(401).send('Invalid authentication token');
      return;
    }

    // Get file ID
    const fileId = req.query.fileId as string;
    if (!fileId) {
      console.log(`[${requestId}] No fileId provided`);
      res.status(400).send('File ID is required');
      return;
    }

    console.log(`[${requestId}] Verified auth for user ${hashForLogging(userId)} in org ${organizationId}, streaming file ${fileId}`);

    // Get and refresh Box access token
    let tokens;
    try {
      tokens = await refreshBoxAccessToken(userId, organizationId);
      console.log(`[${requestId}] Successfully retrieved Box access token`);
    } catch (tokenError: any) {
      console.error(`[${requestId}] Failed to get Box access token:`, tokenError);
      res.status(401).json({
        error: 'Failed to get Box access token',
        message: tokenError.message || 'Please reconnect your Box account'
      });
      return;
    }

    // Forward Range header if present (for video seeking)
    const range = req.headers.range;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${tokens.accessToken}`,
    };

    if (range) {
      headers['Range'] = range;
      console.log(`[${requestId}] Forwarding Range header: ${range}`);
    }

    // Proxy request to Box API using Node.js https module for streaming
    const https = require('https');
    const url = require('url');
    const boxUrl = `https://api.box.com/2.0/files/${fileId}/content`;
    const boxApiUrl = url.parse(boxUrl);
    
    console.log(`[${requestId}] Proxying to Box API: ${boxUrl}`);
    
    // Response headers to forward
    const responseHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
    ];
    
    return new Promise<void>((resolve, reject) => {
      const proxyReq = https.request({
        hostname: boxApiUrl.hostname,
        path: boxApiUrl.path,
        method: req.method,
        headers,
      }, (proxyRes: any) => {
        // Forward status code (206 for partial content, 200 for full)
        res.status(proxyRes.statusCode || 200);
        
        // Forward headers
        responseHeaders.forEach(header => {
          const value = proxyRes.headers[header.toLowerCase()];
          if (value) {
            res.set(header, value);
          }
        });
        
        // Pipe response stream directly to client
        proxyRes.pipe(res);
        
        proxyRes.on('end', () => {
          console.log(`[${requestId}] Successfully streamed Box file ${fileId}`);
          resolve();
        });
        
        proxyRes.on('error', (error: any) => {
          console.error(`[${requestId}] Stream error:`, error);
          if (!res.headersSent) {
            res.status(500).send('Stream error');
          }
          reject(error);
        });
      });
      
      proxyReq.on('error', (error: any) => {
        console.error(`[${requestId}] Request error:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to connect to Box API',
            message: error.message
          });
        }
        reject(error);
      });
      
      proxyReq.end();
    });

  } catch (error: any) {
    console.error(`[${requestId}] Box stream error:`, error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to stream Box file',
        message: error.message || 'Unknown error'
      });
    }
  }
});

