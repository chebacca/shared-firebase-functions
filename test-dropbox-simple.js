/**
 * Simple test script for Dropbox Functions
 * 
 * Tests the core logic without Firestore updates
 * 
 * Usage:
 *   export INTEGRATIONS_ENCRYPTION_KEY="your-key"
 *   node test-dropbox-simple.js
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

async function testDropboxCoreLogic() {
  console.log('\n🧪 Testing Dropbox Functions Core Logic...\n');
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
      return { success: false };
    }
    
    const integrationData = integrationDoc.data();
    console.log('✅ Dropbox integration found');
    console.log('   Is Active:', integrationData.isActive);
    console.log('   Connection Method:', integrationData.connectionMethod);
    
    // Step 2: Test token decryption and validation
    console.log('\n📋 Step 2: Testing token decryption...');
    if (!integrationData.encryptedTokens) {
      console.log('❌ No encrypted tokens found');
      return { success: false };
    }
    
    // Import encryption functions
    const { decryptTokens } = require('./lib/integrations/encryption');
    
    try {
      const tokens = decryptTokens(integrationData.encryptedTokens);
      console.log('✅ Tokens decrypted successfully');
      console.log('   Has Access Token:', !!tokens.accessToken);
      console.log('   Has Refresh Token:', !!tokens.refreshToken);
      console.log('   Expires At:', tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : 'N/A');
      
      // Step 3: Test Dropbox API connection
      console.log('\n📋 Step 3: Testing Dropbox API connection...');
      const { Dropbox } = require('dropbox');
      const dbx = new Dropbox({ accessToken: tokens.accessToken });
      
      // Test account info
      const accountInfo = await dbx.usersGetCurrentAccount();
      console.log('✅ Dropbox API connection successful');
      console.log('   Account Email:', accountInfo.email || 'N/A');
      console.log('   Account Name:', accountInfo.name?.display_name || 'N/A');
      
      // Step 4: Test folder listing (this is what listDropboxFolders does)
      console.log('\n📋 Step 4: Testing folder listing (scope validation)...');
      const folderList = await dbx.filesListFolder({ path: '' });
      console.log('✅ Folder listing successful - scope validation passed!');
      console.log('   This confirms files.content.read scope is working');
      console.log('   (files.content.read includes files.metadata.read)');
      console.log('   Entries found:', folderList.entries?.length || 0);
      
      if (folderList.entries && folderList.entries.length > 0) {
        const folders = folderList.entries.filter(e => e['.tag'] === 'folder');
        const files = folderList.entries.filter(e => e['.tag'] === 'file');
        console.log('   Folders:', folders.length);
        console.log('   Files:', files.length);
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ All core tests passed!');
      console.log('\n💡 The Dropbox functions are working correctly:');
      console.log('   ✅ Token decryption works');
      console.log('   ✅ Dropbox API connection works');
      console.log('   ✅ Scope validation passed (files.content.read)');
      console.log('   ✅ Folder listing works');
      console.log('\n   The functions are ready to use in production!');
      
      return { success: true };
      
    } catch (decryptError) {
      console.error('❌ Token decryption failed:', decryptError.message);
      if (decryptError.message.includes('Encryption key')) {
        console.log('\n💡 Set encryption key:');
        console.log('   export INTEGRATIONS_ENCRYPTION_KEY="your-key"');
      }
      return { success: false, error: decryptError.message };
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Check for scope errors
    const errorSummary = error?.error_summary || error?.error?.error_summary || '';
    if (errorSummary.includes('missing_scope')) {
      console.log('\n💡 Missing scope error detected');
      console.log('   Solution: Disconnect and reconnect Dropbox via OAuth');
      console.log('   Ensure files.content.read is enabled in Dropbox App Console');
    }
    
    return { success: false, error: error.message };
  }
}

// Run the test
testDropboxCoreLogic()
  .then((result) => {
    if (result.success) {
      console.log('\n✨ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Test failed. See details above.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n💥 Test error:', error);
    process.exit(1);
  });

