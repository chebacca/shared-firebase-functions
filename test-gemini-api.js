/**
 * Test script for Gemini API call
 * Tests the aiChatAssistant function directly
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./service-account-key.json');
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const auth = getAuth();

async function testGeminiAPI() {
  try {
    // Get a test user token (or use service account)
    // For testing, we'll simulate a call to the function
    
    console.log('🧪 Testing Gemini API with gemini-1.5-flash model...\n');
    
    // Import the function logic directly
    const { getAIApiKey, callAIProvider } = require('./lib/ai/utils/aiHelpers');
    
    // Test organization ID (you may need to change this)
    const testOrgId = 'enterprise-media-org'; // Change to your test org
    const testUserId = null; // Can be null for org-level keys
    
    console.log(`📋 Fetching API key for organization: ${testOrgId}`);
    const apiKeyData = await getAIApiKey(testOrgId, 'gemini', testUserId);
    
    if (!apiKeyData) {
      console.error('❌ No Gemini API key found in Firestore');
      console.log('💡 Make sure you have stored a Gemini API key in Integration Settings');
      process.exit(1);
    }
    
    console.log(`✅ API Key found`);
    console.log(`📦 Model: ${apiKeyData.model}`);
    console.log(`🔑 API Key: ${apiKeyData.apiKey.substring(0, 10)}...\n`);
    
    // Test the API call
    console.log('🚀 Testing Gemini API call...');
    const testMessages = [
      {
        role: 'user',
        content: 'Hello, this is a test message. Please respond with "Test successful" if you can read this.'
      }
    ];
    
    const response = await callAIProvider(
      'gemini',
      apiKeyData.apiKey,
      apiKeyData.model,
      testMessages
    );
    
    console.log('\n✅ SUCCESS! Gemini API responded:');
    console.log('─'.repeat(50));
    console.log(response);
    console.log('─'.repeat(50));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testGeminiAPI();













