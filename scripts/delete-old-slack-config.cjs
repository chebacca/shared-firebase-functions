/**
 * Delete Old Slack Integration Config
 * 
 * Removes the old 'slack-integration' document that has no credentials
 * Keeps only the org-specific one (slack-{organizationId})
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

async function deleteOldSlackConfig(organizationId = 'clip-show-pro-productions') {
  try {
    console.log(`\n🔍 Checking for old Slack config in organization: ${organizationId}\n`);
    
    // Check for the old 'slack-integration' document
    const oldSlackConfigRef = db.collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc('slack-integration');
    
    const oldSlackDoc = await oldSlackConfigRef.get();
    
    if (!oldSlackDoc.exists) {
      console.log('✅ No old "slack-integration" document found - nothing to delete');
      return;
    }
    
    const data = oldSlackDoc.data();
    console.log('📋 Old Slack config found:');
    console.log(`   ID: ${oldSlackDoc.id}`);
    console.log(`   Type: ${data.type || 'N/A'}`);
    console.log(`   Has Credentials: ${!!data.credentials}`);
    if (data.credentials) {
      console.log(`   Credential Keys: ${Object.keys(data.credentials).join(', ') || 'None'}`);
      console.log(`   Has Client Secret: ${!!data.credentials.clientSecret}`);
      console.log(`   Has Signing Secret: ${!!data.credentials.signingSecret}`);
    }
    
    // Check if the correct one exists
    const correctSlackConfigRef = db.collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc(`slack-${organizationId}`);
    
    const correctSlackDoc = await correctSlackConfigRef.get();
    
    if (correctSlackDoc.exists) {
      const correctData = correctSlackDoc.data();
      console.log(`\n✅ Correct Slack config found: slack-${organizationId}`);
      console.log(`   Has Client Secret: ${!!correctData.credentials?.clientSecret}`);
      console.log(`   Has Signing Secret: ${!!correctData.credentials?.signingSecret}`);
      
      // Delete the old one
      console.log('\n🗑️  Deleting old "slack-integration" document...');
      await oldSlackConfigRef.delete();
      console.log('✅ Old Slack config deleted successfully!');
    } else {
      console.log(`\n⚠️  Warning: Correct Slack config (slack-${organizationId}) not found!`);
      console.log('   Not deleting old config to avoid data loss.');
      console.log('   Please verify the correct config exists before deleting.');
    }
    
  } catch (error) {
    console.error('❌ Error deleting old Slack config:', error);
    throw error;
  }
}

// Run the deletion
const orgId = process.argv[2] || 'clip-show-pro-productions';
deleteOldSlackConfig(orgId)
  .then(() => {
    console.log('\n✅ Operation complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Operation failed:', error);
    process.exit(1);
  });







