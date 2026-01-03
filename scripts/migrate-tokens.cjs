/**
 * Script to migrate Box and Dropbox tokens from legacy format to encryptedTokens
 * 
 * Usage: node scripts/migrate-tokens.cjs [organizationId]
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
    path.join(__dirname, '../../serviceAccountKey.json'),
    path.join(__dirname, '../backbone-logic-6fe5ca549914.json'),
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
    console.log('✅ Using Application Default Credentials');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error);
    process.exit(1);
  }
}

const db = admin.firestore();

// Import encryption functions (need to use the compiled version)
let encryptTokens, decryptLegacyToken;
try {
  // Try to load from compiled lib
  const encryptionModule = require('../lib/integrations/encryption');
  encryptTokens = encryptionModule.encryptTokens;
  decryptLegacyToken = encryptionModule.decryptLegacyToken;
} catch (error) {
  console.error('❌ Failed to load encryption functions. Make sure to run npm run build first.');
  process.exit(1);
}

async function migrateBoxTokens(organizationId) {
  console.log(`\n📦 Migrating Box tokens for org: ${organizationId}`);
  
  const integrationDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('cloudIntegrations')
    .doc('box')
    .get();

  if (!integrationDoc.exists) {
    console.log('❌ Box integration not found');
    return { success: false, error: 'Not found' };
  }

  const integrationData = integrationDoc.data();

  // Check if already migrated
  if (integrationData.encryptedTokens) {
    console.log('✅ Box tokens already migrated');
    return { success: true, alreadyMigrated: true };
  }

  // Check for legacy tokens
  if (!integrationData.accessToken && !integrationData.refreshToken) {
    console.log('❌ No legacy tokens found');
    return { success: false, error: 'No tokens found' };
  }

  console.log('🔄 Migrating legacy tokens...');

  let accessToken, refreshToken;

  // Decrypt legacy format
  if (integrationData.accessToken) {
    try {
      if (integrationData.accessToken.includes(':')) {
        accessToken = decryptLegacyToken(integrationData.accessToken);
        console.log('✅ Decrypted accessToken');
      } else {
        accessToken = integrationData.accessToken;
      }
    } catch (error) {
      console.warn('⚠️ Failed to decrypt accessToken, using as-is');
      accessToken = integrationData.accessToken;
    }
  }

  if (integrationData.refreshToken) {
    try {
      if (integrationData.refreshToken.includes(':')) {
        refreshToken = decryptLegacyToken(integrationData.refreshToken);
        console.log('✅ Decrypted refreshToken');
      } else {
        refreshToken = integrationData.refreshToken;
      }
    } catch (error) {
      console.warn('⚠️ Failed to decrypt refreshToken, using as-is');
      refreshToken = integrationData.refreshToken;
    }
  }

  if (!accessToken && !refreshToken) {
    console.log('❌ No valid tokens found');
    return { success: false, error: 'No valid tokens' };
  }

  // Create tokens object
  const migratedTokens = {
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    expiresAt: integrationData?.tokenExpiresAt?.toDate?.() ||
               integrationData?.expiresAt?.toDate?.() ||
               null,
  };

  // Encrypt with new format
  const encryptedTokens = encryptTokens(migratedTokens);

  // Update document
  await integrationDoc.ref.update({
    encryptedTokens,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
  });

  console.log('✅ Box tokens migrated successfully');
  return { success: true };
}

async function migrateDropboxTokens(organizationId) {
  console.log(`\n📦 Migrating Dropbox tokens for org: ${organizationId}`);
  
  const integrationDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('cloudIntegrations')
    .doc('dropbox')
    .get();

  if (!integrationDoc.exists) {
    console.log('❌ Dropbox integration not found');
    return { success: false, error: 'Not found' };
  }

  const integrationData = integrationDoc.data();

  // Check if already migrated
  if (integrationData.encryptedTokens) {
    console.log('✅ Dropbox tokens already migrated');
    return { success: true, alreadyMigrated: true };
  }

  // Check for legacy tokens
  if (!integrationData.accessToken && !integrationData.refreshToken) {
    console.log('❌ No legacy tokens found');
    return { success: false, error: 'No tokens found' };
  }

  console.log('🔄 Migrating legacy tokens...');

  let accessToken, refreshToken;

  // Decrypt legacy format
  if (integrationData.accessToken) {
    try {
      if (integrationData.accessToken.includes(':')) {
        accessToken = decryptLegacyToken(integrationData.accessToken);
        console.log('✅ Decrypted accessToken');
      } else {
        accessToken = integrationData.accessToken;
      }
    } catch (error) {
      console.warn('⚠️ Failed to decrypt accessToken, using as-is');
      accessToken = integrationData.accessToken;
    }
  }

  if (integrationData.refreshToken) {
    try {
      if (integrationData.refreshToken.includes(':')) {
        refreshToken = decryptLegacyToken(integrationData.refreshToken);
        console.log('✅ Decrypted refreshToken');
      } else {
        refreshToken = integrationData.refreshToken;
      }
    } catch (error) {
      console.warn('⚠️ Failed to decrypt refreshToken, using as-is');
      refreshToken = integrationData.refreshToken;
    }
  }

  if (!accessToken && !refreshToken) {
    console.log('❌ No valid tokens found');
    return { success: false, error: 'No valid tokens' };
  }

  // Create tokens object
  const migratedTokens = {
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    expiresAt: integrationData?.tokenExpiresAt?.toDate?.() ||
               integrationData?.expiresAt?.toDate?.() ||
               null,
  };

  // Encrypt with new format
  const encryptedTokens = encryptTokens(migratedTokens);

  // Update document
  await integrationDoc.ref.update({
    encryptedTokens,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
  });

  console.log('✅ Dropbox tokens migrated successfully');
  return { success: true };
}

async function main() {
  const organizationId = process.argv[2] || 'big-tree-productions';
  
  console.log(`🚀 Starting token migration for: ${organizationId}`);
  
  try {
    const boxResult = await migrateBoxTokens(organizationId);
    const dropboxResult = await migrateDropboxTokens(organizationId);
    
    console.log('\n✅ Migration complete!');
    console.log(`Box: ${boxResult.success ? '✅' : '❌'}`);
    console.log(`Dropbox: ${dropboxResult.success ? '✅' : '❌'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { migrateBoxTokens, migrateDropboxTokens };

