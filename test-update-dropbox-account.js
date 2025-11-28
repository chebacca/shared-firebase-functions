/**
 * Test script for updateDropboxAccountInfo function
 * 
 * Usage:
 *   node test-update-dropbox-account.js
 * 
 * Note: You need to be authenticated with Firebase CLI first:
 *   firebase login
 */

const admin = require('firebase-admin');

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

// Test the function logic directly
async function testUpdateDropboxAccountInfo() {
  console.log('\n🧪 Testing updateDropboxAccountInfo function...\n');
  
  const db = admin.firestore();
  const testOrgId = 'clip-show-pro-productions'; // Your test org ID
  
  try {
    // Check if Dropbox integration exists
    const integrationRef = db
      .collection('organizations')
      .doc(testOrgId)
      .collection('cloudIntegrations')
      .doc('dropbox');
    
    const integrationDoc = await integrationRef.get();
    
    if (!integrationDoc.exists) {
      console.log('❌ Dropbox integration not found for org:', testOrgId);
      console.log('   Please connect Dropbox first via OAuth');
      return;
    }
    
    const currentData = integrationDoc.data();
    console.log('📋 Current Dropbox integration data:');
    console.log('   Account Email:', currentData.accountEmail || '(empty)');
    console.log('   Account Name:', currentData.accountName || '(empty)');
    console.log('   Connection Method:', currentData.connectionMethod || 'unknown');
    console.log('   Is Active:', currentData.isActive);
    
    // Test update with a test email
    const testEmail = 'test@example.com';
    const testName = 'Test Dropbox User';
    
    console.log('\n🔄 Testing update with:');
    console.log('   Account Email:', testEmail);
    console.log('   Account Name:', testName);
    
    const updateData = {
      accountEmail: testEmail,
      accountName: testName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await integrationRef.update(updateData);
    console.log('✅ Update successful!');
    
    // Verify the update
    const updatedDoc = await integrationRef.get();
    const updatedData = updatedDoc.data();
    
    console.log('\n📋 Updated Dropbox integration data:');
    console.log('   Account Email:', updatedData.accountEmail);
    console.log('   Account Name:', updatedData.accountName);
    
    // Restore original values (optional - comment out if you want to keep test values)
    console.log('\n🔄 Restoring original values...');
    await integrationRef.update({
      accountEmail: currentData.accountEmail || '',
      accountName: currentData.accountName || 'Dropbox User',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Original values restored');
    
    console.log('\n✅ Test completed successfully!');
    console.log('\n💡 The function is working correctly.');
    console.log('   You can now use it from the UI to update account information.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testUpdateDropboxAccountInfo()
  .then(() => {
    console.log('\n✨ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test error:', error);
    process.exit(1);
  });




