/**
 * Check Slack Credentials in Firestore
 * 
 * Verifies if Slack clientSecret and signingSecret are saved in integrationConfigs
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

async function checkSlackCredentials(organizationId = 'clip-show-pro-productions') {
  try {
    console.log(`\n🔍 Checking Slack credentials for organization: ${organizationId}\n`);
    
    // Check integrationConfigs collection
    const slackConfigRef = db.collection('organizations')
      .doc(organizationId)
      .collection('integrationConfigs')
      .doc(`slack-${organizationId}`);
    
    const slackConfigDoc = await slackConfigRef.get();
    
    if (!slackConfigDoc.exists) {
      console.log('❌ Slack integration config document does not exist');
      console.log(`   Path: organizations/${organizationId}/integrationConfigs/slack-${organizationId}`);
      return;
    }
    
    const data = slackConfigDoc.data();
    console.log('✅ Slack integration config found!\n');
    console.log('📋 Document Data:');
    console.log(`   ID: ${data.id || slackConfigDoc.id}`);
    console.log(`   Name: ${data.name || 'N/A'}`);
    console.log(`   Type: ${data.type || 'N/A'}`);
    console.log(`   Enabled: ${data.enabled !== undefined ? data.enabled : 'N/A'}`);
    console.log(`   Updated At: ${data.updatedAt ? data.updatedAt.toDate().toISOString() : 'N/A'}`);
    
    console.log('\n🔐 Credentials:');
    if (data.credentials) {
      console.log(`   App ID: ${data.credentials.appId || 'NOT SET'}`);
      console.log(`   Client ID: ${data.credentials.clientId || 'NOT SET'}`);
      console.log(`   Client Secret: ${data.credentials.clientSecret ? `SET (${data.credentials.clientSecret.length} chars)` : 'NOT SET'}`);
      console.log(`   Signing Secret: ${data.credentials.signingSecret ? `SET (${data.credentials.signingSecret.length} chars)` : 'NOT SET'}`);
      
      // Show first/last few characters if present (for verification, not full secret)
      if (data.credentials.clientSecret) {
        const secret = data.credentials.clientSecret;
        const preview = secret.length > 10 
          ? `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`
          : secret.substring(0, 4) + '...';
        console.log(`   Client Secret Preview: ${preview}`);
      }
      
      if (data.credentials.signingSecret) {
        const secret = data.credentials.signingSecret;
        const preview = secret.length > 10 
          ? `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`
          : secret.substring(0, 4) + '...';
        console.log(`   Signing Secret Preview: ${preview}`);
      }
      
      // List all credential keys
      console.log(`   All Credential Keys: ${Object.keys(data.credentials).join(', ')}`);
    } else {
      console.log('   ❌ No credentials object found');
    }
    
    console.log('\n⚙️  Settings:');
    if (data.settings) {
      console.log(`   Settings Keys: ${Object.keys(data.settings).join(', ') || 'None'}`);
      if (Object.keys(data.settings).length > 0) {
        console.log(`   Settings: ${JSON.stringify(data.settings, null, 2)}`);
      }
    } else {
      console.log('   No settings object found');
    }
    
    // Summary
    console.log('\n📊 Summary:');
    const hasClientSecret = !!(data.credentials?.clientSecret);
    const hasSigningSecret = !!(data.credentials?.signingSecret);
    const clientSecretLength = data.credentials?.clientSecret?.length || 0;
    const signingSecretLength = data.credentials?.signingSecret?.length || 0;
    
    console.log(`   Client Secret: ${hasClientSecret ? '✅ SAVED' : '❌ MISSING'} (${clientSecretLength} chars)`);
    console.log(`   Signing Secret: ${hasSigningSecret ? '✅ SAVED' : '❌ MISSING'} (${signingSecretLength} chars)`);
    
    if (hasClientSecret && hasSigningSecret) {
      console.log('\n✅ Both secrets are saved in Firestore!');
      console.log('   The issue is likely in the UI reading logic.');
    } else {
      console.log('\n❌ Secrets are NOT saved in Firestore.');
      console.log('   The save operation may not be working correctly.');
    }
    
  } catch (error) {
    console.error('❌ Error checking Slack credentials:', error);
    throw error;
  }
}

// Run the check
const orgId = process.argv[2] || 'clip-show-pro-productions';
checkSlackCredentials(orgId)
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

