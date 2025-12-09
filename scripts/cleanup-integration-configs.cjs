/**
 * Cleanup Integration Configs
 * 
 * Ensures there's only one integration config per type per organization
 * Removes duplicates and ensures all configs are tied to the correct orgId
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
    console.error('  2. Place serviceAccountKey.json in shared-firebase-functions directory');
    console.error('  3. Run: firebase login:ci (for Firebase CLI authentication)');
    process.exit(1);
  }
}

const db = admin.firestore();

// Expected ID patterns for each integration type
const expectedIdPatterns = {
  'slack': (orgId) => `slack-${orgId}`,
  'google_docs': (orgId) => `google-docs-integration`,
  'google_drive': (orgId) => `google-drive-integration`,
  'box': (orgId) => `box-integration`,
  'dropbox': (orgId) => `dropbox-integration`,
  'airtable': (orgId) => `airtable-integration`,
  'email': (orgId) => `email-integration`
};

async function cleanupIntegrationConfigs(organizationId = null, dryRun = true) {
  try {
    const orgsToProcess = organizationId ? [organizationId] : [];
    
    // If no org specified, get all organizations
    if (!organizationId) {
      console.log('🔍 Finding all organizations...\n');
      const orgsSnapshot = await db.collection('organizations').get();
      orgsSnapshot.forEach(doc => {
        orgsToProcess.push(doc.id);
      });
      console.log(`✅ Found ${orgsToProcess.length} organization(s)\n`);
    }
    
    let totalDeleted = 0;
    let totalFixed = 0;
    
    for (const orgId of orgsToProcess) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📋 Processing organization: ${orgId}`);
      console.log(`${'='.repeat(60)}\n`);
      
      const configsRef = db.collection('organizations')
        .doc(orgId)
        .collection('integrationConfigs');
      
      const snapshot = await configsRef.get();
      
      if (snapshot.empty) {
        console.log('   No integration configs found\n');
        continue;
      }
      
      // Group configs by type
      const configsByType = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        const type = data.type || 'unknown';
        if (!configsByType[type]) {
          configsByType[type] = [];
        }
        configsByType[type].push({
          id: doc.id,
          data: data
        });
      });
      
      console.log(`   Found ${snapshot.size} integration config(s) across ${Object.keys(configsByType).length} type(s)\n`);
      
      // Process each type
      for (const [type, configs] of Object.entries(configsByType)) {
        console.log(`   📦 Type: ${type} (${configs.length} config(s))`);
        
        if (configs.length === 0) continue;
        
        // Determine the correct ID for this type
        const expectedId = expectedIdPatterns[type] ? expectedIdPatterns[type](orgId) : `${type}-${orgId}`;
        
        // Find the correct config (the one with the expected ID)
        const correctConfig = configs.find(c => c.id === expectedId);
        const incorrectConfigs = configs.filter(c => c.id !== expectedId);
        
        if (correctConfig) {
          console.log(`      ✅ Correct config found: ${correctConfig.id}`);
          
          // Check if organizationId field is correct
          if (correctConfig.data.organizationId !== orgId) {
            console.log(`      ⚠️  organizationId mismatch: ${correctConfig.data.organizationId} (should be ${orgId})`);
            if (!dryRun) {
              await configsRef.doc(correctConfig.id).update({
                organizationId: orgId
              });
              console.log(`      ✅ Fixed organizationId`);
              totalFixed++;
            }
          }
          
          // Delete incorrect duplicates
          if (incorrectConfigs.length > 0) {
            console.log(`      🗑️  Found ${incorrectConfigs.length} duplicate(s) to remove:`);
            for (const incorrect of incorrectConfigs) {
              console.log(`         - ${incorrect.id} (${incorrect.data.organizationId || 'no orgId'})`);
              if (!dryRun) {
                await configsRef.doc(incorrect.id).delete();
                console.log(`         ✅ Deleted`);
                totalDeleted++;
              }
            }
          }
        } else {
          // No correct config found - keep the one with the most data or credentials
          console.log(`      ⚠️  No config with expected ID (${expectedId})`);
          
          // Find the best one (has credentials or most recent)
          const bestConfig = configs.reduce((best, current) => {
            const bestHasCreds = best.data.credentials && Object.keys(best.data.credentials).length > 0;
            const currentHasCreds = current.data.credentials && Object.keys(current.data.credentials).length > 0;
            
            if (currentHasCreds && !bestHasCreds) return current;
            if (bestHasCreds && !currentHasCreds) return best;
            
            // Both have or don't have creds - use most recent
            const bestUpdated = best.data.updatedAt?.toMillis?.() || 0;
            const currentUpdated = current.data.updatedAt?.toMillis?.() || 0;
            return currentUpdated > bestUpdated ? current : best;
          });
          
          console.log(`      ✅ Keeping best config: ${bestConfig.id}`);
          
          // Update organizationId if needed
          if (bestConfig.data.organizationId !== orgId) {
            console.log(`      ⚠️  organizationId mismatch: ${bestConfig.data.organizationId} (should be ${orgId})`);
            if (!dryRun) {
              await configsRef.doc(bestConfig.id).update({
                organizationId: orgId
              });
              console.log(`      ✅ Fixed organizationId`);
              totalFixed++;
            }
          }
          
          // Delete the rest (duplicates)
          const others = configs.filter(c => c.id !== bestConfig.id);
          if (others.length > 0) {
            console.log(`      🗑️  Found ${others.length} duplicate(s) to remove:`);
            for (const other of others) {
              console.log(`         - ${other.id} (${other.data.organizationId || 'no orgId'})`);
              if (!dryRun) {
                await configsRef.doc(other.id).delete();
                console.log(`         ✅ Deleted`);
                totalDeleted++;
              }
            }
          }
          
          // Note: We're keeping the existing ID even if it doesn't match the expected pattern
          // This is safer than renaming, which can cause serialization issues
          console.log(`      ⚠️  Note: Config ID is "${bestConfig.id}" (expected "${expectedId}")`);
          console.log(`      ⚠️  Consider manually renaming in the UI if needed`);
        }
        console.log('');
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Summary:');
    console.log(`   Configs Fixed: ${totalFixed}`);
    console.log(`   Configs Deleted: ${totalDeleted}`);
    console.log(`${'='.repeat(60)}\n`);
    
    if (dryRun) {
      console.log('⚠️  This was a DRY RUN - no changes were made');
      console.log('   Run with --execute to apply changes\n');
    } else {
      console.log('✅ Cleanup complete!\n');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const orgId = args.find(arg => !arg.startsWith('--')) || null;
const dryRun = !args.includes('--execute');

if (dryRun) {
  console.log('⚠️  DRY RUN MODE - No changes will be made\n');
}

// Run the cleanup
cleanupIntegrationConfigs(orgId, dryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });

