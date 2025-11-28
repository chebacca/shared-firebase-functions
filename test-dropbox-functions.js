/**
 * Test script for Dropbox Functions
 * 
 * Tests:
 * - refreshDropboxAccessToken (token refresh logic)
 * - listDropboxFolders (folder listing with proper error handling)
 * 
 * Usage:
 *   node test-dropbox-functions.js
 * 
 * Note: You need to be authenticated with Firebase CLI first:
 *   firebase login
 *   gcloud auth application-default login
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Initialize Firebase Admin (for testing)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.log('\n💡 Make sure you have Firebase credentials set up:');
    console.log('   firebase login');
    console.log('   gcloud auth application-default login');
    process.exit(1);
  }
}

// Load Firebase config for encryption key
try {
  const config = functions.config();
  if (config.integrations?.encryption_key) {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = config.integrations.encryption_key;
    console.log('✅ Encryption key loaded from Firebase config');
  } else {
    console.log('⚠️  Encryption key not found in Firebase config');
    console.log('   Trying environment variable...');
    if (!process.env.INTEGRATIONS_ENCRYPTION_KEY && !process.env.ENCRYPTION_KEY) {
      console.log('   💡 Set encryption key:');
      console.log('      firebase functions:config:set integrations.encryption_key="your-key"');
      console.log('   Or set environment variable:');
      console.log('      export INTEGRATIONS_ENCRYPTION_KEY="your-key"');
    }
  }
} catch (configError) {
  console.log('⚠️  Could not load Firebase config (this is OK for local testing)');
  console.log('   Using environment variables if available...');
}

// Import the compiled functions
const { refreshDropboxAccessToken } = require('./lib/dropbox');
const { listDropboxFolders } = require('./lib/dropbox');

// Test configuration
const TEST_ORG_ID = 'clip-show-pro-productions'; // Update with your test org ID
const TEST_USER_ID = 'test-user-id'; // This will be replaced with actual user ID from Firestore

async function testDropboxIntegration() {
  console.log('\n🧪 Testing Dropbox Functions...\n');
  console.log('='.repeat(60));
  
  const db = admin.firestore();
  
  try {
    // Step 1: Check if Dropbox integration exists
    console.log('\n📋 Step 1: Checking Dropbox integration...');
    const integrationRef = db
      .collection('organizations')
      .doc(TEST_ORG_ID)
      .collection('cloudIntegrations')
      .doc('dropbox');
    
    const integrationDoc = await integrationRef.get();
    
    if (!integrationDoc.exists) {
      console.log('❌ Dropbox integration not found for org:', TEST_ORG_ID);
      console.log('   Please connect Dropbox first via OAuth in Integration Settings');
      console.log('   This test requires an active Dropbox connection.');
      return { success: false, reason: 'No integration found' };
    }
    
    const integrationData = integrationDoc.data();
    console.log('✅ Dropbox integration found');
    console.log('   Account Email:', integrationData.accountEmail || '(empty)');
    console.log('   Account Name:', integrationData.accountName || '(empty)');
    console.log('   Connection Method:', integrationData.connectionMethod || 'unknown');
    console.log('   Is Active:', integrationData.isActive);
    console.log('   Has Encrypted Tokens:', !!integrationData.encryptedTokens);
    
    if (!integrationData.isActive) {
      console.log('⚠️  Integration is marked as inactive');
      console.log('   This might indicate a scope issue or expired token');
    }
    
    // Step 2: Get a real user ID from the organization
    console.log('\n📋 Step 2: Finding test user...');
    const usersSnapshot = await db
      .collection('users')
      .where('organizationId', '==', TEST_ORG_ID)
      .limit(1)
      .get();
    
    let actualUserId = TEST_USER_ID;
    if (!usersSnapshot.empty) {
      actualUserId = usersSnapshot.docs[0].id;
      console.log('✅ Found user:', actualUserId);
    } else {
      console.log('⚠️  No users found in org, using test user ID');
    }
    
    // Step 3: Test refreshDropboxAccessToken
    console.log('\n📋 Step 3: Testing refreshDropboxAccessToken...');
    try {
      const tokens = await refreshDropboxAccessToken(actualUserId, TEST_ORG_ID);
      console.log('✅ Token refresh successful');
      console.log('   Has Access Token:', !!tokens.accessToken);
      console.log('   Has Refresh Token:', !!tokens.refreshToken);
      console.log('   Expires At:', tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'N/A');
      
      // Verify token format
      if (tokens.accessToken) {
        const tokenPrefix = tokens.accessToken.substring(0, 10);
        console.log('   Token Prefix:', tokenPrefix + '...');
        console.log('   Token Length:', tokens.accessToken.length);
      }
    } catch (tokenError) {
      console.error('❌ Token refresh failed:', tokenError.message);
      
      // Check if it's a scope error
      if (tokenError.message.includes('missing required permissions') || 
          tokenError.message.includes('missing_scope')) {
        console.log('\n💡 This is a scope error. The token may be missing files.content.read scope.');
        console.log('   Solution: Disconnect and reconnect Dropbox via OAuth in Integration Settings');
      } else if (tokenError.message.includes('No refresh token')) {
        console.log('\n💡 No refresh token available. Reconnect Dropbox via OAuth.');
      } else {
        console.log('\n💡 Error details:', tokenError.stack);
      }
      
      return { success: false, reason: 'Token refresh failed', error: tokenError.message };
    }
    
    // Step 4: Test listDropboxFolders (simulated callable function)
    console.log('\n📋 Step 4: Testing listDropboxFolders logic...');
    try {
      // We can't directly call the onCall function, but we can test the core logic
      // by checking if we can get tokens and make a Dropbox API call
      const tokens = await refreshDropboxAccessToken(actualUserId, TEST_ORG_ID);
      
      if (!tokens || !tokens.accessToken) {
        throw new Error('No access token available');
      }
      
      // Test Dropbox API call directly
      const { Dropbox } = require('dropbox');
      const dbx = new Dropbox({ accessToken: tokens.accessToken });
      
      console.log('   Testing Dropbox API connection...');
      const accountInfo = await dbx.usersGetCurrentAccount();
      console.log('✅ Dropbox API connection successful');
      console.log('   Account Email:', accountInfo.email || 'N/A');
      console.log('   Account Name:', accountInfo.name?.display_name || 'N/A');
      
      // Test folder listing (this is what listDropboxFolders does)
      console.log('   Testing folder listing (root folder)...');
      const folderList = await dbx.filesListFolder({ path: '' });
      console.log('✅ Folder listing successful');
      console.log('   Entries found:', folderList.entries?.length || 0);
      console.log('   Has More:', folderList.has_more || false);
      
      if (folderList.entries && folderList.entries.length > 0) {
        const folders = folderList.entries.filter(e => e['.tag'] === 'folder');
        const files = folderList.entries.filter(e => e['.tag'] === 'file');
        console.log('   Folders:', folders.length);
        console.log('   Files:', files.length);
        
        if (folders.length > 0) {
          console.log('   Sample folder:', folders[0].name);
        }
      }
      
    } catch (listError) {
      console.error('❌ Folder listing failed:', listError.message);
      
      // Check error type
      const errorSummary = listError?.error_summary || listError?.error?.error_summary || '';
      const errorTag = listError?.error?.['.tag'] || listError?.['.tag'] || '';
      
      if (errorSummary.includes('missing_scope') || errorTag === 'missing_scope') {
        const missingScope = listError?.error?.required_scope || listError?.error?.scope || 'unknown';
        console.log('\n💡 Missing scope error detected');
        console.log('   Missing Scope:', missingScope);
        console.log('   Solution: Disconnect and reconnect Dropbox via OAuth');
        console.log('   Ensure files.content.read is enabled in Dropbox App Console');
      } else if (listError.status === 401 || listError.statusCode === 401) {
        console.log('\n💡 Authentication error - token may be expired or invalid');
        console.log('   Solution: Reconnect Dropbox via OAuth');
      } else {
        console.log('\n💡 Error details:', listError.stack);
      }
      
      return { success: false, reason: 'Folder listing failed', error: listError.message };
    }
    
    // Step 5: Verify OAuth scope configuration
    console.log('\n📋 Step 5: Verifying OAuth configuration...');
    const configRef = db
      .collection('organizations')
      .doc(TEST_ORG_ID)
      .collection('cloudIntegrations')
      .doc('dropbox');
    
    const configDoc = await configRef.get();
    if (configDoc.exists) {
      const config = configDoc.data();
      console.log('✅ OAuth configuration found');
      console.log('   Has App Key:', !!config.settings?.appKey);
      console.log('   Has App Secret:', !!config.settings?.appSecret);
      console.log('   Redirect URI:', config.settings?.redirectUri || 'N/A');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('\n💡 The Dropbox functions are working correctly.');
    console.log('   You can now use Dropbox integration in the UI.');
    
    return { success: true };
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
    return { success: false, reason: 'Test execution failed', error: error.message };
  }
}

// Run the test
testDropboxIntegration()
  .then((result) => {
    if (result.success) {
      console.log('\n✨ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. See details above.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test error:', error);
    process.exit(1);
  });

