/**
 * Process Box OAuth Callback using Firebase Admin SDK
 * 
 * Usage:
 *   node scripts/process-box-oauth-admin.js <code> <state> [organizationId]
 * 
 * Example:
 *   node scripts/process-box-oauth-admin.js NA6bSVxOko43ISqn50wO8oj3hXNkgf2A daf1418600deae2bfa2a709547891c87a1cfbad8e8c69dcab950f061b1eafe35
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const functions = require('firebase-functions');

// Simple decryption function (JavaScript version)
function decryptTokens(encryptedData) {
  const ALGORITHM = 'aes-256-gcm';
  const IV_LENGTH = 16;
  const SALT_LENGTH = 64;
  const TAG_LENGTH = 16;
  
  // Get encryption key from environment variables
  // NOTE: functions.config() is deprecated - use environment variables or Secret Manager
  const masterKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  
  if (!masterKey) {
    throw new Error('Encryption key not found');
  }
  
  function deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
  }
  
  const combined = Buffer.from(encryptedData, 'base64');
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = deriveKey(masterKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(salt);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const path = require('path');
  const fs = require('fs');
  let initialized = false;
  
  // Try multiple service account file paths
  const possiblePaths = [
    path.join(__dirname, '../backbone-logic-6fe5ca549914.json'),
    path.join(__dirname, '../../backbone-logic-6fe5ca549914.json'),
    path.join(__dirname, '../../backbone-logic-firebase-adminsdk-fbsvc-3db30f4742.json'),
    path.join(__dirname, '../firebase-clipshow.json'),
    path.join(__dirname, '../serviceAccountKey.json')
  ];
  
  for (const serviceAccountPath of possiblePaths) {
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
        });
        initialized = true;
        console.log(`✅ [Admin] Using service account from: ${serviceAccountPath}`);
        break;
      } catch (error) {
        console.warn(`⚠️ [Admin] Failed to load ${serviceAccountPath}:`, error.message);
      }
    }
  }
  
  // Fallback: Use Application Default Credentials (if running on GCP or with gcloud auth)
  if (!initialized) {
    console.log('⚠️ [Admin] Could not load service account file, trying Application Default Credentials...');
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'backbone-logic'
    });
  }
}

const db = admin.firestore();

async function processBoxOAuth(code, state, organizationId = null) {
  try {
    console.log('🔧 [Admin] Processing Box OAuth callback...');
    console.log('📋 [Admin] Code:', code.substring(0, 20) + '...');
    console.log('📋 [Admin] State:', state.substring(0, 20) + '...');

    // Step 1: Verify state parameter
    const stateDoc = await db.collection('oauthStates').doc(state).get();
    
    if (!stateDoc.exists) {
      console.error('❌ [Admin] State document not found. OAuth session may have expired.');
      console.log('💡 [Admin] Tip: The state expires after 60 minutes. Please reconnect Box.');
      return { success: false, error: 'Invalid or expired state parameter' };
    }

    const stateData = stateDoc.data();
    console.log('✅ [Admin] State verified:', {
      userId: stateData.userId ? stateData.userId.substring(0, 10) + '...' : 'N/A',
      organizationId: stateData.organizationId || 'N/A',
      provider: stateData.provider || 'N/A',
      createdAt: stateData.createdAtMillis ? new Date(stateData.createdAtMillis).toISOString() : 'N/A'
    });

    // Use organizationId from state or provided parameter
    const finalOrgId = organizationId || stateData.organizationId || 'standalone';
    const userId = stateData.userId;

    // Step 2: Get Box configuration
    let boxConfig = null;
    
    // Try integrationConfigs first
    if (finalOrgId && finalOrgId !== 'standalone') {
      const configDoc = await db
        .collection('organizations')
        .doc(finalOrgId)
        .collection('integrationConfigs')
        .doc('box')
        .get();
      
      if (configDoc.exists) {
        const configData = configDoc.data();
        if (configData?.credentials?.clientId) {
          // Decrypt client secret if encrypted
          let clientSecret = configData.credentials.clientSecret;
          try {
            const decrypted = decryptTokens(configData.credentials.clientSecret);
            clientSecret = typeof decrypted === 'object' && decrypted.clientSecret 
              ? decrypted.clientSecret 
              : (typeof decrypted === 'string' ? decrypted : configData.credentials.clientSecret);
            console.log('✅ [Admin] Decrypted client secret from integrationConfigs');
          } catch (decryptError) {
            // If decryption fails, assume it's already plaintext
            console.log('⚠️ [Admin] Could not decrypt, assuming plaintext:', decryptError.message);
            clientSecret = configData.credentials.clientSecret;
          }
          
          boxConfig = {
            credentials: {
              clientId: configData.credentials.clientId,
              clientSecret: typeof clientSecret === 'string' ? clientSecret : String(clientSecret)
            },
            redirectUri: configData.settings?.redirectUri || stateData.redirectUri || 'http://localhost:4010/integration-settings',
            scope: configData.settings?.scope || 'root_readwrite'
          };
          console.log('✅ [Admin] Found Box config in integrationConfigs');
        }
      }
      
      // Try integrationSettings (legacy location)
      if (!boxConfig) {
        const legacyConfigDoc = await db
          .collection('organizations')
          .doc(finalOrgId)
          .collection('integrationSettings')
          .doc('box')
          .get();
        
        if (legacyConfigDoc.exists) {
          const legacyData = legacyConfigDoc.data();
          if (legacyData?.clientId) {
            // Decrypt client secret if encrypted
            let clientSecret = legacyData.clientSecret;
            try {
              const decrypted = decryptTokens(legacyData.clientSecret);
              clientSecret = typeof decrypted === 'object' && decrypted.clientSecret 
                ? decrypted.clientSecret 
                : (typeof decrypted === 'string' ? decrypted : legacyData.clientSecret);
              console.log('✅ [Admin] Decrypted client secret from integrationSettings');
            } catch (decryptError) {
              // If decryption fails, assume it's already plaintext
              console.log('⚠️ [Admin] Could not decrypt, assuming plaintext:', decryptError.message);
              clientSecret = legacyData.clientSecret;
            }
            
            boxConfig = {
              credentials: {
                clientId: legacyData.clientId,
                clientSecret: typeof clientSecret === 'string' ? clientSecret : String(clientSecret)
              },
              redirectUri: legacyData.redirectUri || stateData.redirectUri || 'http://localhost:4010/integration-settings',
              scope: legacyData.scope || 'root_readwrite'
            };
            console.log('✅ [Admin] Found Box config in integrationSettings (legacy)');
          }
        }
      }
    }

    // Fallback to environment variables
    if (!boxConfig || !boxConfig.credentials?.clientId) {
      boxConfig = {
        credentials: {
          clientId: process.env.BOX_CLIENT_ID,
          clientSecret: process.env.BOX_CLIENT_SECRET
        },
        redirectUri: process.env.BOX_REDIRECT_URI || stateData?.redirectUri || 'http://localhost:4010/integration-settings',
        scope: 'root_readwrite'
      };
      console.log('✅ [Admin] Using environment variables for Box config');
    }

    if (!boxConfig.credentials?.clientId || !boxConfig.credentials?.clientSecret) {
      throw new Error('Box client ID and secret must be configured');
    }

    // Step 3: Exchange code for tokens
    console.log('🔄 [Admin] Exchanging code for tokens...');
    const BoxSDKModule = require('box-node-sdk');
    const boxSDK = new BoxSDKModule({
      clientID: boxConfig.credentials.clientId,
      clientSecret: boxConfig.credentials.clientSecret
    });

    // Use redirect URI from state (set during OAuth initiation) or config
    const finalRedirectUri = stateData.redirectUri || boxConfig.redirectUri || 'http://localhost:4010/integration-settings';
    console.log('📋 [Admin] Using redirect URI:', finalRedirectUri);
    
    const tokenInfo = await boxSDK.getTokensAuthorizationCodeGrant(code, {
      redirectURI: finalRedirectUri
    });

    console.log('✅ [Admin] Tokens received');

    // Step 4: Get user info
    const client = boxSDK.getBasicClient(tokenInfo.accessToken);
    const userInfo = await client.users.getCurrentUser();
    
    console.log('✅ [Admin] User info:', {
      email: userInfo.login,
      name: userInfo.name
    });

    // Step 5: Save tokens to Firestore
    const connectionRef = db
      .collection('organizations')
      .doc(finalOrgId)
      .collection('cloudIntegrations')
      .doc('box');

    await connectionRef.set({
      accessToken: tokenInfo.accessToken,
      refreshToken: tokenInfo.refreshToken,
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + tokenInfo.expiresIn * 1000)),
      tokenType: tokenInfo.tokenType || 'bearer',
      accountEmail: userInfo.login,
      accountName: userInfo.name,
      userId: userInfo.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('✅ [Admin] Tokens saved to Firestore');

    // Step 6: Create/update integration record
    const integrationRecordRef = db
      .collection('organizations')
      .doc(finalOrgId)
      .collection('integrationConfigs')
      .doc('box-integration');

    const existingRecord = await integrationRecordRef.get();
    const existingData = existingRecord.data();

    const integrationRecord = {
      id: 'box-integration',
      name: 'Box',
      type: 'box',
      enabled: true,
      organizationId: finalOrgId,
      accountEmail: userInfo.login,
      accountName: userInfo.name,
      credentials: {},
      settings: {},
      testStatus: 'success',
      testMessage: `Connected to Box as ${userInfo.login || 'Box account'}`,
      createdAt: existingData?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await integrationRecordRef.set(integrationRecord, { merge: true });
    console.log('✅ [Admin] Integration record created/updated');

    // Step 7: Clean up state document
    await stateDoc.ref.delete();
    console.log('✅ [Admin] State document cleaned up');

    console.log('✅ [Admin] Box OAuth completed successfully!');
    return {
      success: true,
      accountEmail: userInfo.login,
      accountName: userInfo.name,
      organizationId: finalOrgId
    };

  } catch (error) {
    console.error('❌ [Admin] Error processing Box OAuth:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Main execution
const code = process.argv[2];
const state = process.argv[3];
const organizationId = process.argv[4] || null;

if (!code || !state) {
  console.error('❌ Usage: node scripts/process-box-oauth-admin.js <code> <state> [organizationId]');
  console.error('Example: node scripts/process-box-oauth-admin.js NA6bSVxOko43ISqn50wO8oj3hXNkgf2A daf1418600deae2bfa2a709547891c87a1cfbad8e8c69dcab950f061b1eafe35');
  process.exit(1);
}

processBoxOAuth(code, state, organizationId)
  .then((result) => {
    if (result.success) {
      console.log('\n✅ SUCCESS!');
      console.log('Account:', result.accountEmail);
      console.log('Organization:', result.organizationId);
      process.exit(0);
    } else {
      console.error('\n❌ FAILED:', result.error);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ UNEXPECTED ERROR:', error);
    process.exit(1);
  });

