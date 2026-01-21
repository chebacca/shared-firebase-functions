/**
 * Migration Script: Consolidate Integration Connections to cloudIntegrations
 * 
 * This script migrates Google and Dropbox connections from legacy locations
 * to the single source of truth: cloudIntegrations/{provider}
 * 
 * Usage:
 *   node scripts/migrate-integrations-to-cloudintegrations.cjs [orgId]
 * 
 * If orgId is not provided, migrates all organizations
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require(path.join(__dirname, '../../..', 'serviceAccountKey.json'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function migrateGoogleIntegration(orgId) {
  console.log(`\n🔍 [Migration] Checking Google integration for org: ${orgId}`);
  
  const cloudIntegrationsRef = db.collection('organizations').doc(orgId).collection('cloudIntegrations').doc('google');
  const cloudIntegrationsDoc = await cloudIntegrationsRef.get();
  
  // Check legacy locations
  const legacyLocations = [
    { path: 'googleConnections', name: 'googleConnections collection' },
    { path: 'integrationConfigs/google-drive-integration', name: 'integrationConfigs/google-drive-integration' }
  ];
  
  let migrated = false;
  
  for (const legacy of legacyLocations) {
    try {
      if (legacy.path.includes('/')) {
        // Document path
        const [collection, docId] = legacy.path.split('/');
        const legacyRef = db.collection('organizations').doc(orgId).collection(collection).doc(docId);
        const legacyDoc = await legacyRef.get();
        
        if (legacyDoc.exists) {
          const legacyData = legacyDoc.data();
          
          // Check if it has connection data (tokens, account info)
          if (legacyData.accessToken || legacyData.encryptedTokens || legacyData.accountEmail) {
            console.log(`  📦 Found Google connection in ${legacy.name}`);
            
            if (!cloudIntegrationsDoc.exists) {
              // Migrate to cloudIntegrations
              const migrationData = {
                provider: 'google',
                accountEmail: legacyData.accountEmail || legacyData.email,
                accountName: legacyData.accountName || legacyData.name,
                accountId: legacyData.accountId || legacyData.id,
                accessToken: legacyData.accessToken,
                refreshToken: legacyData.refreshToken,
                encryptedTokens: legacyData.encryptedTokens,
                tokenExpiresAt: legacyData.tokenExpiresAt || legacyData.expiresAt,
                scopes: legacyData.scopes,
                isActive: legacyData.isActive !== false,
                connectedAt: legacyData.connectedAt || admin.firestore.FieldValue.serverTimestamp(),
                connectedBy: legacyData.connectedBy || legacyData.userId,
                organizationId: orgId,
                lastRefreshedAt: legacyData.lastRefreshedAt || admin.firestore.FieldValue.serverTimestamp(),
                migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                migratedFrom: legacy.name
              };
              
              await cloudIntegrationsRef.set(migrationData);
              console.log(`  ✅ Migrated Google connection from ${legacy.name} to cloudIntegrations/google`);
              migrated = true;
            } else {
              console.log(`  ⏭️  cloudIntegrations/google already exists, skipping migration from ${legacy.name}`);
            }
          }
        }
      } else {
        // Collection path - check all documents
        const legacyRef = db.collection('organizations').doc(orgId).collection(legacy.path);
        const legacySnapshot = await legacyRef.get();
        
        if (!legacySnapshot.empty) {
          console.log(`  📦 Found ${legacySnapshot.size} Google connection(s) in ${legacy.name}`);
          
          // Use the first active connection
          const activeConnections = legacySnapshot.docs.filter(doc => {
            const data = doc.data();
            return data.isActive !== false && (data.accessToken || data.encryptedTokens);
          });
          
          if (activeConnections.length > 0 && !cloudIntegrationsDoc.exists) {
            const legacyData = activeConnections[0].data();
            
            const migrationData = {
              provider: 'google',
              accountEmail: legacyData.accountEmail || legacyData.email,
              accountName: legacyData.accountName || legacyData.name,
              accountId: legacyData.accountId || legacyData.id,
              accessToken: legacyData.accessToken,
              refreshToken: legacyData.refreshToken,
              encryptedTokens: legacyData.encryptedTokens,
              tokenExpiresAt: legacyData.tokenExpiresAt || legacyData.expiresAt,
              scopes: legacyData.scopes,
              isActive: true,
              connectedAt: legacyData.connectedAt || admin.firestore.FieldValue.serverTimestamp(),
              connectedBy: legacyData.connectedBy || legacyData.userId,
              organizationId: orgId,
              lastRefreshedAt: legacyData.lastRefreshedAt || admin.firestore.FieldValue.serverTimestamp(),
              migratedAt: admin.firestore.FieldValue.serverTimestamp(),
              migratedFrom: `${legacy.name}/${activeConnections[0].id}`
            };
            
            await cloudIntegrationsRef.set(migrationData);
            console.log(`  ✅ Migrated Google connection from ${legacy.name} to cloudIntegrations/google`);
            migrated = true;
          }
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Error checking ${legacy.name}:`, error.message);
    }
  }
  
  if (cloudIntegrationsDoc.exists && !migrated) {
    console.log(`  ✅ Google connection already in cloudIntegrations/google`);
  }
  
  return migrated;
}

async function migrateDropboxIntegration(orgId) {
  console.log(`\n🔍 [Migration] Checking Dropbox integration for org: ${orgId}`);
  
  const cloudIntegrationsRef = db.collection('organizations').doc(orgId).collection('cloudIntegrations').doc('dropbox');
  const cloudIntegrationsDoc = await cloudIntegrationsRef.get();
  
  // Check legacy locations
  const legacyLocations = [
    { path: 'dropboxConnections', name: 'dropboxConnections collection' },
    { path: 'integrationConfigs/dropbox-integration', name: 'integrationConfigs/dropbox-integration' }
  ];
  
  let migrated = false;
  
  for (const legacy of legacyLocations) {
    try {
      if (legacy.path.includes('/')) {
        // Document path
        const [collection, docId] = legacy.path.split('/');
        const legacyRef = db.collection('organizations').doc(orgId).collection(collection).doc(docId);
        const legacyDoc = await legacyRef.get();
        
        if (legacyDoc.exists) {
          const legacyData = legacyDoc.data();
          
          // Check if it has connection data (tokens, account info)
          if (legacyData.accessToken || legacyData.encryptedTokens || legacyData.accountEmail) {
            console.log(`  📦 Found Dropbox connection in ${legacy.name}`);
            
            if (!cloudIntegrationsDoc.exists) {
              // Migrate to cloudIntegrations
              const migrationData = {
                provider: 'dropbox',
                accountEmail: legacyData.accountEmail || legacyData.email,
                accountName: legacyData.accountName || legacyData.name,
                accountId: legacyData.accountId || legacyData.id,
                accessToken: legacyData.accessToken,
                refreshToken: legacyData.refreshToken,
                encryptedTokens: legacyData.encryptedTokens,
                tokenExpiresAt: legacyData.tokenExpiresAt || legacyData.expiresAt,
                scopes: legacyData.scopes,
                isActive: legacyData.isActive !== false,
                connectedAt: legacyData.connectedAt || admin.firestore.FieldValue.serverTimestamp(),
                connectedBy: legacyData.connectedBy || legacyData.userId,
                organizationId: orgId,
                lastRefreshedAt: legacyData.lastRefreshedAt || admin.firestore.FieldValue.serverTimestamp(),
                migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                migratedFrom: legacy.name
              };
              
              await cloudIntegrationsRef.set(migrationData);
              console.log(`  ✅ Migrated Dropbox connection from ${legacy.name} to cloudIntegrations/dropbox`);
              migrated = true;
            } else {
              console.log(`  ⏭️  cloudIntegrations/dropbox already exists, skipping migration from ${legacy.name}`);
            }
          }
        }
      } else {
        // Collection path - check all documents
        const legacyRef = db.collection('organizations').doc(orgId).collection(legacy.path);
        const legacySnapshot = await legacyRef.get();
        
        if (!legacySnapshot.empty) {
          console.log(`  📦 Found ${legacySnapshot.size} Dropbox connection(s) in ${legacy.name}`);
          
          // Use the first active connection
          const activeConnections = legacySnapshot.docs.filter(doc => {
            const data = doc.data();
            return data.isActive !== false && (data.accessToken || data.encryptedTokens);
          });
          
          if (activeConnections.length > 0 && !cloudIntegrationsDoc.exists) {
            const legacyData = activeConnections[0].data();
            
            const migrationData = {
              provider: 'dropbox',
              accountEmail: legacyData.accountEmail || legacyData.email,
              accountName: legacyData.accountName || legacyData.name,
              accountId: legacyData.accountId || legacyData.id,
              accessToken: legacyData.accessToken,
              refreshToken: legacyData.refreshToken,
              encryptedTokens: legacyData.encryptedTokens,
              tokenExpiresAt: legacyData.tokenExpiresAt || legacyData.expiresAt,
              scopes: legacyData.scopes,
              isActive: true,
              connectedAt: legacyData.connectedAt || admin.firestore.FieldValue.serverTimestamp(),
              connectedBy: legacyData.connectedBy || legacyData.userId,
              organizationId: orgId,
              lastRefreshedAt: legacyData.lastRefreshedAt || admin.firestore.FieldValue.serverTimestamp(),
              migratedAt: admin.firestore.FieldValue.serverTimestamp(),
              migratedFrom: `${legacy.name}/${activeConnections[0].id}`
            };
            
            await cloudIntegrationsRef.set(migrationData);
            console.log(`  ✅ Migrated Dropbox connection from ${legacy.name} to cloudIntegrations/dropbox`);
            migrated = true;
          }
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Error checking ${legacy.name}:`, error.message);
    }
  }
  
  if (cloudIntegrationsDoc.exists && !migrated) {
    console.log(`  ✅ Dropbox connection already in cloudIntegrations/dropbox`);
  }
  
  return migrated;
}

async function main() {
  const orgId = process.argv[2];
  
  console.log('🚀 Starting integration migration to cloudIntegrations...');
  console.log(`📋 Target organization: ${orgId || 'ALL'}`);
  
  try {
    if (orgId) {
      // Migrate specific organization
      await migrateGoogleIntegration(orgId);
      await migrateDropboxIntegration(orgId);
      console.log(`\n✅ Migration complete for organization: ${orgId}`);
    } else {
      // Migrate all organizations
      const orgsSnapshot = await db.collection('organizations').get();
      console.log(`\n📊 Found ${orgsSnapshot.size} organizations to check`);
      
      let migratedCount = 0;
      
      for (const orgDoc of orgsSnapshot.docs) {
        const orgId = orgDoc.id;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing organization: ${orgId}`);
        
        const googleMigrated = await migrateGoogleIntegration(orgId);
        const dropboxMigrated = await migrateDropboxIntegration(orgId);
        
        if (googleMigrated || dropboxMigrated) {
          migratedCount++;
        }
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ Migration complete!`);
      console.log(`📊 Organizations with migrations: ${migratedCount}/${orgsSnapshot.size}`);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
