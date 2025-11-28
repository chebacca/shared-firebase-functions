/**
 * Test Gemini API by fetching API key from Firestore
 * Requires Firebase Admin SDK to be initialized
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    console.log('💡 Make sure you have Firebase credentials configured');
    process.exit(1);
  }
}

const db = admin.firestore();

// Simple decryption (matches what's in aiHelpers.ts)
function decryptApiKey(encryptedKey) {
  // For testing, if the key doesn't look encrypted, return as-is
  if (!encryptedKey || encryptedKey.length < 50) {
    return encryptedKey; // Probably not encrypted
  }
  // In production, this would decrypt using INTEGRATIONS_ENCRYPTION_KEY
  // For testing, we'll try to get the raw key if possible
  return encryptedKey;
}

async function testGeminiFromFirestore() {
  try {
    console.log('🧪 Testing Gemini API with gemini-1.5-flash model...\n');
    
    // Test organization ID - change this to your test org
    const testOrgId = process.argv[2] || 'enterprise-media-org';
    console.log(`📋 Fetching API key for organization: ${testOrgId}\n`);
    
    // Get API key from Firestore
    const orgKeyDoc = await db
      .collection('organizations')
      .doc(testOrgId)
      .collection('aiApiKeys')
      .doc('gemini')
      .get();
    
    if (!orgKeyDoc.exists) {
      console.error('❌ No Gemini API key found in Firestore');
      console.log(`💡 Path checked: organizations/${testOrgId}/aiApiKeys/gemini`);
      console.log('💡 Make sure you have stored a Gemini API key in Integration Settings');
      process.exit(1);
    }
    
    const orgKeyData = orgKeyDoc.data();
    
    if (!orgKeyData?.enabled) {
      console.error('❌ Gemini API key is disabled in Firestore');
      process.exit(1);
    }
    
    const apiKey = decryptApiKey(orgKeyData.apiKey);
    const model = orgKeyData.model || 'gemini-1.5-flash';
    
    console.log(`✅ API Key found`);
    console.log(`📦 Stored Model: ${model}`);
    console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...\n`);
    
    // Use gemini-1.5-flash with v1 (stable) API - NO v1beta
    const testModel = 'gemini-1.5-flash';
    const apiVersion = 'v1'; // Stable v1 API, NOT v1beta
    console.log(`🚀 Testing with model: ${testModel} using ${apiVersion} API (no beta)`);
    
    // Use REST API directly with v1 endpoint
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${testModel}:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Hello, this is a test. Please respond with "Test successful" if you can read this.' }]
      }],
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }]
      }
    };
    
    console.log('📤 Sending test message to v1 API...\n');
    
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
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response format: ' + JSON.stringify(data));
    }
    
    const text = data.candidates[0].content.parts[0].text;
    
    console.log('✅ SUCCESS! Gemini API responded:');
    console.log('─'.repeat(50));
    console.log(text);
    console.log('─'.repeat(50));
    console.log(`\n✨ Model ${testModel} is working correctly!`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.message.includes('404')) {
      console.error('\n💡 Model not found (404). This could mean:');
      console.error('   - The model name is incorrect');
      console.error('   - The API version (v1beta) doesn\'t support this model');
      console.error(`   - Model tried: ${error.message.match(/models\/([^:]+)/)?.[1] || 'unknown'}`);
    }
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Authentication error. Check your API key.');
    }
    
    if (error.message.includes('v1beta')) {
      console.error('\n💡 The SDK is using v1beta API. We need a model that works with v1beta.');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testGeminiFromFirestore();

