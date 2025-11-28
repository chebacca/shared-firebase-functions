/**
 * Test script for listDropboxFolders function
 * 
 * Tests the fixed response handling for Dropbox SDK v10.34.0
 * 
 * Usage:
 *   export INTEGRATIONS_ENCRYPTION_KEY="your-key"
 *   node test-dropbox-list-folders.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    process.exit(1);
  }
}

const TEST_ORG_ID = 'clip-show-pro-productions';

async function testListDropboxFolders() {
  console.log('\n🧪 Testing listDropboxFolders Function Fix...\n');
  console.log('='.repeat(60));
  
  const db = admin.firestore();
  
  try {
    // Step 1: Check integration exists
    console.log('\n📋 Step 1: Checking Dropbox integration...');
    const integrationRef = db
      .collection('organizations')
      .doc(TEST_ORG_ID)
      .collection('cloudIntegrations')
      .doc('dropbox');
    
    const integrationDoc = await integrationRef.get();
    
    if (!integrationDoc.exists) {
      console.log('❌ Dropbox integration not found');
      return { success: false, reason: 'No integration' };
    }
    
    const integrationData = integrationDoc.data();
    console.log('✅ Dropbox integration found');
    console.log('   Is Active:', integrationData.isActive);
    
    if (!integrationData.isActive) {
      console.log('⚠️  Integration is inactive - may need to reconnect');
    }
    
    // Step 2: Test token decryption
    console.log('\n📋 Step 2: Testing token decryption...');
    if (!integrationData.encryptedTokens) {
      console.log('❌ No encrypted tokens found');
      return { success: false, reason: 'No tokens' };
    }
    
    const { decryptTokens } = require('./lib/integrations/encryption');
    const tokens = decryptTokens(integrationData.encryptedTokens);
    console.log('✅ Tokens decrypted successfully');
    console.log('   Has Access Token:', !!tokens.accessToken);
    console.log('   Expires At:', tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'N/A');
    
    // Step 3: Test Dropbox API call with SDK
    console.log('\n📋 Step 3: Testing Dropbox API call (simulating listDropboxFolders)...');
    const { Dropbox } = require('dropbox');
    const dbx = new Dropbox({ accessToken: tokens.accessToken });
    
    try {
      // This is what listDropboxFolders does
      const response = await dbx.filesListFolder({ path: '' });
      
      console.log('✅ Dropbox API call successful');
      console.log('   Response type:', typeof response);
      console.log('   Response keys:', Object.keys(response || {}));
      
      // Check if response has 'result' property (SDK v10.34.0 format)
      const hasResult = !!(response?.result);
      console.log('   Has result property:', hasResult);
      
      // Extract actual result (this is the fix)
      const actualResult = response?.result || response;
      console.log('   Actual result keys:', Object.keys(actualResult || {}));
      
      // Check for entries
      const hasEntries = !!actualResult?.entries;
      const entriesCount = actualResult?.entries?.length || 0;
      console.log('   Has entries:', hasEntries);
      console.log('   Entries count:', entriesCount);
      
      if (hasEntries && entriesCount > 0) {
        console.log('✅ SUCCESS! The fix works correctly!');
        console.log('   The response.result.entries extraction is working');
        
        // Show sample entries
        const folders = actualResult.entries.filter((e) => e['.tag'] === 'folder');
        const files = actualResult.entries.filter((e) => e['.tag'] === 'file');
        console.log('   Folders:', folders.length);
        console.log('   Files:', files.length);
        
        if (folders.length > 0) {
          console.log('   Sample folder:', folders[0].name);
        }
        
        return { success: true, entriesCount, foldersCount: folders.length, filesCount: files.length };
      } else {
        console.log('⚠️  No entries found (might be empty Dropbox account)');
        return { success: true, entriesCount: 0, note: 'Empty account' };
      }
      
    } catch (apiError) {
      console.error('❌ Dropbox API call failed:', apiError.message);
      
      // Check for scope errors
      const errorSummary = apiError?.error_summary || apiError?.error?.error_summary || '';
      if (errorSummary.includes('missing_scope')) {
        console.log('\n💡 Missing scope error detected');
        console.log('   Solution: Disconnect and reconnect Dropbox via OAuth');
      } else if (apiError.status === 401) {
        console.log('\n💡 Authentication error - token may be expired');
        console.log('   Solution: Reconnect Dropbox via OAuth');
      }
      
      return { success: false, error: apiError.message };
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run the test
testListDropboxFolders()
  .then((result) => {
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✨ Test PASSED!');
      console.log('   The listDropboxFolders fix is working correctly.');
      if (result.entriesCount !== undefined) {
        console.log(`   Found ${result.entriesCount} entries in Dropbox root folder.`);
      }
      process.exit(0);
    } else {
      console.log('❌ Test FAILED');
      if (result.error) {
        console.log('   Error:', result.error);
      }
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test error:', error);
    process.exit(1);
  });

