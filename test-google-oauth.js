/**
 * Simple test script to verify Google OAuth function configuration
 * Note: This doesn't actually call the function (requires auth), but verifies config
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    console.log('Firebase Admin already initialized or error:', e.message);
  }
}

// Get Firebase Functions config
const functions = require('firebase-functions');
const config = functions.config();

console.log('🔍 Testing Google OAuth Function Configuration\n');
console.log('='.repeat(60));

// Check Google config
const googleConfig = config.google;
if (googleConfig) {
  console.log('✅ Google OAuth Config Found:');
  console.log(`   Client ID: ${googleConfig.client_id?.substring(0, 30)}...`);
  console.log(`   Client Secret: ${googleConfig.client_secret ? 'GOCSPX-' + googleConfig.client_secret.substring(7, 11) + '...' : 'NOT SET'}`);
  console.log(`   Redirect URI: ${googleConfig.redirect_uri || 'NOT SET'}`);
  
  // Verify required fields
  const hasClientId = !!googleConfig.client_id;
  const hasClientSecret = !!googleConfig.client_secret;
  const clientSecretFormat = googleConfig.client_secret?.startsWith('GOCSPX-');
  
  console.log('\n📋 Configuration Status:');
  console.log(`   Client ID: ${hasClientId ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Client Secret: ${hasClientSecret ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Secret Format: ${clientSecretFormat ? '✅ Valid (GOCSPX-...)' : '⚠️  Unexpected format'}`);
  
  if (hasClientId && hasClientSecret && clientSecretFormat) {
    console.log('\n✅ Configuration looks good! Function should work.');
  } else {
    console.log('\n❌ Configuration incomplete. Please check Firebase Functions config.');
  }
} else {
  console.log('❌ Google OAuth config not found in Firebase Functions config');
  console.log('   Run: firebase functions:config:set google.client_id="..." google.client_secret="..." --project backbone-logic');
}

console.log('\n' + '='.repeat(60));
console.log('\n📝 To actually test the function:');
console.log('   1. Start the dev server: ./scripts/clipshow/dev-start.sh');
console.log('   2. Navigate to: http://localhost:4010/integration-settings');
console.log('   3. Click "Connect" on Google Drive integration');
console.log('   4. Complete the OAuth flow');
console.log('\n📊 Check logs:');
console.log('   firebase functions:log --only handleGoogleOAuthCallback --project backbone-logic');

