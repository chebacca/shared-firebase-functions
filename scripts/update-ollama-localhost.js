const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

const db = admin.firestore();

async function updateOllamaConfig() {
    const localUrl = 'http://localhost:11434';
    console.log(`🔧 Updating Ollama URL to: ${localUrl}`);
    console.log(`📋 This will allow Hub AI services to connect to local Ollama\n`);

    try {
        await db.collection('_system').doc('config').collection('ai').doc('ollama').set({
            baseUrl: localUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: 'ollama-localhost-fix',
            previousUrl: 'https://qualmishly-unplanished-hildred.ngrok-free.dev',
            note: 'Updated to localhost for local development - Ollama is running on the same machine'
        }, { merge: true });

        console.log('✅ Ollama configuration updated in Firestore');
        console.log('📍 Path: _system/config/ai/ollama');
        console.log('🔗 URL: http://localhost:11434\n');

        // Verify the update
        const doc = await db.collection('_system').doc('config').collection('ai').doc('ollama').get();
        if (doc.exists) {
            console.log('✓ Verified configuration:');
            console.log(JSON.stringify(doc.data(), null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating configuration:', error);
        process.exit(1);
    }
}

updateOllamaConfig();
