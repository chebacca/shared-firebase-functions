/**
 * Direct test of Gemini API with gemini-1.5-flash model
 * Tests using v1 (stable) REST API endpoint - NO v1beta
 */

// You'll need to set this as an environment variable or pass it as argument
const API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!API_KEY) {
  console.error('❌ Error: GEMINI_API_KEY environment variable or API key argument required');
  console.log('Usage: GEMINI_API_KEY=your_key node test-gemini-direct.js');
  console.log('   OR: node test-gemini-direct.js your_api_key');
  process.exit(1);
}

async function testGeminiDirect() {
  try {
    console.log('🧪 Testing Gemini API with v1 (stable) endpoint - NO v1beta...\n');
    console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}...`);
    console.log(`📦 Model: gemini-2.5-flash`);
    console.log(`🌐 API Version: v1 (stable, not beta)\n`);
    
    // Use REST API directly with v1 endpoint
    const model = 'gemini-2.5-flash';
    const apiVersion = 'v1'; // Stable v1 API, NOT v1beta
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${API_KEY}`;
    
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Hello, this is a test. Please respond with "Test successful" if you can read this.' }]
      }]
    };
    
    console.log('🚀 Sending test message to v1 API...\n');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const text = data.candidates[0].content.parts[0].text;
      
      console.log('✅ SUCCESS! Gemini API (v1 stable) responded:');
      console.log('─'.repeat(50));
      console.log(text);
      console.log('─'.repeat(50));
      console.log('\n✨ Model gemini-2.5-flash is working correctly with v1 API!');
    } else {
      throw new Error('Invalid response format: ' + JSON.stringify(data));
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.message.includes('404')) {
      console.error('\n💡 The model is not found. This could mean:');
      console.error('   - The model name is incorrect');
      console.error('   - The API version being used doesn\'t support this model');
      console.error('   - The API key doesn\'t have access to this model');
    }
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Authentication error. Check your API key.');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testGeminiDirect();

