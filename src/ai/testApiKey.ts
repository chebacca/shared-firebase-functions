/**
 * Test API Key Firebase Function
 * 
 * Tests AI API key connection and validity
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { getAIApiKey, callAIProvider } from './utils/aiHelpers';

// Define the encryption key secret (same as storeAIApiKey)
const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

interface TestApiKeyRequest {
  organizationId: string;
  service: 'openai' | 'claude' | 'youtube' | 'gemini' | 'grok';
  preferredProvider?: 'openai' | 'claude' | 'gemini' | 'grok';
}

interface TestApiKeyResponse {
  success: boolean;
  message: string;
  details?: {
    model?: string;
    provider?: string;
  };
}

/**
 * Test API Key - Main function
 */
export const testAIApiKey = onCall(
  { 
    cors: true,
    // Include the encryption key secret
    secrets: [encryptionKeySecret]
  },
  async (request): Promise<TestApiKeyResponse> => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { organizationId, service, preferredProvider } = request.data as TestApiKeyRequest;

    if (!organizationId || !service) {
      throw new HttpsError('invalid-argument', 'OrganizationId and service are required');
    }

    if (service === 'youtube') {
      // YouTube API key testing
      const orgKeyDoc = await admin.firestore()
        .collection('organizations')
        .doc(organizationId)
        .collection('aiApiKeys')
        .doc('youtube')
        .get();

      if (!orgKeyDoc.exists || !orgKeyDoc.data()?.enabled) {
        return {
          success: false,
          message: 'YouTube API key not configured'
        };
      }

      // TODO: Implement YouTube API test
      return {
        success: true,
        message: 'YouTube API key test not yet implemented',
        details: { provider: 'youtube' }
      };
    }

    // Test AI provider
    const provider = preferredProvider || (
      service === 'openai' ? 'openai' 
      : service === 'claude' ? 'claude'
      : service === 'gemini' ? 'gemini'
      : service === 'grok' ? 'grok'
      : 'openai'
    );
    const apiKeyData = await getAIApiKey(organizationId, provider, userId);

    if (!apiKeyData) {
      return {
        success: false,
        message: `No ${provider} API key configured. Please configure in Integration Settings.`
      };
    }

    // Test with a simple API call
    try {
      const testMessages = [
        { role: 'user', content: 'Say "test" if you can read this.' }
      ];

      const response = await callAIProvider(provider, apiKeyData.apiKey, apiKeyData.model, testMessages);
      
      if (response && response.toLowerCase().includes('test')) {
        return {
          success: true,
          message: `${provider} API key is valid and working`,
          details: {
            model: apiKeyData.model,
            provider
          }
        };
      } else {
        return {
          success: false,
          message: `${provider} API key test failed: Unexpected response`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `${provider} API key test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  } catch (error) {
    console.error('Test API Key error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `Failed to test API key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

