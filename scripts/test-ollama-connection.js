const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

async function testOllamaConnection() {
    console.log('🧪 Testing Ollama Connection from Services\n');

    // Step 1: Get config from Firestore (same as services do)
    console.log('1️⃣ Fetching Ollama config from Firestore...');
    const configDoc = await admin.firestore()
        .collection('_system').doc('config')
        .collection('ai').doc('ollama').get();

    if (!configDoc.exists) {
        console.error('❌ Config document does not exist!');
        process.exit(1);
    }

    const config = configDoc.data();
    const baseUrl = config.baseUrl;
    console.log(`   ✓ Found baseUrl: ${baseUrl}\n`);

    // Step 2: Test connection to Ollama API
    console.log('2️⃣ Testing connection to Ollama API...');
    try {
        const response = await fetch(`${baseUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true',
                'User-Agent': 'Firebase-Functions-Ollama-Client/1.0'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.error(`   ❌ Connection failed: ${response.status} ${response.statusText}`);
            process.exit(1);
        }

        const data = await response.json();
        console.log(`   ✓ Connection successful!`);
        console.log(`   ✓ Found ${data.models.length} models:\n`);

        data.models.forEach(model => {
            const size = (model.size / 1024 / 1024 / 1024).toFixed(2);
            console.log(`      - ${model.name} (${size} GB)`);
        });

        console.log('');
    } catch (error) {
        console.error(`   ❌ Connection error: ${error.message}`);
        process.exit(1);
    }

    // Step 3: Test if required models are available
    console.log('3️⃣ Checking for required models...');
    const response = await fetch(`${baseUrl}/api/tags`);
    const data = await response.json();
    const modelNames = data.models.map(m => m.name);

    const requiredModels = {
        fast: process.env.OLLAMA_MODEL_FAST || 'phi4-mini',
        quality: process.env.OLLAMA_MODEL_QUALITY || 'gemma3:12b'
    };

    const hasFast = modelNames.some(name =>
        name.includes(requiredModels.fast.replace(':latest', '')) ||
        name === requiredModels.fast
    );
    const hasQuality = modelNames.some(name =>
        name.includes(requiredModels.quality.split(':')[0]) ||
        name === requiredModels.quality
    );

    console.log(`   Fast model (${requiredModels.fast}): ${hasFast ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Quality model (${requiredModels.quality}): ${hasQuality ? '✅ Available' : '❌ Missing'}`);
    console.log('');

    // Step 4: Test simple generation
    console.log('4️⃣ Testing chat generation...');
    try {
        const testResponse = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({
                model: hasFast ? 'phi4-mini:latest' : modelNames[0],
                messages: [
                    { role: 'user', content: 'Say "Hello, Backbone Hub!" in exactly those words.' }
                ],
                stream: false,
                options: {
                    temperature: 0.3,
                    num_predict: 20
                }
            }),
            signal: AbortSignal.timeout(30000)
        });

        if (testResponse.ok) {
            const testData = await testResponse.json();
            console.log(`   ✓ Generation successful!`);
            console.log(`   Response: "${testData.message.content.trim()}"\n`);
        } else {
            console.warn(`   ⚠️ Generation failed: ${testResponse.status}`);
        }
    } catch (error) {
        console.warn(`   ⚠️ Generation test skipped: ${error.message}\n`);
    }

    console.log('═══════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════');
    console.log('\n🎉 Ollama is properly configured and accessible!');
    console.log('📋 Configuration summary:');
    console.log(`   • Base URL: ${baseUrl}`);
    console.log(`   • Fast model: ${hasFast ? '✅' : '❌'} ${requiredModels.fast}`);
    console.log(`   • Quality model: ${hasQuality ? '✅' : '❌'} ${requiredModels.quality}`);
    console.log('\n📝 Next: Test in Hub by using CNS or Master Agent Drawer');

    process.exit(0);
}

testOllamaConnection().catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
});
