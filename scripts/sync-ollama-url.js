const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

const db = admin.firestore();

async function setOllamaConfig() {
    const ngrokUrl = 'https://qualmishly-unplanished-hildred.ngrok-free.dev';
    console.log(`Setting Ollama URL to: ${ngrokUrl}`);

    await db.collection('_system').doc('config').collection('ai').doc('ollama').set({
        baseUrl: ngrokUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'antigravity-fix'
    }, { merge: true });

    console.log('✅ Ollama configuration updated in Firestore (_system/config/ai/ollama)');
}

setOllamaConfig().catch(console.error);
