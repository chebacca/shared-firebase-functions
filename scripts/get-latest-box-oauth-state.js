/**
 * Get the latest Box OAuth state from Firestore
 * This helps find the state parameter for processing
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = require('../firebase-clipshow.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || serviceAccount.projectId || 'backbone-logic'
    });
  } catch (error) {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'backbone-logic'
    });
  }
}

const db = admin.firestore();

async function getLatestBoxOAuthState() {
  try {
    // Get the 5 most recent Box OAuth states
    const statesSnapshot = await db
      .collection('oauthStates')
      .where('provider', '==', 'box')
      .orderBy('createdAtMillis', 'desc')
      .limit(5)
      .get();

    if (statesSnapshot.empty) {
      console.log('❌ No Box OAuth states found in Firestore');
      console.log('💡 You need to initiate a new Box OAuth flow to get a fresh code');
      return;
    }

    console.log(`✅ Found ${statesSnapshot.size} recent Box OAuth state(s):\n`);
    
    statesSnapshot.forEach((doc, index) => {
      const data = doc.data();
      const createdAt = data.createdAtMillis ? new Date(data.createdAtMillis).toISOString() : 'N/A';
      const expiresAt = data.expiresAtMillis ? new Date(data.expiresAtMillis).toISOString() : 'N/A';
      const isExpired = data.expiresAtMillis ? Date.now() > data.expiresAtMillis : false;
      const codeUsed = data.codeUsed ? '✅ Used' : '⏳ Not used';
      
      console.log(`${index + 1}. State: ${doc.id.substring(0, 40)}...`);
      console.log(`   Created: ${createdAt}`);
      console.log(`   Expires: ${expiresAt} ${isExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      console.log(`   Status: ${codeUsed}`);
      console.log(`   User: ${data.userId ? data.userId.substring(0, 20) + '...' : 'N/A'}`);
      console.log(`   Org: ${data.organizationId || 'N/A'}`);
      console.log('');
    });

    console.log('💡 Note: You still need the OAuth CODE from the Box redirect URL');
    console.log('   The code is in the URL parameter: ?code=XXXXX&state=YYYYY');
    console.log('   Run: node scripts/process-box-oauth-admin.js <code> <state>');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getLatestBoxOAuthState()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });

