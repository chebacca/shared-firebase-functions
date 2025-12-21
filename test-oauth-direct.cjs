/**
 * Direct HTTP test of the deployed initiateGoogleOAuthHttp function
 * This will show us exactly what redirect URI is being sent to Google
 */

const https = require('https');

async function testOAuthFunction() {
  const functionUrl = 'https://us-central1-backbone-logic.cloudfunctions.net/initiateGoogleOAuthHttp';
  
  // You'll need to get a Firebase Auth token first
  // For now, let's just show what the function expects
  console.log('🧪 Testing Google OAuth Function\n');
  console.log('📋 Function URL:', functionUrl);
  console.log('\n📝 To test this function, you need:');
  console.log('   1. A valid Firebase Auth token (ID token)');
  console.log('   2. Organization ID: clip-show-pro-productions');
  console.log('   3. Redirect URI: http://localhost:4001/integration-settings');
  console.log('\n💡 The function will:');
  console.log('   - Log the exact redirect URI being used');
  console.log('   - Log the OAuth client ID being used');
  console.log('   - Generate an auth URL with the redirect URI');
  console.log('   - Return the auth URL in the response');
  console.log('\n🔍 Check Firebase Console logs:');
  console.log('   https://console.firebase.google.com/project/backbone-logic/functions/logs');
  console.log('   Filter by: initiateGoogleOAuthHttp');
  console.log('\n📊 Look for these log entries:');
  console.log('   - "[googleDrive] ✅ Using Firestore config for OAuth"');
  console.log('   - "[googleDrive] 📋 OAuth initiation request details"');
  console.log('   - "[googleDrive] ⚠️ CRITICAL DEBUG - Authorization URL generated"');
  console.log('\n🔍 The critical log will show:');
  console.log('   - redirectUriInAuthUrl: The exact URI sent to Google');
  console.log('   - storedRedirectUri: The URI from the request');
  console.log('   - clientId: The OAuth client ID being used');
  console.log('   - matches: Whether they match');
  console.log('\n✅ If redirectUriInAuthUrl is: http://localhost:4001/integration-settings');
  console.log('   Then verify this EXACT URI is in Google Cloud Console for client:');
  console.log('   749245129278-vnepq570jrh5ji94c9olshc282bj1l86.apps.googleusercontent.com');
}

testOAuthFunction();

