/**
 * Test script to verify Google OAuth redirect URI for port 4001
 */

const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = getAuth();

async function testOAuthInitiation() {
  try {
    console.log('🧪 Testing Google OAuth initiation for port 4001...\n');

    // Get a test user (you can replace with actual user email)
    const testUserEmail = 'admin.clipshow@example.com';
    let testUser;
    
    try {
      testUser = await auth.getUserByEmail(testUserEmail);
      console.log(`✅ Found test user: ${testUser.email} (UID: ${testUser.uid})`);
    } catch (error) {
      console.error('❌ Error getting test user:', error.message);
      console.log('💡 Using a mock user ID for testing...');
      testUser = { uid: 'test-user-id', email: testUserEmail };
    }

    const organizationId = 'clip-show-pro-productions';
    const redirectUri = 'http://localhost:4001/integration-settings';

    console.log('\n📋 Test Parameters:');
    console.log(`   Organization ID: ${organizationId}`);
    console.log(`   Redirect URI: ${redirectUri}`);
    console.log(`   User ID: ${testUser.uid}`);
    console.log(`   User Email: ${testUser.email}`);

    // Get the OAuth config from Firestore
    console.log('\n🔍 Checking Firestore configuration...');
    const configDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('integrationSettings')
      .doc('google')
      .get();

    if (!configDoc.exists) {
      console.error('❌ integrationSettings/google document not found!');
      return;
    }

    const config = configDoc.data();
    console.log('✅ Found integrationSettings/google document:');
    console.log(`   Client ID: ${config.clientId?.substring(0, 30)}...`);
    console.log(`   Has Client Secret: ${!!config.clientSecret}`);
    console.log(`   Redirect URI in Firestore: ${config.redirectUri || 'NOT SET'}`);
    console.log(`   Is Configured: ${config.isConfigured || false}`);

    // Check what the function would use
    console.log('\n🔍 Analyzing redirect URI usage...');
    console.log(`   Request redirect URI: ${redirectUri}`);
    console.log(`   Firestore redirect URI: ${config.redirectUri || 'NOT SET'}`);
    
    if (config.redirectUri && config.redirectUri !== redirectUri) {
      console.warn(`   ⚠️  WARNING: Firestore redirect URI (${config.redirectUri}) differs from request (${redirectUri})`);
      console.warn(`   ⚠️  The function should use the request redirect URI, not Firestore`);
    } else {
      console.log(`   ✅ Redirect URIs match or function will use request URI`);
    }

    // Simulate what the function does
    console.log('\n🔍 Simulating function behavior...');
    const { google } = require('googleapis');
    
    // Decrypt client secret if needed
    let clientSecret = config.clientSecret;
    if (clientSecret && clientSecret.includes(':')) {
      // Encrypted format - would need decryption key
      console.log('   ⚠️  Client secret appears encrypted (contains ":")');
      console.log('   ⚠️  Cannot fully test without decryption key');
    }

    // Create OAuth2 client with the redirect URI from request
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      'MOCK_SECRET_FOR_TESTING', // Can't decrypt, but we can test URL generation
      redirectUri // Use the redirect URI from the request
    );

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      state: 'test-state-12345',
      prompt: 'consent'
    });

    // Parse the auth URL to see what redirect_uri is being sent
    const authUrlObj = new URL(authUrl);
    const redirectUriParam = authUrlObj.searchParams.get('redirect_uri');
    const decodedRedirectUri = redirectUriParam ? decodeURIComponent(redirectUriParam) : null;

    console.log('\n📊 Generated Authorization URL Analysis:');
    console.log(`   Full Auth URL: ${authUrl.substring(0, 100)}...`);
    console.log(`   Redirect URI in URL: ${decodedRedirectUri}`);
    console.log(`   Expected Redirect URI: ${redirectUri}`);
    console.log(`   Match: ${decodedRedirectUri === redirectUri ? '✅ YES' : '❌ NO'}`);

    if (decodedRedirectUri !== redirectUri) {
      console.error('\n❌ MISMATCH DETECTED!');
      console.error(`   Expected: ${redirectUri}`);
      console.error(`   Actual:   ${decodedRedirectUri}`);
      console.error('\n💡 This mismatch would cause the redirect_uri_mismatch error!');
      console.error('💡 Check:');
      console.error('   1. The OAuth2 client is created with the correct redirectUri');
      console.error('   2. The redirect URI is URL-encoded correctly');
      console.error('   3. No trailing slashes or extra characters');
    } else {
      console.log('\n✅ Redirect URI matches!');
      console.log('💡 If you\'re still getting redirect_uri_mismatch, verify:');
      console.log('   1. The redirect URI is EXACTLY in Google Cloud Console');
      console.log('   2. It\'s for the correct OAuth client ID');
      console.log('   3. You clicked SAVE in Google Cloud Console');
      console.log('   4. You waited 1-2 minutes for propagation');
    }

    // Check Google Cloud Console requirements
    console.log('\n📋 Google Cloud Console Checklist:');
    console.log(`   OAuth Client ID: ${config.clientId}`);
    console.log(`   Required Redirect URI: ${redirectUri}`);
    console.log(`   Verify at: https://console.cloud.google.com/apis/credentials?project=backbone-logic`);
    console.log(`   Look for client: ${config.clientId.substring(0, 20)}...`);

  } catch (error) {
    console.error('\n❌ Error during test:', error);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

testOAuthInitiation();

