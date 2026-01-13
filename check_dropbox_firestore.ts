
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

const db = admin.firestore();

async function checkDropboxConnection() {
    const orgId = 'big-tree-productions'; // From logs
    console.log(`🔍 Checking Dropbox connection for organization: ${orgId}`);

    try {
        // Check cloudIntegrations/dropbox
        const integrationDoc = await db
            .collection('organizations')
            .doc(orgId)
            .collection('cloudIntegrations')
            .doc('dropbox')
            .get();

        if (integrationDoc.exists) {
            const data = integrationDoc.data();
            console.log('✅ Found cloudIntegrations/dropbox:');
            console.log(`   - Email: ${data?.accountEmail}`);
            console.log(`   - Name: ${data?.accountName}`);
            console.log(`   - Active: ${data?.isActive}`);
            console.log(`   - Connected At: ${data?.connectedAt?.toDate()}`);
            console.log(`   - Has Encrypted Tokens: ${!!data?.encryptedTokens}`);
        } else {
            console.log('❌ cloudIntegrations/dropbox document NOT found.');
        }

        // Check legacy dropboxConnections
        const legacySnapshot = await db
            .collection('organizations')
            .doc(orgId)
            .collection('dropboxConnections')
            .orderBy('connectedAt', 'desc')
            .limit(1)
            .get();

        if (!legacySnapshot.empty) {
            const data = legacySnapshot.docs[0].data();
            console.log('\n✅ Found legacy dropboxConnections entry:');
            console.log(`   - Email: ${data?.accountEmail}`);
            console.log(`   - Name: ${data?.accountName}`);
            console.log(`   - Connected At: ${data?.connectedAt?.toDate()}`);
        } else {
            console.log('\n❌ No legacy dropboxConnections found.');
        }

    } catch (error) {
        console.error('❌ Error checking Firestore:', error);
    }
}

checkDropboxConnection();
