#!/usr/bin/env node

/**
 * Test script to directly call the Gemini Service
 * This bypasses authentication to test the AI integration
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Test Gemini API directly
async function testGeminiAPI() {
    console.log('🧪 Testing Gemini API Integration...\n');

    // You'll need to set your API key here
    const apiKey = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';

    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
        console.error('❌ Error: GEMINI_API_KEY not set');
        console.log('💡 Set it with: export GEMINI_API_KEY=your_key_here');
        process.exit(1);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const systemPrompt = `You are the Master Agent for the BACKBONE production ecosystem.

RESPONSE FORMAT:
You must respond with a JSON object containing:
{
  "response": "Your natural language response to the user",
  "suggestedContext": "media",
  "contextData": {},
  "followUpSuggestions": ["suggestion 1", "suggestion 2"],
  "reasoning": "Brief explanation of why you chose this view"
}`;

        const userPrompt = `Current View: none
User Message: Show me our media assets

Analyze the user's intent and provide a helpful response. Determine the best view mode for their request.`;

        console.log('📝 User Message: "Show me our media assets"');
        console.log('🚀 Calling Gemini API...\n');

        const result = await model.generateContent([
            { text: systemPrompt },
            { text: userPrompt }
        ]);

        const responseText = result.response.text();

        console.log('✅ Raw API Response:');
        console.log('─'.repeat(80));
        console.log(responseText);
        console.log('─'.repeat(80));
        console.log('\n📏 Response length:', responseText.length, 'characters\n');

        // Try to parse JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            console.log('✅ Found JSON in response!');
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('\n📦 Parsed JSON:');
            console.log(JSON.stringify(parsed, null, 2));
        } else {
            console.log('⚠️  No JSON found in response');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response);
        }
    }
}

testGeminiAPI();
