
import * as admin from 'firebase-admin';

// Initialize Firebase Admin BEFORE importing other modules that use it
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: 'backbone-logic'
    });
}

// Now we can import the executor which uses getFirestore()
import { DataToolExecutor } from '../src/ai/DataToolExecutor';

async function testAgentCapabilities() {
    console.log('🧪 Testing Agent Capabilities...');
    console.log('--------------------------------');

    // Test 1: Knowledge Base Search (RAG MVP)
    console.log('\n🔍 Test 1: Knowledge Base Search');
    console.log('Query: "netflix specs"');

    const kbResult = await DataToolExecutor.executeTool(
        'search_knowledge_base',
        { query: 'netflix specs' },
        'global', // Organization ID
        'test-user' // User ID
    );

    if (kbResult.success && kbResult.data?.results?.length > 0) {
        console.log('✅ KB Search Successful!');
        console.log(`Found ${kbResult.data.results.length} results.`);
        console.log('Top Result:', kbResult.data.results[0].title);
    } else {
        console.error('❌ KB Search Failed:', kbResult);
    }

    // Test 2: Knowledge Base Search (Specific)
    console.log('\n🔍 Test 2: Specific Query');
    console.log('Query: "camera angles"');

    const kbResult2 = await DataToolExecutor.executeTool(
        'search_knowledge_base',
        { query: 'camera angles' },
        'global',
        'test-user'
    );

    if (kbResult2.success && kbResult2.data?.results?.length > 0) {
        console.log('✅ KB Search Successful!');
        console.log('Top Result:', kbResult2.data.results[0].title);
    } else {
        console.error('❌ KB Search Failed:', kbResult2);
    }

    console.log('\n--------------------------------');
    console.log('🎉 Tests Complete');
}

testAgentCapabilities().catch(console.error);
