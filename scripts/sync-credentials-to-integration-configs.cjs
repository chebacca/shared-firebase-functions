/**
 * Sync Credentials to Integration Configs Script
 * 
 * For existing OAuth connections, reads credentials from cloudIntegrations
 * and saves them to integrationConfigs so they appear in the UI
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
let initialized = false;

// Method 1: Try environment variable
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
    });
    initialized = true;
    console.log('✅ Using service account from GOOGLE_APPLICATION_CREDENTIALS');
  } catch (error) {
    console.warn('⚠️  Failed to load service account from env:', error.message);
  }
}

// Method 2: Try local service account files
if (!initialized) {
  const possiblePaths = [
    path.join(__dirname, '../../backbone-logic-firebase-adminsdk-fbsvc-3db30f4742.json'),
    path.join(__dirname, '../firebase-clipshow.json'),
    path.join(__dirname, '../serviceAccountKey.json'),
    path.join(__dirname, '../../serviceAccountKey.json')
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
        console.log(`✅ Using service account from: ${serviceAccountPath}`);
        break;
      } catch (error) {
        console.warn(`⚠️  Failed to load ${serviceAccountPath}:`, error.message);
      }
    }
  }
}

// Method 3: Try default credentials (Firebase CLI)
if (!initialized) {
  try {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'backbone-logic'
    });
    initialized = true;
    console.log('✅ Using default Firebase credentials (Firebase CLI)');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\nPlease use one of these methods:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.error('  2. Place serviceAccountKey.json or firebase-clipshow.json in shared-firebase-functions directory');
    console.error('  3. Run: firebase login:ci (for Firebase CLI authentication)');
    process.exit(1);
  }
}

const db = admin.firestore();

// Simple decryption function (JavaScript version)
function decryptTokens(encryptedData) {
  const crypto = require('crypto');
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

async function syncCredentialsToIntegrationConfigs() {
  console.log('\n🔄 Starting Credentials Sync...\n');
  
  try {
    // Get all organizations
    const orgsSnapshot = await db.collection('organizations').get();
    console.log(`📊 Found ${orgsSnapshot.size} organizations\n`);
    
    let totalUpdated = 0;
    
    // Process each organization
    for (const orgDoc of orgsSnapshot.docs) {
      const orgId = orgDoc.id;
      const orgData = orgDoc.data();
      const orgName = orgData.name || orgData.displayName || orgId;
      
      console.log(`\n📁 Organization: ${orgName} (${orgId})`);
      console.log('─'.repeat(60));
      
      // Check Box integration
      try {
        const boxCloudIntegrationRef = db.collection('organizations').doc(orgId)
          .collection('cloudIntegrations').doc('box');
        const boxCloudIntegrationDoc = await boxCloudIntegrationRef.get();
        
        if (boxCloudIntegrationDoc.exists) {
          const boxCloudData = boxCloudIntegrationDoc.data();
          
          // Check if credentials exist in cloudIntegrations
          let boxCredentials = {};
          if (boxCloudData?.oauthCredentials) {
            try {
              const decrypted = decryptTokens(boxCloudData.oauthCredentials);
              if (decrypted.clientId) {
                boxCredentials.clientId = decrypted.clientId;
              }
              if (decrypted.clientSecret) {
                boxCredentials.clientSecret = decrypted.clientSecret;
              }
              console.log('  ✅ Found Box credentials in cloudIntegrations');
            } catch (decryptError) {
              console.warn('  ⚠️  Failed to decrypt Box credentials:', decryptError.message);
            }
          }
          
          // Update integrationConfigs if credentials were found
          if (Object.keys(boxCredentials).length > 0) {
            const boxIntegrationConfigRef = db.collection('organizations').doc(orgId)
              .collection('integrationConfigs').doc('box-integration');
            const boxIntegrationConfigDoc = await boxIntegrationConfigRef.get();
            
            if (boxIntegrationConfigDoc.exists) {
              const existingData = boxIntegrationConfigDoc.data();
              // Only update if credentials are missing or empty
              if (!existingData?.credentials?.clientId && !existingData?.credentials?.clientSecret) {
                await boxIntegrationConfigRef.update({
                  credentials: boxCredentials,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log('  ✅ Updated Box integrationConfigs with credentials');
                totalUpdated++;
              } else {
                console.log('  ⏭️  Box integrationConfigs already has credentials');
              }
            } else {
              // Create integrationConfigs record if it doesn't exist
              await boxIntegrationConfigRef.set({
                id: 'box-integration',
                name: 'Box Integration',
                type: 'box',
                enabled: true,
                organizationId: orgId,
                accountEmail: boxCloudData.accountEmail || '',
                accountName: boxCloudData.accountName || '',
                credentials: boxCredentials,
                settings: {},
                testStatus: 'success',
                testMessage: `Connected to Box as ${boxCloudData.accountEmail || 'Box account'}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log('  ✅ Created Box integrationConfigs with credentials');
              totalUpdated++;
            }
          } else {
            console.log('  ℹ️  No Box credentials found in cloudIntegrations (may be using Firebase config)');
          }
        }
      } catch (boxError) {
        console.warn('  ⚠️  Error processing Box:', boxError.message);
      }
      
      // Check Dropbox integration
      try {
        const dropboxCloudIntegrationRef = db.collection('organizations').doc(orgId)
          .collection('cloudIntegrations').doc('dropbox');
        const dropboxCloudIntegrationDoc = await dropboxCloudIntegrationRef.get();
        
        if (dropboxCloudIntegrationDoc.exists) {
          const dropboxCloudData = dropboxCloudIntegrationDoc.data();
          
          // Check if credentials exist in cloudIntegrations
          let dropboxCredentials = {};
          if (dropboxCloudData?.oauthCredentials) {
            try {
              const decrypted = decryptTokens(dropboxCloudData.oauthCredentials);
              if (decrypted.appKey) {
                dropboxCredentials.clientId = decrypted.appKey; // Store as clientId for UI consistency
              }
              if (decrypted.appSecret) {
                dropboxCredentials.clientSecret = decrypted.appSecret; // Store as clientSecret for UI consistency
              }
              console.log('  ✅ Found Dropbox credentials in cloudIntegrations');
            } catch (decryptError) {
              console.warn('  ⚠️  Failed to decrypt Dropbox credentials:', decryptError.message);
            }
          }
          
          // Update integrationConfigs if credentials were found
          if (Object.keys(dropboxCredentials).length > 0) {
            const dropboxIntegrationConfigRef = db.collection('organizations').doc(orgId)
              .collection('integrationConfigs').doc('dropbox-integration');
            const dropboxIntegrationConfigDoc = await dropboxIntegrationConfigRef.get();
            
            if (dropboxIntegrationConfigDoc.exists) {
              const existingData = dropboxIntegrationConfigDoc.data();
              // Only update if credentials are missing or empty
              if (!existingData?.credentials?.clientId && !existingData?.credentials?.clientSecret) {
                await dropboxIntegrationConfigRef.update({
                  credentials: dropboxCredentials,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log('  ✅ Updated Dropbox integrationConfigs with credentials');
                totalUpdated++;
              } else {
                console.log('  ⏭️  Dropbox integrationConfigs already has credentials');
              }
            } else {
              // Create integrationConfigs record if it doesn't exist
              await dropboxIntegrationConfigRef.set({
                id: 'dropbox-integration',
                name: 'Dropbox Integration',
                type: 'dropbox',
                enabled: true,
                organizationId: orgId,
                accountEmail: dropboxCloudData.accountEmail || '',
                accountName: dropboxCloudData.accountName || '',
                credentials: dropboxCredentials,
                settings: {},
                testStatus: 'success',
                testMessage: `Connected to Dropbox as ${dropboxCloudData.accountEmail || 'Dropbox account'}`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log('  ✅ Created Dropbox integrationConfigs with credentials');
              totalUpdated++;
            }
          } else {
            console.log('  ℹ️  No Dropbox credentials found in cloudIntegrations (may be using Firebase config)');
          }
        }
      } catch (dropboxError) {
        console.warn('  ⚠️  Error processing Dropbox:', dropboxError.message);
      }
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nTotal Organizations Processed: ${orgsSnapshot.size}`);
    console.log(`Integration Configs Updated: ${totalUpdated}`);
    console.log('\n✅ Sync complete!\n');
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the sync
syncCredentialsToIntegrationConfigs()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

