/**
 * Disable Box and Dropbox integration configs
 * This prevents auto-reconnect behavior
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function disableIntegrations() {
    const orgId = 'big-tree-productions';

    try {
        console.log('🔧 Disabling Box integration...');
        await db
            .collection('organizations')
            .doc(orgId)
            .collection('integrationConfigs')
            .doc('box-integration')
            .update({ enabled: false });
        console.log('✅ Box integration disabled');

        console.log('🔧 Disabling Dropbox integration...');
        await db
            .collection('organizations')
            .doc(orgId)
            .collection('integrationConfigs')
            .doc('dropbox-integration')
            .update({ enabled: false });
        console.log('✅ Dropbox integration disabled');

        console.log('\n✅ All integrations disabled successfully!');
        console.log('🔄 Refresh your browser to see the changes.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error disabling integrations:', error);
        process.exit(1);
    }
}

disableIntegrations();
