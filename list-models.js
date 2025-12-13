#!/usr/bin/env node

const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('❌ Error: GEMINI_API_KEY environment variable not set');
        console.error('   Set it with: export GEMINI_API_KEY=your_key_here');
        process.exit(1);
    }

    console.log('📋 Listing available Gemini models...\n');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // Try different model names
        const modelsToTry = [
            'gemini-pro',
            'gemini-1.5-pro-latest',
            'gemini-1.5-flash',
            'gemini-1.5-flash-latest',
            'models/gemini-pro',
            'models/gemini-1.5-pro-latest'
        ];

        for (const modelName of modelsToTry) {
            try {
                console.log(`\n🧪 Testing model: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Hello');
                console.log(`✅ ${modelName} WORKS!`);
                console.log(`   Response: ${result.response.text().substring(0, 50)}...`);
                break; // Stop after first working model
            } catch (error) {
                console.log(`❌ ${modelName} failed: ${error.message.substring(0, 100)}`);
            }
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

listModels();
