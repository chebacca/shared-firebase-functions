/**
 * Completely remove Dropbox integration
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function removeDropbox() {
    const orgId = 'big-tree-productions';

    try {
        // Delete cloudIntegrations/dropbox
        console.log('🗑️ Deleting cloudIntegrations/dropbox...');
        await db
            .collection('organizations')
            .doc(orgId)
            .collection('cloudIntegrations')
            .doc('dropbox')
            .delete();
        console.log('✅ cloudIntegrations/dropbox deleted');

        // Delete integrationConfigs/dropbox-integration
        console.log('🗑️ Deleting integrationConfigs/dropbox-integration...');
        await db
            .collection('organizations')
            .doc(orgId)
            .collection('integrationConfigs')
            .doc('dropbox-integration')
            .delete();
        console.log('✅ integrationConfigs/dropbox-integration deleted');

        console.log('\n✅ Dropbox completely removed!');
        console.log('🔄 Refresh your browser to see the changes.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error removing Dropbox:', error);
        process.exit(1);
    }
}

removeDropbox();
