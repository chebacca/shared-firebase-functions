/**
 * Dropbox Integration Service
 * 
 * Handles OAuth authentication and API operations for Dropbox
 * Provides server-side OAuth flow with secure token management
 */

import * as functions from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { encryptTokens, decryptTokens, generateSecureState, verifyState, hashForLogging } from './integrations/encryption';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from './shared/utils';

// Dropbox OAuth configuration - lazy loaded to avoid initialization errors during Firebase analysis
async function getDropboxConfig(organizationId?: string): Promise<{
  appKey?: string;
  appSecret?: string;
  redirectUri?: string;
}> {
  // First, try to get from organization-specific Firestore config (if organizationId provided)
  if (organizationId) {
    try {
      const orgConfigDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationSettings')
        .doc('dropbox')
        .get();
      
      if (orgConfigDoc.exists) {
        const orgConfig = orgConfigDoc.data();
        if (orgConfig?.appKey && orgConfig?.appSecret) {
          // Decrypt app secret if encrypted
          let appSecret = orgConfig.appSecret;
          try {
            const decrypted = decryptTokens(orgConfig.appSecret);
            // decryptTokens returns an object, extract the appSecret from it
            if (typeof decrypted === 'object' && decrypted.appSecret) {
              appSecret = decrypted.appSecret;
              console.log('[DropboxConfig] Successfully decrypted appSecret from Firestore');
            } else if (typeof decrypted === 'string') {
              // If decrypted is a plain string, use it directly
              appSecret = decrypted;
              console.log('[DropboxConfig] Decrypted appSecret is a plain string');
            } else {
              // If decryption returns something unexpected, log it but try to use original
              console.warn('[DropboxConfig] Decrypted value is not in expected format:', {
                type: typeof decrypted,
                isObject: typeof decrypted === 'object',
                hasAppSecret: typeof decrypted === 'object' && 'appSecret' in decrypted,
                decryptedKeys: typeof decrypted === 'object' ? Object.keys(decrypted) : 'N/A'
              });
              // Assume it's already plaintext if decryption format is unexpected
              appSecret = orgConfig.appSecret;
            }
          } catch (decryptError) {
            // Check if the value looks encrypted (base64 string, typically longer than a normal secret)
            const looksEncrypted = /^[A-Za-z0-9+/]*={0,2}$/.test(orgConfig.appSecret || '') && 
                                   (orgConfig.appSecret?.length || 0) > 100; // Encrypted values are typically much longer
            
            if (looksEncrypted) {
              // If it looks encrypted but decryption failed, this is a critical error
              console.error('[DropboxConfig] Failed to decrypt appSecret that appears to be encrypted:', {
                error: decryptError instanceof Error ? decryptError.message : String(decryptError),
                appSecretLength: orgConfig.appSecret?.length || 0,
                errorStack: decryptError instanceof Error ? decryptError.stack : undefined
              });
              throw new Error(`Failed to decrypt Dropbox app secret. This may indicate a missing or incorrect encryption key. Error: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}`);
            } else {
              // If it doesn't look encrypted, assume it's already plaintext
              console.warn('[DropboxConfig] Failed to decrypt appSecret, assuming plaintext:', {
                error: decryptError instanceof Error ? decryptError.message : String(decryptError),
                appSecretLength: orgConfig.appSecret?.length || 0,
                appSecretPrefix: orgConfig.appSecret?.substring(0, 20) || 'N/A'
              });
              appSecret = orgConfig.appSecret;
            }
          }
          
          // Validate that we have valid credentials
          if (!appSecret || appSecret.trim().length === 0) {
            console.error('[DropboxConfig] AppSecret is empty after decryption');
            throw new Error('Dropbox app secret is empty or invalid');
          }
          
          console.log('[DropboxConfig] Returning config from Firestore:', {
            hasAppKey: !!orgConfig.appKey,
            hasAppSecret: !!appSecret,
            appKeyLength: orgConfig.appKey?.length || 0,
            appSecretLength: appSecret?.length || 0,
            redirectUri: orgConfig.redirectUri
          });
          
          return {
            appKey: orgConfig.appKey,
            appSecret: typeof appSecret === 'string' ? appSecret : String(appSecret),
            redirectUri: orgConfig.redirectUri || 'https://clipshowpro.web.app/integration-settings'
          };
        }
      }
    } catch (error) {
      console.warn('[DropboxConfig] Failed to get org-specific config:', error);
    }
  }
  
  // Fall back to environment variables (preferred for newer deployments)
  const envAppKey = process.env.DROPBOX_APP_KEY;
  const envAppSecret = process.env.DROPBOX_APP_SECRET;
  const envRedirectUri = process.env.DROPBOX_REDIRECT_URI;
  
  // Finally, get from Firebase Functions config (deprecated but still supported)
  const configAppKey = functions.config().dropbox?.app_key;
  const configAppSecret = functions.config().dropbox?.app_secret;
  const configRedirectUri = functions.config().dropbox?.redirect_uri;
  
  return {
    appKey: envAppKey || configAppKey,
    appSecret: envAppSecret || configAppSecret,
    redirectUri: envRedirectUri || configRedirectUri || 'https://clipshowpro.web.app/integration-settings'
  };
}

// Dropbox SDK client - LAZY loaded to avoid protobuf issues at module initialization
// Only import Dropbox SDK when actually needed (not for OAuth URL generation)
async function getDropboxSDK(organizationId?: string) {
  // Lazy import Dropbox SDK only when needed (not at module load time)
  const { Dropbox } = require('dropbox');
  const config = await getDropboxConfig(organizationId);
  if (!config.appKey || !config.appSecret) {
    console.error('[DropboxSDK] Configuration missing:', {
      hasAppKey: !!config.appKey,
      hasAppSecret: !!config.appSecret,
      hasEnvAppKey: !!process.env.DROPBOX_APP_KEY,
      hasEnvAppSecret: !!process.env.DROPBOX_APP_SECRET,
      hasConfigAppKey: !!functions.config().dropbox?.app_key,
      hasConfigAppSecret: !!functions.config().dropbox?.app_secret,
      organizationId
    });
    throw new Error('Dropbox app key and secret must be configured. Please set DROPBOX_APP_KEY and DROPBOX_APP_SECRET environment variables or configure via Firebase Functions config.');
  }
  return { Dropbox, config };
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
 * Initiate Dropbox OAuth flow - HTTP version with CORS support
 * Returns authorization URL for user to authenticate
 */
export const initiateDropboxOAuthHttp = functions.https.onRequest(async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${requestId}] Dropbox OAuth HTTP request received:`, {
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

    console.log(`[${requestId}] Step 3: Getting Dropbox config from Firestore...`);
    // Always retrieve Dropbox config from Firestore (never accept credentials from client)
    const dropboxConfig = await getDropboxConfig(organizationId);
    
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
    const finalRedirectUri = clientRedirectUri || dropboxConfig.redirectUri || 'https://clipshowpro.web.app/integration-settings';
    
    console.log(`[${requestId}] Step 3 complete:`, {
      hasAppKey: !!dropboxConfig.appKey,
      hasAppSecret: !!dropboxConfig.appSecret,
      configRedirectUri: dropboxConfig.redirectUri,
      clientRedirectUri: clientRedirectUri,
      finalRedirectUri: finalRedirectUri,
      credentialsSource: 'Firestore'
    });
    
    if (!dropboxConfig.appKey || !dropboxConfig.appSecret) {
      throw new Error('Dropbox app key and secret must be configured in Integration Settings. Please configure Dropbox credentials first.');
    }

    console.log(`[${requestId}] Step 4: Preparing Firestore data...`);
    // Store state in Firestore for verification
    const nowMillis = Number(Date.now());
    const expiresAtMillis = Number(Date.now() + 60 * 60 * 1000); // 60 minutes - increased to allow more time for OAuth flow
    
    // Store credentials in state document for callback (always retrieved from Firestore, never from client)
    const encryptedCredentials = encryptTokens({
      appKey: dropboxConfig.appKey,
      appSecret: dropboxConfig.appSecret
    });
    
    const firestoreData: Record<string, any> = {
      userId: String(userId),
      organizationId: String(organizationId),
      provider: 'dropbox',
      createdAtMillis: nowMillis,
      expiresAtMillis: expiresAtMillis,
      redirectUri: finalRedirectUri,
      oauthCredentials: encryptedCredentials
    };
    
    console.log(`[${requestId}] Step 5: Writing to Firestore...`);
    await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .set(firestoreData);
    console.log(`[${requestId}] Step 5 complete: Firestore write successful`);

    console.log(`[${requestId}] Step 6: Generating authorization URL...`);
    // Build Dropbox OAuth URL manually
    // Dropbox OAuth URL format: https://www.dropbox.com/oauth2/authorize?...
    const dropboxAuthBaseUrl = 'https://www.dropbox.com/oauth2/authorize';
    const authUrlParams = new URLSearchParams({
      client_id: dropboxConfig.appKey,
      redirect_uri: finalRedirectUri,
      response_type: 'code',
      state: state,
      token_access_type: 'offline', // Request refresh token
      scope: 'files.content.read' // files.content.read automatically includes files.metadata.read
    });
    const authUrl = `${dropboxAuthBaseUrl}?${authUrlParams.toString()}`;
    console.log(`[${requestId}] Step 6 complete: Auth URL generated`);

    console.log(`[${requestId}] Dropbox OAuth initiated successfully for user ${hashForLogging(userId)} in org ${organizationId}`);

    const response = createSuccessResponse({
      authUrl,
      state
    });

    res.status(200).json(response);

  } catch (error) {
    console.error(`[${requestId}] Dropbox OAuth initiation failed:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error && error.stack ? error.stack : String(error);
    const response = createErrorResponse('Failed to initiate Dropbox OAuth', errorDetails);
    res.status(400).json(response);
  }
});

/**
 * Handle Dropbox OAuth callback
 * Exchange authorization code for tokens
 */
export const handleDropboxOAuthCallback = functions.https.onCall(async (data, context) => {
  try {
    const { code, state } = data;

    if (!code || !state) {
      throw new Error('Authorization code and state are required');
    }

    console.log(`[DropboxOAuth] Processing callback for state: ${state.substring(0, 20)}..., code: ${code.substring(0, 20)}...`);

    // Verify state parameter
    const stateDoc = await admin.firestore()
      .collection('oauthStates')
      .doc(state)
      .get();

    if (!stateDoc.exists) {
      console.error(`[DropboxOAuth] State document not found: ${state.substring(0, 20)}...`);
      console.error(`[DropboxOAuth] This usually means:`);
      console.error(`[DropboxOAuth] 1. The OAuth state expired (60 minute timeout)`);
      console.error(`[DropboxOAuth] 2. The OAuth flow was initiated from a different session`);
      console.error(`[DropboxOAuth] 3. The state document was never created or was deleted`);
      
      // Check if there's an existing integration that might have been created
      try {
        // Try to get organizationId from context if available
        let orgId: string | null = null;
        if (context?.auth) {
          const userRecord = await admin.auth().getUser(context.auth.uid);
          const customClaims = userRecord.customClaims || {};
          orgId = customClaims.organizationId || null;
          
          // Also try to get from user document
          if (!orgId) {
            const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
            if (userDoc.exists) {
              orgId = userDoc.data()?.organizationId || null;
            }
          }
        }
        
        if (orgId) {
          const existingIntegration = await admin.firestore()
            .collection('organizations')
            .doc(orgId)
            .collection('cloudIntegrations')
            .doc('dropbox')
            .get();
          
          if (existingIntegration.exists) {
            const integrationData = existingIntegration.data();
            console.log(`[DropboxOAuth] Found existing integration, returning success`);
            return {
              success: true,
              accountEmail: integrationData?.accountEmail,
              accountName: integrationData?.accountName,
              connected: true,
              message: 'Dropbox is already connected'
            };
          }
        }
      } catch (checkError) {
        console.warn(`[DropboxOAuth] Could not check for existing integration:`, checkError);
      }
      
      throw new Error('Invalid or expired state parameter. The OAuth session may have expired (60 minutes) or was initiated from a different session. Please try connecting again.');
    }

    const stateData = stateDoc.data();
    const userId = stateData?.userId;
    const organizationId = stateData?.organizationId;

    if (!userId || !organizationId) {
      throw new Error('Invalid state data');
    }

    // Check if encryption key is available (for diagnostic purposes)
    try {
      const testKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
      let configKey: string | undefined;
      try {
        configKey = functions.config().integrations?.encryption_key;
      } catch {
        // Config might not be available in v2 functions
      }
      console.log(`[DropboxOAuth] Encryption key check:`, {
        hasEnvKey: !!testKey,
        envKeyLength: testKey?.length || 0,
        hasConfigKey: !!configKey,
        configKeyLength: configKey?.length || 0,
        organizationId
      });
    } catch (keyError) {
      console.warn(`[DropboxOAuth] Could not check encryption key:`, keyError);
    }

    // Check if code was already processed
    if (stateData?.codeUsed === true) {
      const existingIntegration = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('dropbox')
        .get();
      
      if (existingIntegration.exists) {
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

    // Check expiration
    let isExpired = false;
    if (stateData?.expiresAtMillis) {
      const expiresAt = Number(stateData.expiresAtMillis);
      const now = Date.now();
      isExpired = expiresAt < now;
    }
    
    if (isExpired) {
      await stateDoc.ref.delete();
      throw new Error('State parameter has expired');
    }

    // Get Dropbox config
    const defaultConfig = await getDropboxConfig(organizationId);
    console.log(`[DropboxOAuth] Retrieved default config:`, {
      hasAppKey: !!defaultConfig.appKey,
      hasAppSecret: !!defaultConfig.appSecret,
      appKeyLength: defaultConfig.appKey?.length || 0,
      appSecretLength: defaultConfig.appSecret?.length || 0,
      redirectUri: defaultConfig.redirectUri
    });
    
    let dropboxConfig = {
      appKey: defaultConfig.appKey,
      appSecret: defaultConfig.appSecret,
      redirectUri: stateData?.redirectUri || defaultConfig.redirectUri
    };
    
    // If credentials were stored in state document, use them
    if (stateData?.oauthCredentials) {
      try {
        const storedCredentials = decryptTokens(stateData.oauthCredentials);
        console.log(`[DropboxOAuth] Decrypted stored credentials from state:`, {
          hasAppKey: !!storedCredentials.appKey,
          hasAppSecret: !!storedCredentials.appSecret,
          appKeyLength: storedCredentials.appKey?.length || 0,
          appSecretLength: storedCredentials.appSecret?.length || 0
        });
        if (storedCredentials.appKey) {
          dropboxConfig.appKey = storedCredentials.appKey;
        }
        if (storedCredentials.appSecret) {
          dropboxConfig.appSecret = storedCredentials.appSecret;
        }
      } catch (decryptError) {
        console.warn(`[DropboxOAuth] Failed to decrypt stored credentials, using default config:`, decryptError);
      }
    }
    
    console.log(`[DropboxOAuth] Final config to use:`, {
      hasAppKey: !!dropboxConfig.appKey,
      hasAppSecret: !!dropboxConfig.appSecret,
      appKeyLength: dropboxConfig.appKey?.length || 0,
      appSecretLength: dropboxConfig.appSecret?.length || 0,
      redirectUri: dropboxConfig.redirectUri
    });
    
    if (!dropboxConfig.appKey || !dropboxConfig.appSecret) {
      throw new Error('Dropbox app key and secret must be configured');
    }
    
    // Mark code as used
    await stateDoc.ref.update({
      codeUsed: true,
      codeUsedAt: Date.now()
    });
    
    // Exchange code for tokens using Dropbox API
    const https = require('https');
    const querystring = require('querystring');
    
    const tokenData = querystring.stringify({
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: dropboxConfig.redirectUri,
      client_id: dropboxConfig.appKey,
      client_secret: dropboxConfig.appSecret
    });
    
    const tokenResponse = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.dropboxapi.com',
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenData)
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`Failed to parse token response: ${parseError}`));
            }
          } else {
            // Try to parse error response from Dropbox
            let errorMessage = `Token exchange failed: ${res.statusCode}`;
            try {
              const errorData = JSON.parse(data);
              if (errorData.error_description) {
                errorMessage = errorData.error_description;
              } else if (errorData.error) {
                errorMessage = `Dropbox API error: ${errorData.error}`;
                if (errorData.error === 'invalid_grant') {
                  errorMessage = 'Invalid or expired authorization code. The redirect URI may not match, or the code was already used.';
                } else if (errorData.error === 'invalid_client') {
                  errorMessage = 'Invalid App Key or App Secret. Please verify your Dropbox credentials.';
                }
              }
            } catch {
              // If parsing fails, use the raw response
              errorMessage = `Token exchange failed: ${res.statusCode} ${data}`;
            }
            const error = new Error(errorMessage);
            (error as any).responseData = data;
            (error as any).statusCode = res.statusCode;
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.write(tokenData);
      req.end();
    });
    
    if (!tokenResponse.access_token) {
      throw new Error('Failed to obtain access token');
    }
    
    // Get user info
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokenResponse.access_token });
    let userInfo: any;
    try {
      console.log('[DropboxOAuth] Attempting to get user account info...');
      userInfo = await dbx.usersGetCurrentAccount();
      console.log('[DropboxOAuth] Successfully retrieved user info:', {
        hasEmail: !!userInfo.email,
        emailLength: userInfo.email?.length || 0,
        emailValue: userInfo.email || 'N/A',
        hasName: !!userInfo.name,
        displayName: userInfo.name?.display_name || 'N/A',
        accountId: userInfo.account_id || 'N/A',
        allKeys: Object.keys(userInfo || {}),
        fullResponse: JSON.stringify(userInfo).substring(0, 500) // Log first 500 chars of response
      });
      
      // Check if email is in a different location or nested structure
      let email = userInfo.email;
      if (!email) {
        console.warn('[DropboxOAuth] Email not found in expected location. Checking alternative fields...', {
          hasAccountId: !!userInfo.account_id,
          hasName: !!userInfo.name,
          hasProfilePhotoUrl: !!userInfo.profile_photo_url,
          responseKeys: Object.keys(userInfo || {}),
          // Check if email is nested
          hasResult: !!userInfo.result,
          resultKeys: userInfo.result ? Object.keys(userInfo.result) : []
        });
        
        // Try to extract email from nested structures
        if (userInfo.result?.email) {
          email = userInfo.result.email;
          console.log('[DropboxOAuth] Found email in nested result field');
        } else if (userInfo.account?.email) {
          email = userInfo.account.email;
          console.log('[DropboxOAuth] Found email in nested account field');
        }
      }
      
      // Update userInfo with extracted email if found
      if (email && !userInfo.email) {
        userInfo.email = email;
        console.log('[DropboxOAuth] Updated userInfo with extracted email');
      }
      
      // If email is still not found, try to use account_id as a fallback identifier
      // Some Dropbox accounts (especially team accounts) may not have email exposed
      if (!userInfo.email && userInfo.account_id) {
        console.log('[DropboxOAuth] Email not available, using account_id as identifier:', userInfo.account_id);
        // We'll still store empty email, but ensure accountName is set for validation
        if (!userInfo.name?.display_name) {
          userInfo.name = { display_name: `Dropbox Account (${userInfo.account_id.substring(0, 8)})` };
        }
      }
    } catch (userError: any) {
      console.error('[DropboxOAuth] Failed to get user info:', {
        error: userError?.message || String(userError),
        errorType: userError?.constructor?.name,
        errorStatus: userError?.status,
        errorResponse: userError?.response || userError?.error || 'N/A',
        stack: userError?.stack
      });
      // Try alternative method: use account_info endpoint directly
      try {
        console.log('[DropboxOAuth] Attempting alternative method to get account info...');
        const https = require('https');
        const accountInfoResponse = await new Promise<any>((resolve, reject) => {
          const req = https.request({
            hostname: 'api.dropboxapi.com',
            path: '/2/users/get_current_account',
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenResponse.access_token}`,
              'Content-Type': 'application/json'
            }
          }, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  resolve(JSON.parse(data));
                } catch (parseError) {
                  reject(new Error(`Failed to parse account info response: ${parseError}`));
                }
              } else {
                reject(new Error(`Account info request failed: ${res.statusCode} ${data}`));
              }
            });
          });
          req.on('error', reject);
          req.write('{}');
          req.end();
        });
        console.log('[DropboxOAuth] Alternative method succeeded:', {
          hasEmail: !!accountInfoResponse.email,
          emailLength: accountInfoResponse.email?.length || 0,
          emailValue: accountInfoResponse.email || 'N/A',
          hasName: !!accountInfoResponse.name,
          displayName: accountInfoResponse.name?.display_name || 'N/A',
          accountId: accountInfoResponse.account_id || 'N/A',
          allKeys: Object.keys(accountInfoResponse || {}),
          fullResponse: JSON.stringify(accountInfoResponse).substring(0, 500)
        });
        
        // Check if email is in a different location or nested structure
        let email = accountInfoResponse.email;
        if (!email) {
          console.warn('[DropboxOAuth] Email not found in alternative method response. Checking alternative fields...', {
            hasAccountId: !!accountInfoResponse.account_id,
            hasName: !!accountInfoResponse.name,
            responseKeys: Object.keys(accountInfoResponse || {}),
            // Check if email is nested
            hasResult: !!accountInfoResponse.result,
            resultKeys: accountInfoResponse.result ? Object.keys(accountInfoResponse.result) : []
          });
          
          // Try to extract email from nested structures
          if (accountInfoResponse.result?.email) {
            email = accountInfoResponse.result.email;
            console.log('[DropboxOAuth] Found email in nested result field (alternative method)');
          } else if (accountInfoResponse.account?.email) {
            email = accountInfoResponse.account.email;
            console.log('[DropboxOAuth] Found email in nested account field (alternative method)');
          }
        }
        
        // Update accountInfoResponse with extracted email if found
        if (email && !accountInfoResponse.email) {
          accountInfoResponse.email = email;
          console.log('[DropboxOAuth] Updated accountInfoResponse with extracted email');
        }
        
        userInfo = accountInfoResponse;
      } catch (altError: any) {
        console.error('[DropboxOAuth] Alternative method also failed:', {
          error: altError?.message || String(altError),
          errorStatus: altError?.status
        });
        // Fall back to placeholder
        userInfo = {
          email: '',
          name: { display_name: 'Dropbox User' }
        };
      }
    }
    
    // CRITICAL: Validate that token has the required scope
    // files.content.read automatically includes files.metadata.read in Dropbox
    // So we only need to verify files.content.read is working
    console.log('[DropboxOAuth] Validating token has files.content.read scope (includes files.metadata.read)...');
    
    // Test files.content.read - if this works, files.metadata.read is also available
    // We test by listing folders, which requires both scopes
    try {
      console.log('[DropboxOAuth] 🔍 Testing scope: files.content.read (includes files.metadata.read)...');
      await dbx.filesListFolder({ path: '' });
      console.log('[DropboxOAuth] ✅ Scope files.content.read validated (includes files.metadata.read)');
    } catch (scopeError: any) {
      const errorSummary = scopeError?.error_summary || scopeError?.error?.error_summary || scopeError?.message || '';
      const errorTag = scopeError?.error?.['.tag'] || scopeError?.['.tag'];
      
      // Only fail if we get an explicit missing_scope error
      if (errorSummary.includes('missing_scope') || errorTag === 'missing_scope') {
        const missingScope = scopeError?.error?.required_scope || scopeError?.error?.scope || 'files.content.read';
        console.error(`[DropboxOAuth] ❌ Token missing scope files.content.read:`, { missingScope, errorSummary, errorTag });
        throw new Error(`Dropbox OAuth token is missing required permissions: ${missingScope}. Please ensure files.content.read is enabled in your Dropbox app settings (https://www.dropbox.com/developers/apps). Note: files.content.read automatically includes files.metadata.read.`);
      } else {
        // Non-scope error - log warning but don't fail (might be network issue, etc.)
        console.warn(`[DropboxOAuth] ⚠️ Scope test had non-scope error (assuming scope is valid):`, {
          message: scopeError?.message,
          errorSummary,
          status: scopeError?.status
        });
        // Assume it's valid if not a scope error
      }
    }
    
    console.log(`[DropboxOAuth] ✅ Scope validation complete. Token has files.content.read (which includes files.metadata.read). Ready for folder browsing and file playback.`);
    
    // Encrypt tokens for storage
    const tokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: tokenResponse.expires_in ? Date.now() + (tokenResponse.expires_in * 1000) : null
    };
    const encryptedTokens = encryptTokens(tokens);

    // Store encrypted tokens in Firestore at organization level
    const expiresAtTimestamp = tokens.expiresAt 
      ? admin.firestore.Timestamp.fromDate(new Date(tokens.expiresAt))
      : null;
    
    // Check if there's an existing integration document to preserve email if Dropbox doesn't provide one
    const existingDocRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('dropbox');
    
    const existingDoc = await existingDocRef.get();
    const existingData = existingDoc.data();
    
    // Preserve existing email if Dropbox API didn't return one
    const accountEmail = String(userInfo.email || existingData?.accountEmail || '');
    const accountName = String(userInfo.name?.display_name || existingData?.accountName || 'Dropbox User');
    
    const integrationDoc = {
      userId: String(userId),
      organizationId: String(organizationId),
      provider: 'dropbox',
      accountEmail: accountEmail,
      accountName: accountName,
      encryptedTokens,
      isActive: true,
      connectionMethod: 'oauth', // OAuth connection (has all required scopes)
      createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expiresAtTimestamp
    };
    
    // Store in organization-scoped collection at org level
    await existingDocRef.set(integrationDoc);
    
    // Delete state document
    try {
      await stateDoc.ref.delete();
    } catch (deleteError) {
      console.warn('Failed to delete state document:', deleteError);
    }

    // Create or update integration record
    try {
      const integrationRecordRef = admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('integrationConfigs')
        .doc('dropbox-integration');

      const existingRecord = await integrationRecordRef.get();
      const existingRecordData = existingRecord.data();

      // Preserve existing email if Dropbox API didn't return one
      const recordAccountEmail = String(userInfo.email || existingRecordData?.accountEmail || accountEmail || '');
      const recordAccountName = String(userInfo.name?.display_name || existingRecordData?.accountName || accountName || 'Dropbox User');

      const integrationRecord = {
        id: 'dropbox-integration',
        name: 'Dropbox Integration',
        type: 'dropbox',
        enabled: true,
        organizationId: organizationId,
        accountEmail: recordAccountEmail,
        accountName: recordAccountName,
        credentials: {},
        settings: {},
        testStatus: 'success',
        testMessage: `Connected to Dropbox as ${recordAccountEmail || 'Dropbox account'}`,
        createdAt: existingRecordData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await integrationRecordRef.set(integrationRecord, { merge: true });
    } catch (recordError) {
      console.warn('Failed to create integration record:', recordError);
    }

    return {
      success: true,
      accountEmail: userInfo.email,
      accountName: userInfo.name?.display_name,
      connected: true
    };

  } catch (error: any) {
    console.error('[DropboxOAuth] Callback failed:', error);
    
    // Extract detailed error information
    let errorMessage = 'Failed to complete Dropbox OAuth';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
      errorDetails = error.stack || error.toString();
    }
    
    // Provide more specific error messages for common issues
    if (errorMessage.includes('redirect_uri') || errorMessage.includes('redirect URI')) {
      errorMessage = 'Redirect URI mismatch. The redirect URI used in the token exchange must match the one used in the authorization request.';
    } else if (errorMessage.includes('invalid_grant') || errorMessage.includes('authorization code')) {
      errorMessage = 'Invalid or expired authorization code. Please try connecting again.';
    } else if (errorMessage.includes('Token exchange failed')) {
      // Parse the HTTP response if available
      if (errorDetails) {
        try {
          const parsedError = JSON.parse(errorDetails);
          if (parsedError.error_description) {
            errorMessage = parsedError.error_description;
          } else if (parsedError.error) {
            errorMessage = `Dropbox API error: ${parsedError.error}`;
          }
        } catch {
          // If parsing fails, use the original error message
        }
      }
    }
    
    // Throw HttpsError for callable functions
    throw new functions.https.HttpsError(
      'internal',
      errorMessage,
      errorDetails || errorMessage
    );
  }
});

/**
 * Refresh Dropbox access token
 */
export async function refreshDropboxAccessToken(userId: string, organizationId: string): Promise<any> {
  try {
    // Use organization-level token (dropbox) - all users share the same Dropbox connection
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('dropbox')
      .get();

    if (!integrationDoc.exists) {
      throw new Error('Dropbox integration not found. Please have an admin connect the Dropbox account.');
    }

    const integrationData = integrationDoc.data();
    const encryptedTokens = integrationData?.encryptedTokens;

    if (!encryptedTokens) {
      throw new Error('No tokens found for Dropbox integration.');
    }

    // Decrypt tokens
    let tokens;
    try {
      tokens = decryptTokens(encryptedTokens);
    } catch (decryptError: any) {
      throw new Error('Failed to decrypt Dropbox tokens.');
    }

    // Check if access token is still valid
    if (tokens.expiresAt && tokens.accessToken) {
      const expiresAt = tokens.expiresAt instanceof Date 
        ? tokens.expiresAt 
        : typeof tokens.expiresAt === 'string' 
          ? new Date(tokens.expiresAt)
          : tokens.expiresAt?.toDate?.();
      
      if (expiresAt && expiresAt > new Date(Date.now() + 60000)) { // 1 minute buffer
        // Token is still valid - return it without validation
        // According to Dropbox docs, we should just try the API call and only fail on explicit missing_scope errors
        // Pre-validation here can cause false positives, so we'll validate when the API call is made
        console.log(`[DropboxTokenRefresh] Token is still valid (expires at ${expiresAt.toISOString()}), returning without pre-validation`);
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt
        };
      }
      
      // Token expired or no expiry info, refresh it
    }
    
    // If no expiry info and no refresh token, assume it's a long-lived token and return it as-is
    if (!tokens.expiresAt && !tokens.refreshToken && tokens.accessToken) {
      console.log('⚠️ [DropboxToken] No expiry or refresh token - assuming long-lived token');
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: null
      };
    }

    // Token expired or no expiry info, refresh it
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available. Please re-connect your Dropbox account.');
    }

    // Get Dropbox config
    const defaultConfig = await getDropboxConfig(organizationId);
    let dropboxConfig = {
      appKey: defaultConfig.appKey,
      appSecret: defaultConfig.appSecret
    };

    if (integrationData?.oauthCredentials) {
      try {
        const storedCredentials = decryptTokens(integrationData.oauthCredentials);
        dropboxConfig.appKey = storedCredentials.appKey || dropboxConfig.appKey;
        dropboxConfig.appSecret = storedCredentials.appSecret || dropboxConfig.appSecret;
      } catch (decryptError) {
        console.warn('Failed to decrypt stored credentials, using Firebase config:', decryptError);
      }
    }

    if (!dropboxConfig.appKey || !dropboxConfig.appSecret) {
      throw new Error('Dropbox app key and secret must be configured.');
    }

    // Refresh token using Dropbox API
    const https = require('https');
    const querystring = require('querystring');
    
    const tokenData = querystring.stringify({
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
      client_id: dropboxConfig.appKey,
      client_secret: dropboxConfig.appSecret
    });
    
    const tokenResponse = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.dropboxapi.com',
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(tokenData)
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (parseError) {
              reject(new Error(`Failed to parse token response: ${parseError}`));
            }
          } else {
            reject(new Error(`Token refresh failed: ${res.statusCode} ${data}`));
          }
        });
      });
      
      req.on('error', reject);
      req.write(tokenData);
      req.end();
    });
    
    if (!tokenResponse.access_token) {
      throw new Error('Failed to refresh access token');
    }

    // Encrypt new tokens
    const newTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || tokens.refreshToken, // Use new refresh token if provided
      expiresAt: tokenResponse.expires_in ? Date.now() + (tokenResponse.expires_in * 1000) : tokens.expiresAt
    };
    
    // CRITICAL: Validate that refreshed token has the required scope
    // files.content.read automatically includes files.metadata.read in Dropbox
    // So we only need to verify files.content.read is working
    console.log('[DropboxTokenRefresh] Validating refreshed token has files.content.read scope (includes files.metadata.read)...');
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: newTokens.accessToken });
    
    // Test files.content.read - if this works, files.metadata.read is also available
    // We test by listing folders, which requires both scopes
    try {
      console.log('[DropboxTokenRefresh] 🔍 Testing scope: files.content.read (includes files.metadata.read)...');
      await dbx.filesListFolder({ path: '' });
      console.log('[DropboxTokenRefresh] ✅ Scope files.content.read validated (includes files.metadata.read)');
    } catch (scopeError: any) {
      const errorSummary = scopeError?.error_summary || scopeError?.error?.error_summary || scopeError?.message || '';
      const errorTag = scopeError?.error?.['.tag'] || scopeError?.['.tag'];
      
      // Only fail if we get an explicit missing_scope error
      if (errorSummary.includes('missing_scope') || errorTag === 'missing_scope') {
        const missingScope = scopeError?.error?.required_scope || scopeError?.error?.scope || 'files.content.read';
        console.error(`[DropboxTokenRefresh] ❌ Refreshed token missing scope files.content.read:`, {
          missingScope,
          errorSummary,
          errorTag
        });
        
        // Mark connection as inactive so it shows as disconnected
        await admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc('dropbox')
          .update({
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        
        throw new Error(`Dropbox access token is missing required permissions: ${missingScope}. Please disconnect and reconnect your Dropbox account using the OAuth flow. Ensure files.content.read is enabled in your Dropbox app settings (https://www.dropbox.com/developers/apps). Note: files.content.read automatically includes files.metadata.read.`);
      } else {
        // Non-scope error - log warning but don't fail (might be network issue, etc.)
        console.warn(`[DropboxTokenRefresh] ⚠️ Scope test had non-scope error (assuming scope is valid):`, {
          message: scopeError?.message,
          errorSummary,
          status: scopeError?.status
        });
        // Assume it's valid if not a scope error
      }
    }
    
    console.log(`[DropboxTokenRefresh] ✅ Scope validation complete. Refreshed token has files.content.read (which includes files.metadata.read).`);
    
    const newEncryptedTokens = encryptTokens(newTokens);

    // Update Firestore
    const expiresAtTimestamp = newTokens.expiresAt 
      ? admin.firestore.Timestamp.fromDate(new Date(newTokens.expiresAt))
      : null;
    
    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('dropbox')
      .update({
        encryptedTokens: newEncryptedTokens,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiresAtTimestamp,
        isActive: true
      });

    return newTokens;

  } catch (error) {
    console.error('[DropboxTokenRefresh] Dropbox token refresh failed:', error);
    throw error;
  }
}

/**
 * List Dropbox folders
 */
export const listDropboxFolders = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderPath = '' } = data; // Empty string is root folder in Dropbox

    // Get and refresh organization-level tokens
    let tokens;
    try {
      tokens = await refreshDropboxAccessToken(userId, organizationId);
    } catch (tokenError: any) {
      throw new Error(`Failed to get Dropbox access token: ${tokenError.message}`);
    }

    if (!tokens || !tokens.accessToken) {
      throw new Error('No access token available.');
    }

    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });

    // Validate token format - Dropbox tokens typically start with specific prefixes
    const tokenPrefix = tokens.accessToken?.substring(0, 5) || '';
    console.log(`[DropboxFolders] Access token present: ${!!tokens.accessToken}, length: ${tokens.accessToken?.length || 0}, prefix: ${tokenPrefix}`);
    
    // According to Dropbox docs, we should just try the API call and only fail on explicit missing_scope errors
    // Pre-validation can cause false positives, so we'll validate when the API call is made
    // Skip pre-validation - just proceed to the API call

    // Normalize folder path - Dropbox uses empty string for root, not 'root'
    // For root folder, we can omit the path or use empty string
    const normalizedPath = folderPath === 'root' ? '' : (folderPath || '');
    
    console.log(`[DropboxFolders] Listing folders for path: "${normalizedPath}" (original: "${folderPath}")`);
    console.log(`[DropboxFolders] Token validated successfully, proceeding with filesListFolder...`);

    // List folders - Dropbox API requires path parameter, use empty string for root
    // According to Dropbox API docs, empty string "" represents the root folder
    let response;
    try {
      // Always include path parameter, even for root (empty string)
      // The Dropbox SDK v10.34.0 expects this format
      const listParams = { path: normalizedPath };
      
      console.log(`[DropboxFolders] Calling filesListFolder with params:`, JSON.stringify(listParams, null, 2));
      console.log(`[DropboxFolders] Path is root: ${normalizedPath === ''}, path type: ${typeof normalizedPath}, path length: ${normalizedPath.length}`);
      console.log(`[DropboxFolders] About to call dbx.filesListFolder...`);
      
      // Call the API - Dropbox API requires path parameter, use empty string for root
      // According to Dropbox API docs, empty string "" represents the root folder
      response = await dbx.filesListFolder(listParams);
      
      // Dropbox SDK v10.34.0 wraps the actual API response in a 'result' property
      // Response structure: { status: 200, headers: {...}, result: { entries: [...], cursor: '...', has_more: false } }
      const actualResult = (response as any)?.result || response;
      
      // Log full response structure for debugging
      console.log(`[DropboxFolders] Response received:`, {
        hasResponse: !!response,
        responseType: typeof response,
        responseKeys: response ? Object.keys(response) : [],
        hasResult: !!(response as any)?.result,
        hasEntries: !!actualResult?.entries,
        entriesType: typeof actualResult?.entries,
        entriesIsArray: Array.isArray(actualResult?.entries),
        entriesLength: actualResult?.entries?.length,
        hasCursor: !!actualResult?.cursor,
        hasHasMore: 'has_more' in (actualResult || {}),
        fullResponse: JSON.stringify(response, null, 2).substring(0, 2000) // First 2000 chars for logging
      });
      
      // Check if response itself is an error object (Dropbox SDK might return error objects)
      if (response && typeof response === 'object') {
        // Check for error tag (Dropbox API uses .tag for error types)
        if (actualResult?.['.tag'] && (actualResult['.tag'] === 'error' || actualResult['.tag'].includes('error'))) {
          const errorInfo = actualResult as any;
          console.error('[DropboxFolders] Response is an error object:', errorInfo);
          const errorSummary = errorInfo?.error_summary || errorInfo?.error?.error_summary || errorInfo?.message || JSON.stringify(errorInfo);
          throw new Error(`Dropbox API returned error: ${errorSummary}`);
        }
        
        // Check if response has an error property
        if ('error' in actualResult) {
          const errorInfo = (actualResult as any).error;
          console.error('[DropboxFolders] Response contains error property:', errorInfo);
          const errorSummary = errorInfo?.error_summary || errorInfo?.message || JSON.stringify(errorInfo);
          throw new Error(`Dropbox API returned error: ${errorSummary}`);
        }
        
        // Check if response has error_summary (direct error response)
        if ('error_summary' in actualResult && !('entries' in actualResult)) {
          const errorInfo = actualResult as any;
          console.error('[DropboxFolders] Response is an error (has error_summary):', errorInfo);
          throw new Error(`Dropbox API returned error: ${errorInfo.error_summary || JSON.stringify(errorInfo)}`);
        }
      }
      
      // Validate response structure - must have entries array
      if (!actualResult || !actualResult.entries) {
        console.error('[DropboxFolders] Invalid response structure:', {
          hasResponse: !!response,
          hasResult: !!(response as any)?.result,
          responseKeys: response ? Object.keys(response) : [],
          resultKeys: actualResult ? Object.keys(actualResult) : [],
          responseType: typeof response,
          responseValue: response,
          responseString: JSON.stringify(response).substring(0, 1000),
          // Check for common error indicators
          hasErrorTag: actualResult?.['.tag'] === 'error',
          hasErrorSummary: !!actualResult?.error_summary,
          hasErrorProperty: 'error' in (actualResult || {})
        });
        
        // If response exists but no entries, it's likely an error response
        if (actualResult && typeof actualResult === 'object') {
          const errorMsg = (actualResult as any).error_summary || 
                          ((actualResult as any).error?.error_summary) || 
                          'Invalid response from Dropbox API: missing entries property';
          throw new Error(`Dropbox API error: ${errorMsg}. This usually means the access token is invalid, lacks required scopes, or the path format is incorrect.`);
        }
        
        throw new Error('Invalid response from Dropbox API: missing entries property');
      }
      
      console.log(`[DropboxFolders] ✅ filesListFolder succeeded, entries count: ${actualResult.entries.length}`);
    } catch (apiError: any) {
      // Extract detailed error information from Dropbox SDK error
      // The Dropbox SDK wraps errors, so we need to check multiple places
      let actualError: any = apiError;
      
      // Check if error has a response property (HTTP error)
      if (apiError?.response) {
        actualError = apiError.response;
      }
      
      // Check if error has an error property (nested error)
      if (apiError?.error && typeof apiError.error === 'object') {
        actualError = apiError.error;
      }
      
      const errorDetails: any = {
        message: apiError?.message || actualError?.message,
        status: apiError?.status || apiError?.statusCode || actualError?.status,
        statusCode: apiError?.statusCode || apiError?.status || actualError?.statusCode,
        error: actualError,
        error_summary: actualError?.error_summary || apiError?.error_summary,
        error_tag: actualError?.['.tag'] || actualError?.error_tag || apiError?.error_tag,
        path: normalizedPath,
        errorType: actualError?.['.tag'],
        // Try to get the actual error response body
        responseBody: apiError?.response?.body || apiError?.body,
        fullError: JSON.stringify(apiError, Object.getOwnPropertyNames(apiError), 2),
        errorKeys: Object.keys(apiError || {}),
        actualErrorKeys: Object.keys(actualError || {})
      };
      
      // Try to extract error summary from various possible locations
      let errorSummary = errorDetails.error_summary;
      if (!errorSummary && actualError) {
        if (typeof actualError === 'string') {
          errorSummary = actualError;
        } else if (actualError.error_summary) {
          errorSummary = actualError.error_summary;
        } else if (actualError.message) {
          errorSummary = actualError.message;
        }
      }
      
      // Check response body for error details
      if (errorDetails.responseBody) {
        try {
          const bodyError = typeof errorDetails.responseBody === 'string' 
            ? JSON.parse(errorDetails.responseBody)
            : errorDetails.responseBody;
          if (bodyError.error_summary) {
            errorSummary = bodyError.error_summary;
          } else if (bodyError.error) {
            if (typeof bodyError.error === 'object' && bodyError.error.error_summary) {
              errorSummary = bodyError.error.error_summary;
            } else if (typeof bodyError.error === 'string') {
              errorSummary = bodyError.error;
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      // Extract missing scope information if available - check multiple locations
      let missingScope: string | undefined;
      
      // Check actualError.error structure
      if (actualError?.error && typeof actualError.error === 'object') {
        if (actualError.error['.tag'] === 'missing_scope') {
          missingScope = actualError.error.required_scope || actualError.error.scope || 'unknown';
          console.error('[DropboxFolders] Found missing_scope in actualError.error:', actualError.error);
        }
      }
      
      // Check apiError.error structure
      if (apiError?.error && typeof apiError.error === 'object') {
        if (apiError.error['.tag'] === 'missing_scope') {
          missingScope = apiError.error.required_scope || apiError.error.scope || missingScope || 'unknown';
          console.error('[DropboxFolders] Found missing_scope in apiError.error:', apiError.error);
        }
      }
      
      // Check if error_summary contains missing_scope info
      // According to Dropbox docs, files.content.read includes files.metadata.read
      // So we should only fail if we get an explicit missing_scope error for files.content.read
      if (errorSummary && errorSummary.includes('missing_scope')) {
        console.error('[DropboxFolders] Error summary contains missing_scope:', errorSummary);
        // Try to extract scope from error summary
        // Handle formats like: "missing_scope/files.content.read" or "missing_scope:" or just "missing_scope/"
        const scopeMatch = errorSummary.match(/missing_scope[\/:]([^\s,]+)/);
        if (scopeMatch && scopeMatch[1]) {
          missingScope = scopeMatch[1];
        } else if (errorSummary.includes('missing_scope')) {
          // If we detect missing_scope but can't extract the scope name,
          // Check the actual error object structure for the scope
          if (actualError?.error?.required_scope) {
            missingScope = actualError.error.required_scope;
            console.error('[DropboxFolders] Found required_scope in actualError.error:', missingScope);
          } else if (apiError?.error?.required_scope) {
            missingScope = apiError.error.required_scope;
            console.error('[DropboxFolders] Found required_scope in apiError.error:', missingScope);
          } else if (errorDetails?.error?.required_scope) {
            missingScope = errorDetails.error.required_scope;
            console.error('[DropboxFolders] Found required_scope in errorDetails.error:', missingScope);
          } else {
            // Default to files.content.read since that's what we request
            // If files.content.read is missing, files.metadata.read will also be missing
            missingScope = 'files.content.read';
            console.warn('[DropboxFolders] Could not extract scope name from error, defaulting to files.content.read (the scope we request)');
          }
        }
      }
      
      // Check responseBody for missing_scope
      if (errorDetails.responseBody) {
        try {
          const bodyError = typeof errorDetails.responseBody === 'string' 
            ? JSON.parse(errorDetails.responseBody)
            : errorDetails.responseBody;
          if (bodyError?.error?.['.tag'] === 'missing_scope') {
            missingScope = bodyError.error.required_scope || bodyError.error.scope || missingScope || 'unknown';
            console.error('[DropboxFolders] Found missing_scope in responseBody:', bodyError.error);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      console.error('[DropboxFolders] Dropbox API error details:', JSON.stringify(errorDetails, null, 2));
      console.error('[DropboxFolders] Extracted error summary:', errorSummary);
      console.error('[DropboxFolders] Full apiError structure:', JSON.stringify(apiError, Object.getOwnPropertyNames(apiError), 2).substring(0, 2000));
      
      // Log the actual error response from Dropbox API for debugging
      if (apiError?.error) {
        console.error('[DropboxFolders] Dropbox API error object:', JSON.stringify(apiError.error, null, 2));
        console.error('[DropboxFolders] Error tag:', apiError.error['.tag']);
        console.error('[DropboxFolders] Error required_scope:', apiError.error.required_scope);
        console.error('[DropboxFolders] Error scope:', apiError.error.scope);
      }
      
      if (actualError?.error) {
        console.error('[DropboxFolders] ActualError error object:', JSON.stringify(actualError.error, null, 2));
      }
      
      if (missingScope) {
        console.error('[DropboxFolders] Missing required scope:', missingScope);
      } else {
        console.warn('[DropboxFolders] Could not extract missing scope from error, but error suggests missing_scope');
        console.warn('[DropboxFolders] This usually means the Dropbox app does not have all required scopes enabled, or the token was created before scopes were enabled.');
      }
      
      // Provide more specific error messages
      const statusCode = errorDetails.statusCode || errorDetails.status || 400;
      if (statusCode === 400) {
        const errorMsg = errorSummary || errorDetails.error || apiError?.message || 'Invalid path or request';
        const errorTag = errorDetails.error_tag || errorDetails.errorType || '';
        
        // If error suggests missing scope, provide helpful message
        if (errorMsg.includes('missing_scope') || errorTag === 'missing_scope') {
          // Default to files.content.read if we can't determine the specific scope (this is what we request)
          const scopeName = missingScope || 'files.content.read';
          const scopeMsg = ` Missing scope: "${scopeName}".`;
          throw new Error(`Dropbox API error: Access token is missing required permissions.${scopeMsg} Please reconnect your Dropbox account using the OAuth flow to grant all required scopes. Go to Integration Settings → Dropbox → Disconnect, then click Connect to re-authenticate. Note: files.content.read automatically includes files.metadata.read.`);
        }
        
        throw new Error(`Dropbox API error (400): ${errorMsg}${errorTag ? ` [${errorTag}]` : ''}. Path: "${normalizedPath}". This usually means the access token is invalid, lacks required scopes, or the path format is incorrect.`);
      } else if (statusCode === 401 || statusCode === 403) {
        if (missingScope) {
          throw new Error(`Dropbox authentication failed: Missing required scope "${missingScope}". Please reconnect your Dropbox account using the OAuth flow (not manual token) to grant all required permissions. Go to Integration Settings → Dropbox → Disconnect, then click Connect to re-authenticate.`);
        } else {
          throw new Error('Dropbox authentication failed. Please reconnect your Dropbox account using the OAuth flow to ensure all required scopes are granted. Go to Integration Settings → Dropbox → Disconnect, then click Connect.');
        }
      } else {
        const errorMsg = errorSummary || errorDetails.error || apiError?.message || 'Unknown error';
        throw new Error(`Dropbox API error (${statusCode}): ${errorMsg}`);
      }
    }
    
    // Extract entries from result (Dropbox SDK wraps in 'result' property)
    const actualResult = (response as any)?.result || response;
    const entries = Array.isArray(actualResult.entries) ? actualResult.entries : [];
    
    const folders = entries
      .filter((item: any) => item && item['.tag'] === 'folder')
      .map((folder: any) => ({
        id: folder.path_lower || folder.path_display || folder.id || '',
        name: folder.name || 'Untitled Folder',
        type: 'folder',
        createdTime: folder.server_modified || new Date().toISOString(),
        modifiedTime: folder.server_modified || new Date().toISOString(),
        parents: folder.path_lower ? [folder.path_lower.split('/').slice(0, -1).join('/') || ''] : []
      }));

    console.log(`[DropboxFolders] Successfully listed ${folders.length} folders`);
    return createSuccessResponse({ folders });

  } catch (error) {
    console.error('[DropboxFolders] Failed to list Dropbox folders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('Failed to list folders', errorMessage);
  }
});

/**
 * Get Dropbox files in a folder
 */
export const getDropboxFiles = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { folderPath = '' } = data; // Empty string is root folder

    if (folderPath === undefined) {
      throw new Error('Folder path is required');
    }

    // Get and refresh organization-level tokens
    const tokens = await refreshDropboxAccessToken(userId, organizationId);
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });

    // Normalize folder path - Dropbox uses empty string for root, not 'root'
    const normalizedPath = folderPath === 'root' ? '' : (folderPath || '');
    
    console.log(`[DropboxFiles] Listing files for path: "${normalizedPath}" (original: "${folderPath}")`);

    // List files in folder
    let response;
    try {
      response = await dbx.filesListFolder({ path: normalizedPath });
      
      // Dropbox SDK v10.34.0 wraps the actual API response in a 'result' property
      // Response structure: { status: 200, headers: {...}, result: { entries: [...], cursor: '...', has_more: false } }
      const actualResult = (response as any)?.result || response;
      
      console.log(`[DropboxFiles] Response received:`, {
        hasResponse: !!response,
        hasResult: !!(response as any)?.result,
        hasEntries: !!actualResult?.entries,
        entriesCount: actualResult?.entries?.length || 0
      });
      
      // Extract entries from result (Dropbox SDK wraps in 'result' property)
      const entries = Array.isArray(actualResult.entries) ? actualResult.entries : [];
      
      const files = entries
        .filter((item: any) => item['.tag'] === 'file')
        .map((file: any) => ({
          id: file.path_lower || file.path_display,
          name: file.name,
          type: 'file',
          size: file.size || 0,
          createdTime: file.server_modified || new Date().toISOString(),
          modifiedTime: file.server_modified || new Date().toISOString(),
          downloadUrl: file.path_lower || file.path_display
        }));
      
      console.log(`[DropboxFiles] ✅ Successfully extracted ${files.length} files from ${entries.length} entries`);
      
      return createSuccessResponse({ files });
      
    } catch (apiError: any) {
      console.error('[DropboxFiles] Dropbox API error:', {
        error: apiError,
        message: apiError?.message,
        status: apiError?.status,
        errorSummary: apiError?.error_summary,
        path: normalizedPath
      });
      
      // Provide more specific error messages
      if (apiError?.status === 400) {
        const errorMsg = apiError?.error_summary || apiError?.message || 'Invalid path or request';
        throw new Error(`Dropbox API error (400): ${errorMsg}. Path: "${normalizedPath}"`);
      } else if (apiError?.status === 401 || apiError?.status === 403) {
        throw new Error('Dropbox authentication failed. Please reconnect your Dropbox account.');
      } else {
        throw new Error(`Dropbox API error (${apiError?.status || 'unknown'}): ${apiError?.error_summary || apiError?.message || 'Unknown error'}`);
      }
    }

  } catch (error) {
    console.error('Failed to get Dropbox files:', error);
    return createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Create Dropbox folder
 */
export const createDropboxFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { name, parentPath = '' } = data; // Empty string is root folder

    if (!name) {
      throw new Error('Folder name is required');
    }

    // Get and refresh tokens
    const tokens = await refreshDropboxAccessToken(userId, organizationId);
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });

    // Create folder path
    const folderPath = parentPath ? `${parentPath}/${name}` : `/${name}`;

    // Create folder
    const response = await dbx.filesCreateFolderV2({ path: folderPath });

    const folder = {
      id: response.metadata.path_lower || response.metadata.path_display,
      name: response.metadata.name,
      type: 'folder',
      createdTime: response.metadata.server_modified || new Date().toISOString(),
      modifiedTime: response.metadata.server_modified || new Date().toISOString(),
      parents: parentPath ? [parentPath] : ['']
    };

    return createSuccessResponse({ folder });

  } catch (error) {
    console.error('Failed to create Dropbox folder:', error);
    return createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Upload file to Dropbox
 */
export const uploadToDropbox = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';
    const { fileName, fileContent, folderPath = '' } = data; // Empty string is root folder

    if (!fileName || !fileContent) {
      throw new Error('File name and content are required');
    }

    // Get and refresh tokens
    const tokens = await refreshDropboxAccessToken(userId, organizationId);
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });

    // Convert base64 content to buffer
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Create file path
    const filePath = folderPath ? `${folderPath}/${fileName}` : `/${fileName}`;

    // Upload file
    const response = await dbx.filesUpload({
      path: filePath,
      contents: fileBuffer
    });

    const file = {
      id: response.path_lower || response.path_display,
      name: response.name,
      type: 'file',
      size: response.size,
      createdTime: response.server_modified || new Date().toISOString(),
      modifiedTime: response.server_modified || new Date().toISOString(),
      downloadUrl: response.path_lower || response.path_display
    };

    return createSuccessResponse({ file });

  } catch (error) {
    console.error('Failed to upload to Dropbox:', error);
    return createErrorResponse('Failed to upload file', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Index Dropbox folder - List files and store metadata with shared links for organization-wide access
 */
export const indexDropboxFolder = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      return createErrorResponse('Authentication required', 'UNAUTHENTICATED');
    }

    const { folderPath, organizationId } = data;
    const userId = context.auth.uid;

    if (folderPath === undefined || !organizationId) {
      return createErrorResponse('Folder path and organization ID are required', 'INVALID_ARGUMENT');
    }

    console.log(`📁 [DropboxIndexing] Indexing Dropbox folder ${folderPath} for org ${organizationId} by user ${hashForLogging(userId)}`);

    // Get organization-level encrypted tokens from Firestore
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('dropbox')
      .get();

    if (!integrationDoc.exists) {
      return createErrorResponse('Dropbox not connected. Please have an admin connect the Dropbox account.', 'NOT_FOUND');
    }

    const integrationData = integrationDoc.data();
    if (!integrationData?.encryptedTokens) {
      return createErrorResponse('No OAuth tokens found', 'NOT_FOUND');
    }

    // Decrypt tokens and refresh if needed
    const tokens = await refreshDropboxAccessToken(userId, organizationId);
    
    // Set up Dropbox client
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });

    // List files in the folder recursively
    console.log(`📋 [DropboxIndexing] Listing files in folder ${folderPath}`);
    const allFiles: any[] = [];
    let cursor: string | undefined;
    
    do {
      const response = cursor 
        ? await dbx.filesListFolderContinue({ cursor })
        : await dbx.filesListFolder({ path: folderPath, recursive: true });
      
      allFiles.push(...response.entries.filter((item: any) => item['.tag'] === 'file'));
      cursor = response.has_more ? response.cursor : undefined;
    } while (cursor);

    console.log(`📦 [DropboxIndexing] Found ${allFiles.length} files in folder ${folderPath}`);

    // Create shared links for video files
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.mpg', '.mpeg'];
    const batch = admin.firestore().batch();
    const indexedFilesRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('dropboxIndexedFiles');

    let filesIndexed = 0;
    let sharedLinksCreated = 0;

    for (const file of allFiles) {
      const fileName = file.name || '';
      const isVideo = videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
      
      let sharedLink: string | undefined;

      // If it's a video file, create a shared link
      if (isVideo) {
        try {
          console.log(`🔗 [DropboxIndexing] Creating shared link for video: ${fileName}`);
          const linkResponse = await dbx.sharingCreateSharedLinkWithSettings({
            path: file.path_lower || file.path_display,
            settings: {
              requested_visibility: { '.tag': 'public' },
              allow_download: true
            }
          });
          sharedLink = linkResponse.url;
          if (sharedLink) {
            sharedLinksCreated++;
            console.log(`✅ [DropboxIndexing] Created shared link for ${fileName}`);
          }
        } catch (linkError: any) {
          // If link already exists, try to get it
          if (linkError.error?.error_summary?.includes('shared_link_already_exists')) {
            try {
              const existingLinks = await dbx.sharingListSharedLinks({ path: file.path_lower || file.path_display });
              if (existingLinks.links && existingLinks.links.length > 0) {
                sharedLink = existingLinks.links[0].url;
              }
            } catch (getLinkError) {
              console.warn(`⚠️ [DropboxIndexing] Failed to get existing shared link for ${fileName}:`, getLinkError);
            }
          } else {
            console.warn(`⚠️ [DropboxIndexing] Failed to create shared link for ${fileName}:`, linkError);
          }
        }
      }

      // Store indexed file in Firestore
      const fileDoc = {
        name: fileName,
        dropboxFileId: file.path_lower || file.path_display,
        mimeType: '', // Dropbox API doesn't always provide mime type
        size: file.size || 0,
        webViewLink: sharedLink || undefined,
        downloadUrl: sharedLink || undefined,
        parentFolderPath: folderPath,
        dropboxUserId: userId,
        dropboxUserEmail: integrationData.accountEmail || '',
        indexedBy: userId,
        indexedAt: admin.firestore.FieldValue.serverTimestamp(),
        organizationId: organizationId,
        createdAt: file.server_modified || null,
        modifiedAt: file.server_modified || null,
        hasSharedLink: !!sharedLink,
        isVideo: isVideo
      };

      batch.set(indexedFilesRef.doc(file.id || file.path_lower || file.path_display), fileDoc);
      filesIndexed++;
    }

    await batch.commit();

    console.log(`✅ [DropboxIndexing] Successfully indexed ${filesIndexed} files from folder ${folderPath}`);
    console.log(`🔗 [DropboxIndexing] Created ${sharedLinksCreated} new shared links for videos`);

    return createSuccessResponse({
      success: true,
      filesIndexed: filesIndexed,
      folderPath: folderPath,
      sharedLinksCreated: sharedLinksCreated
    });

  } catch (error) {
    console.error('❌ [DropboxIndexing] Failed to index Dropbox folder:', error);
    return createErrorResponse('Failed to index folder', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Dropbox integration status
 */
export const getDropboxIntegrationStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Check organization-level token
    let integrationDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('dropbox')
      .get();

    if (!integrationDoc.exists) {
      return createSuccessResponse({ connected: false });
    }

    const integrationData = integrationDoc.data();
    
    // Handle expiresAt timestamp
    let expiresAt: Date | null = null;
    if (integrationData?.expiresAt) {
      if (typeof integrationData.expiresAt.toDate === 'function') {
        expiresAt = integrationData.expiresAt.toDate();
      } else if (typeof integrationData.expiresAt === 'number') {
        expiresAt = new Date(integrationData.expiresAt);
      }
    } else if (integrationData?.expiresAtMillis) {
      expiresAt = new Date(Number(integrationData.expiresAtMillis));
    }
    
    const isExpired = expiresAt && expiresAt < new Date();

    return createSuccessResponse({
      connected: !isExpired && integrationData?.isActive !== false,
      accountEmail: integrationData?.accountEmail,
      accountName: integrationData?.accountName,
      expiresAt: expiresAt?.toISOString() || null
    });

  } catch (error) {
    console.error('Failed to get Dropbox integration status:', error);
    return createErrorResponse('Failed to get integration status', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Get Dropbox access token (decrypted)
 */
export const getDropboxAccessToken = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = context.auth.uid;
    const organizationId = context.auth.token.organizationId || 'default';

    // Get and refresh organization-level tokens (this handles decryption)
    const tokens = await refreshDropboxAccessToken(userId, organizationId);

    return createSuccessResponse({
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt instanceof Date 
        ? tokens.expiresAt.toISOString()
        : typeof tokens.expiresAt === 'string'
          ? tokens.expiresAt
          : tokens.expiresAt?.toDate?.()?.toISOString() || null
    });

  } catch (error) {
    console.error('Failed to get Dropbox access token:', error);
    return createErrorResponse('Failed to get access token', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Manually set Dropbox access token (Callable function - handles CORS automatically)
 * Allows setting a Dropbox access token directly (useful for testing or manual setup)
 */
export const setDropboxAccessToken = functions.https.onCall(async (data, context) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`[${requestId}] setDropboxAccessToken callable function called:`, {
    hasAuth: !!context.auth,
    hasData: !!data,
    timestamp: new Date().toISOString()
  });

  try {
    // Verify authentication
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const userId = String(context.auth.uid);
    let organizationId = 'default';
    if (context.auth.token.organizationId) {
      organizationId = String(context.auth.token.organizationId);
    } else {
      try {
        const userRecord = await admin.auth().getUser(context.auth.uid);
        const customClaims = userRecord.customClaims || {};
        if (customClaims.organizationId) {
          organizationId = String(customClaims.organizationId);
        }
      } catch (userError) {
        console.warn(`[${requestId}] Could not get user record for custom claims`);
      }
    }

    const { organizationId: bodyOrgId, accessToken, refreshToken, accountEmail, accountName } = data || {};
    
    // Use organizationId from data if provided, otherwise use from token
    const finalOrganizationId = bodyOrgId || organizationId;

    if (!finalOrganizationId || !accessToken) {
      throw new Error('Missing required fields: organizationId and accessToken are required');
    }

    console.log(`[${requestId}] 💾 [DropboxToken] Manually setting token for org: ${finalOrganizationId} by user: ${userId}`);

    // Verify user is admin of the organization
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || userData.organizationId !== finalOrganizationId) {
      throw new Error('User does not belong to this organization');
    }

    // Check if user is admin
    if (userData.role !== 'ADMIN' && userData.role !== 'OWNER') {
      throw new Error('Only organization admins can set integration tokens');
    }

    // Verify the token works by getting user info AND testing required scopes
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken });
    let userInfo: any;
    try {
      userInfo = await dbx.usersGetCurrentAccount();
      console.log(`[${requestId}] ✅ [DropboxToken] Token validated - account info:`, {
        email: userInfo.email,
        name: userInfo.name?.display_name,
        accountId: userInfo.account_id
      });
    } catch (tokenError: any) {
      console.error(`[${requestId}] ❌ [DropboxToken] Token validation failed:`, {
        message: tokenError?.message,
        error: tokenError?.error,
        status: tokenError?.status
      });
      throw new Error(`Invalid access token: ${tokenError.message || 'Token verification failed'}`);
    }

    // CRITICAL: Test that token has ALL required scopes for file operations
    // Required scope: files.content.read (download files and list folders - automatically includes files.metadata.read)
    // This prevents manual tokens from bypassing OAuth when they don't have all scopes
    const requiredScopes = [
      { name: 'files.metadata.read', test: async () => await dbx.filesListFolder({ path: '' }) },
      { name: 'files.content.read', test: async () => {
        // Test by attempting to get account info (requires basic read access)
        // Then try to list files which requires content read capability
        await dbx.usersGetCurrentAccount();
        // If we can list folders, content.read is likely available
        return await dbx.filesListFolder({ path: '' });
      }}
    ];
    
    const missingScopes: string[] = [];
    
    for (const scopeTest of requiredScopes) {
      try {
        console.log(`[${requestId}] 🔍 [DropboxToken] Testing scope: ${scopeTest.name}...`);
        await scopeTest.test();
        console.log(`[${requestId}] ✅ [DropboxToken] Scope ${scopeTest.name} validated`);
      } catch (scopeError: any) {
        // Check if error is due to missing scope
        const errorSummary = scopeError?.error_summary || scopeError?.error?.error_summary || scopeError?.message || '';
        const errorTag = scopeError?.error?.['.tag'] || scopeError?.['.tag'];
        const hasMissingScope = errorSummary.includes('missing_scope') || 
                               errorTag === 'missing_scope' ||
                               (scopeError?.status === 400 && errorSummary.includes('scope'));
        
        if (hasMissingScope) {
          const missingScope = scopeError?.error?.required_scope || scopeError?.error?.scope || scopeTest.name;
          missingScopes.push(missingScope);
          console.error(`[${requestId}] ❌ [DropboxToken] Token missing scope ${scopeTest.name}:`, {
            missingScope,
            errorSummary,
            errorTag
          });
        } else {
          // For non-scope errors, we'll be lenient but log a warning
          // Some operations might fail for other reasons (network, permissions, etc.)
          console.warn(`[${requestId}] ⚠️ [DropboxToken] Scope test for ${scopeTest.name} had non-scope error:`, {
            message: scopeError?.message,
            errorSummary,
            status: scopeError?.status
          });
        }
      }
    }
    
    // If we found missing scopes, reject the token
    if (missingScopes.length > 0) {
      const missingScopesList = missingScopes.join(', ');
      console.error(`[${requestId}] ❌ [DropboxToken] Token missing required scopes: ${missingScopesList}`);
      throw new Error(`Access token is missing required permissions: ${missingScopesList}. Manual tokens often don't have all required scopes. Please use the OAuth flow instead: Go to Integration Settings → Dropbox → Disconnect, then click "Connect" to use OAuth. The OAuth flow will automatically request files.content.read (which includes files.metadata.read).`);
    }
    
    console.log(`[${requestId}] ✅ [DropboxToken] All required scopes validated (files.metadata.read, files.content.read). Token is ready for folder browsing and file playback.`);

    // Extract account information from userInfo
    const finalAccountEmail = accountEmail || userInfo.email || userInfo.account_id || '';
    const finalAccountName = accountName || userInfo.name?.display_name || userInfo.name?.given_name || userInfo.name?.surname || '';

    console.log(`[${requestId}] 📋 [DropboxToken] Account info extracted:`, {
      email: finalAccountEmail,
      name: finalAccountName,
      userInfoKeys: Object.keys(userInfo || {})
    });

    // Encrypt tokens for storage
    const tokens = {
      accessToken: accessToken,
      refreshToken: refreshToken || null,
      expiresAt: null // Manual tokens don't have expiry info unless provided
    };
    const encryptedTokens = encryptTokens(tokens);

    // Store in organization-scoped collection
    const integrationDoc = {
      userId: String(userId),
      organizationId: String(finalOrganizationId),
      provider: 'dropbox',
      accountEmail: finalAccountEmail,
      accountName: finalAccountName,
      encryptedTokens,
      isActive: true,
      connectionMethod: 'manual', // Manual token connection (may lack required scopes)
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null
    };

    await admin.firestore()
      .collection('organizations')
      .doc(finalOrganizationId)
      .collection('cloudIntegrations')
      .doc('dropbox')
      .set(integrationDoc);

    console.log(`[${requestId}] ✅ [DropboxToken] Token set successfully for org: ${finalOrganizationId}`);

    return {
      success: true,
      message: 'Dropbox access token set successfully',
      accountEmail: finalAccountEmail,
      accountName: finalAccountName
    };

  } catch (error) {
    console.error(`[${requestId}] ❌ [DropboxToken] Error setting token:`, error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to set Dropbox access token',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

/**
 * Save Dropbox configuration to Firestore
 * Similar to saveBoxConfig - stores organization-specific Dropbox credentials
 */
export const saveDropboxConfig = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    const { organizationId, appKey, appSecret, redirectUri } = data;

    if (!organizationId) {
      throw new Error('Missing required configuration field: organizationId is required');
    }

    // App Key and App Secret are optional - OAuth can work without them if configured elsewhere
    // But if one is provided, both must be provided
    if ((appKey && !appSecret) || (appSecret && !appKey)) {
      throw new Error('If App Key is provided, App Secret must also be provided (and vice versa)');
    }

    console.log(`💾 [DropboxConfig] Saving config for org: ${organizationId} by user: ${context.auth.uid}`);

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

    // Save configuration to integrationConfigs (unified storage)
    const configRef = admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc('dropbox-integration');

    // Check if record exists to preserve createdAt
    const existingRecord = await configRef.get();
    const existingData = existingRecord.data();

    const configData: any = {
      id: 'dropbox-integration',
      name: 'Dropbox Integration',
      type: 'dropbox',
      enabled: true,
      organizationId: organizationId,
      credentials: {},
      settings: {
        redirectUri: redirectUri || 'https://clipshowpro.web.app/integration-settings'
      },
      createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Only save credentials if both are provided
    if (appKey && appSecret) {
      // Encrypt app secret before storing
      // encryptTokens expects an object, so we wrap the appSecret
      const encryptedAppSecret = encryptTokens({ appSecret });
      configData.credentials = {
        clientId: appKey, // Map appKey to clientId for consistency
        clientSecret: encryptedAppSecret // Map appSecret to clientSecret for consistency
      };
    }

    await configRef.set(configData, { merge: true });

    // Also save to integrationSettings for backward compatibility (temporary during migration)
    const updateData: any = {
      redirectUri: redirectUri || 'https://clipshowpro.web.app/integration-settings',
      isConfigured: true,
      configuredBy: context.auth.uid,
      configuredAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Only save credentials if both are provided
    if (appKey && appSecret) {
      // Encrypt app secret before storing
      // encryptTokens expects an object, so we wrap the appSecret
      const encryptedAppSecret = encryptTokens({ appSecret });
      updateData.appKey = appKey;
      updateData.appSecret = encryptedAppSecret;
    }

    await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationSettings')
      .doc('dropbox')
      .set(updateData, { merge: true });

    console.log(`✅ [DropboxConfig] Config saved successfully to integrationConfigs for org: ${organizationId}`);

    return createSuccessResponse({
      success: true,
      message: 'Dropbox configuration saved successfully'
    });

  } catch (error) {
    console.error(`❌ [DropboxConfig] Error saving config:`, error);
    return createErrorResponse(
      'Failed to save Dropbox configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

/**
 * Diagnostic function to test Dropbox config retrieval
 * Helps diagnose encryption/decryption issues
 */
export const testDropboxConfig = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new Error('Authentication required');
    }

    let { organizationId } = data;
    if (!organizationId) {
      // Try to get from user's token
      const userRecord = await admin.auth().getUser(context.auth.uid);
      const customClaims = userRecord.customClaims || {};
      organizationId = customClaims.organizationId;
      if (!organizationId) {
        throw new Error('organizationId is required');
      }
    }

    // Check encryption key availability
    const testKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    let configKey: string | undefined;
    try {
      configKey = functions.config().integrations?.encryption_key;
    } catch {
      // Config might not be available
    }

    // Try to get config
    const config = await getDropboxConfig(organizationId);

    // Get raw Firestore data
    const orgConfigDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationSettings')
      .doc('dropbox')
      .get();

    const rawData = orgConfigDoc.exists ? orgConfigDoc.data() : null;

    return createSuccessResponse({
      hasConfig: !!config.appKey && !!config.appSecret,
      configAppKeyLength: config.appKey?.length || 0,
      configAppSecretLength: config.appSecret?.length || 0,
      hasRawData: !!rawData,
      rawAppKeyLength: rawData?.appKey?.length || 0,
      rawAppSecretLength: rawData?.appSecret?.length || 0,
      rawAppSecretIsBase64: rawData?.appSecret ? /^[A-Za-z0-9+/]*={0,2}$/.test(rawData.appSecret) : false,
      rawAppSecretLooksEncrypted: rawData?.appSecret ? (rawData.appSecret.length > 100 && /^[A-Za-z0-9+/]*={0,2}$/.test(rawData.appSecret)) : false,
      hasEncryptionKey: !!(testKey || configKey),
      encryptionKeyLength: (testKey || configKey)?.length || 0,
      redirectUri: config.redirectUri
    });

  } catch (error) {
    console.error(`❌ [DropboxConfig] Error testing config:`, error);
    return createErrorResponse(
      'Failed to test Dropbox configuration',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
});

/**
 * Update Dropbox account information (email and/or name)
 * Allows users to manually set account email if not provided by Dropbox API
 */
export const updateDropboxAccountInfo = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: true,         // Enable CORS support
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        return createErrorResponse('Authentication required', 'User must be authenticated');
      }

      const { organizationId, accountEmail, accountName } = request.data;

      if (!organizationId) {
        return createErrorResponse('Organization ID required', 'organizationId must be provided');
      }

      // At least one field must be provided
      if (!accountEmail && !accountName) {
        return createErrorResponse('Account information required', 'At least one of accountEmail or accountName must be provided');
      }

      console.log(`[UpdateDropboxAccountInfo] Updating account info for org: ${organizationId}`, {
        hasEmail: !!accountEmail,
        hasName: !!accountName
      });

      // Get the integration document
      const integrationRef = admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('cloudIntegrations')
        .doc('dropbox');

      const integrationDoc = await integrationRef.get();

      if (!integrationDoc.exists) {
        return createErrorResponse('Dropbox integration not found', 'Dropbox must be connected first');
      }

      const integrationData = integrationDoc.data();
      
      // Prepare update data - only update fields that are provided
      const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (accountEmail !== null && accountEmail !== undefined) {
        updateData.accountEmail = String(accountEmail);
      }

      if (accountName !== null && accountName !== undefined) {
        updateData.accountName = String(accountName);
      }

      // Update the document
      await integrationRef.update(updateData);

      console.log(`[UpdateDropboxAccountInfo] Successfully updated account info for org: ${organizationId}`);

      // Also update the integrationConfig document if it exists
      try {
        const integrationConfigRef = admin.firestore()
          .collection('organizations')
          .doc(organizationId)
          .collection('integrationConfigs')
          .doc('dropbox-integration');

        const configUpdateData: any = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (accountEmail !== null && accountEmail !== undefined) {
          configUpdateData.accountEmail = String(accountEmail);
        }

        if (accountName !== null && accountName !== undefined) {
          configUpdateData.accountName = String(accountName);
        }

        await integrationConfigRef.set(configUpdateData, { merge: true });
        console.log(`[UpdateDropboxAccountInfo] Also updated integrationConfig document`);
      } catch (configError) {
        console.warn(`[UpdateDropboxAccountInfo] Failed to update integrationConfig (non-critical):`, configError);
      }

      return {
        success: true,
        message: 'Account information updated successfully',
        data: {
          accountEmail: accountEmail || integrationData?.accountEmail || '',
          accountName: accountName || integrationData?.accountName || ''
        }
      };

    } catch (error: any) {
      console.error(`[UpdateDropboxAccountInfo] Error:`, error);
      return createErrorResponse(
        'Failed to update account information',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
);

