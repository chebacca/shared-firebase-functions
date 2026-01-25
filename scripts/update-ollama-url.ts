import * as admin from 'firebase-admin';

admin.initializeApp();

async function updateOllamaUrl() {
    const url = 'https://qualmishly-unplanished-hildred.ngrok-free.dev';
    await admin.firestore()
        .collection('_system').doc('config')
        .collection('ai').doc('ollama')
        .set({ baseUrl: url }, { merge: true });
    console.log('✅ Updated Ollama URL to:', url);
    process.exit(0);
}

updateOllamaUrl().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
