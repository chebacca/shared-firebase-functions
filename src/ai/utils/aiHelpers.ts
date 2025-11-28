/**
 * Shared AI Helper Functions
 * 
 * Common utilities for AI operations across all AI functions
 */

import { getFirestore } from 'firebase-admin/firestore';
import { decryptTokens } from '../../integrations/encryption';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { TokenUsageService } from '../services/tokenUsageService';

const db = getFirestore();

/**
 * Decrypt API key (handles both base64 and AES-encrypted keys)
 */
export function decryptApiKey(encryptedKey: string): string {
  try {
    // Validate input
    if (!encryptedKey || typeof encryptedKey !== 'string') {
      throw new Error('Invalid encrypted key: must be a non-empty string');
    }

    console.log('🔍 [decryptApiKey] Input key length:', encryptedKey.length);
    console.log('🔍 [decryptApiKey] Input key first 20 chars:', encryptedKey.substring(0, 20));

    // Try AES decryption first (production)
    const decrypted = decryptTokens(encryptedKey);
    
    // Extract the actual key value
    let apiKey: string;
    if (typeof decrypted === 'string') {
      apiKey = decrypted;
    } else {
      apiKey = JSON.stringify(decrypted);
    }

    console.log('🔍 [decryptApiKey] Decrypted key length:', apiKey.length);
    console.log('🔍 [decryptApiKey] Decrypted key first 20 chars:', apiKey.substring(0, 20));
    
    // Check for Unicode replacement characters (65533 = �)
    const hasReplacementChars = apiKey.split('').some(char => char.charCodeAt(0) === 65533);
    if (hasReplacementChars) {
      console.error('❌ [decryptApiKey] Found Unicode replacement characters (�) in decrypted key');
      // Log character codes for debugging
      const charCodes = apiKey.substring(0, 10).split('').map(char => char.charCodeAt(0));
      console.error('❌ [decryptApiKey] First 10 character codes:', charCodes);
      throw new Error('Decrypted key contains invalid Unicode characters');
    }

    // Only trim whitespace - don't sanitize the key itself
    // Validation happens at save time, so we trust the stored value
    apiKey = apiKey.trim();
    
    // Basic validation - just check it's not empty
    if (!apiKey || apiKey.length === 0) {
      throw new Error('Decryption resulted in empty key');
    }

    console.log('✅ [decryptApiKey] Successfully decrypted key, length:', apiKey.length);
    return apiKey;
  } catch (error) {
    console.error('❌ [decryptApiKey] AES decryption failed, trying fallback:', error);
    
    // Fall back to base64 decoding (development/legacy - matches frontend AirtableSecurityService)
    try {
      const decoded = Buffer.from(encryptedKey, 'base64').toString('utf8');
      const trimmed = decoded.trim();
      
      // Check for Unicode replacement characters in fallback too
      const hasReplacementChars = trimmed.split('').some(char => char.charCodeAt(0) === 65533);
      if (hasReplacementChars) {
        console.error('❌ [decryptApiKey] Found Unicode replacement characters in base64 decoded key');
        throw new Error('Base64 decoded key contains invalid Unicode characters');
      }
      
      if (trimmed && trimmed.length > 0) {
        console.log('✅ [decryptApiKey] Successfully decoded via base64, length:', trimmed.length);
        return trimmed;
      }
    } catch (base64Error) {
      console.error('❌ [decryptApiKey] Base64 decoding also failed:', base64Error);
    }
    
    // If both fail, return as-is (might be unencrypted in dev)
    const fallback = encryptedKey.trim() || encryptedKey;
    console.log('⚠️ [decryptApiKey] Using fallback (raw key), length:', fallback.length);
    return fallback;
  }
}

/**
 * Get AI API key from Firestore (decrypted)
 */
export async function getAIApiKey(
  organizationId: string,
  provider: 'openai' | 'claude' | 'gemini' | 'grok',
  userId?: string
): Promise<{ apiKey: string; model: string } | null> {
  try {
    // Check user override first
    if (userId) {
      const userKeyDoc = await db
        .collection('users')
        .doc(userId)
        .collection('aiApiKeys')
        .doc(provider)
        .get();

      if (userKeyDoc.exists) {
        const userKeyData = userKeyDoc.data();
        if (userKeyData?.enabled && userKeyData?.overrideOrgKey) {
          const decryptedKey = decryptApiKey(userKeyData.apiKey);
          const model = userKeyData.model || getDefaultModelForProvider(provider);
          return {
            apiKey: decryptedKey,
            model: upgradeDeprecatedModel(provider, model)
          };
        }
      }
    }

    // Fall back to organization key
    const orgKeyDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('aiApiKeys')
      .doc(provider)
      .get();

    if (!orgKeyDoc.exists || !orgKeyDoc.data()?.enabled) {
      return null;
    }

    const orgKeyData = orgKeyDoc.data();
    const decryptedKey = decryptApiKey(orgKeyData!.apiKey);
    const model = orgKeyData!.model || getDefaultModelForProvider(provider);
    return {
      apiKey: decryptedKey,
      model: upgradeDeprecatedModel(provider, model)
    };
  } catch (error) {
    console.error(`Error getting ${provider} API key:`, error);
    return null;
  }
}

/**
 * Get default model for provider
 */
function getDefaultModelForProvider(provider: 'openai' | 'claude' | 'gemini' | 'grok'): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4';
    case 'claude':
      return 'claude-3-sonnet-20240229';
    case 'gemini':
      // Single stable model - no fallbacks, no complexity
      // Use gemini-2.5-flash - latest stable flash model for v1 API
      return 'gemini-2.5-flash';
    case 'grok':
      return 'grok-beta';
    default:
      return 'gpt-4';
  }
}

/**
 * Upgrade deprecated models to supported alternatives
 * Based on official Gemini API documentation: https://ai.google.dev/models/gemini
 */
function upgradeDeprecatedModel(provider: 'openai' | 'claude' | 'gemini' | 'grok', model: string): string {
  if (provider === 'gemini') {
    // ALWAYS use gemini-2.5-flash - single stable model, no exceptions
    // Latest stable flash model for v1 API (no beta)
    // This ensures stored preferences don't override our single model choice
    if (model !== 'gemini-2.5-flash') {
      console.log(`⚠️ [upgradeDeprecatedModel] Using single stable model 'gemini-2.5-flash' instead of '${model}'`);
      return 'gemini-2.5-flash';
    }
    return model;
  }
  return model;
}

/**
 * Call AI provider API with token usage tracking
 */
export async function callAIProvider(
  provider: 'openai' | 'claude' | 'gemini' | 'grok',
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: {
    organizationId?: string;
    userId?: string;
    apiKeySource?: 'user' | 'backbone';
    feature?: string;
    projectId?: string;
    sessionId?: string;
  }
): Promise<string> {
  if (provider === 'openai') {
    // Use OpenAI SDK (already installed)
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2000
    });

    const responseText = completion.choices[0]?.message?.content || 'No response from AI';
    
    // Track token usage
    if (options?.organizationId && options?.userId) {
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      
      await TokenUsageService.recordTokenUsage({
        organizationId: options.organizationId,
        userId: options.userId,
        provider: 'openai',
        model,
        inputTokens,
        outputTokens,
        apiKeySource: options.apiKeySource || 'user',
        feature: options.feature,
        projectId: options.projectId,
        sessionId: options.sessionId
      }).catch(err => {
        console.warn('Failed to track token usage:', err);
      });
    }

    return responseText;
  } else if (provider === 'claude') {
    // Use Anthropic SDK
    const anthropic = new Anthropic({ apiKey });
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await anthropic.messages.create({
      model: model as any,
      max_tokens: 2000,
      temperature: 0.7,
      system: systemMessage?.content,
      messages: conversationMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })) as any
    });

    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : 'No response from AI';
    
    // Track token usage
    if (options?.organizationId && options?.userId) {
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      
      await TokenUsageService.recordTokenUsage({
        organizationId: options.organizationId,
        userId: options.userId,
        provider: 'claude',
        model,
        inputTokens,
        outputTokens,
        apiKeySource: options.apiKeySource || 'user',
        feature: options.feature,
        projectId: options.projectId,
        sessionId: options.sessionId
      }).catch(err => {
        console.warn('Failed to track token usage:', err);
      });
    }

    return responseText;
  } else if (provider === 'gemini') {
    // Use REST API directly with v1 (stable) endpoint - NO v1beta
    // Use gemini-2.5-flash - latest stable flash model for v1 API
    const STABLE_MODEL = 'gemini-2.5-flash';
    const API_VERSION = 'v1'; // Use stable v1 API, NOT v1beta
    
    console.log(`🔥 [aiHelpers] Using Gemini ${STABLE_MODEL} with ${API_VERSION} API (no beta)`);
    
    // Build messages for API
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    // Format messages for Gemini API
    const contents: any[] = [];
    for (let i = 0; i < Math.max(userMessages.length, assistantMessages.length); i++) {
      if (userMessages[i]) {
        contents.push({ role: 'user', parts: [{ text: userMessages[i].content }] });
      }
      if (assistantMessages[i]) {
        contents.push({ role: 'model', parts: [{ text: assistantMessages[i].content }] });
      }
    }
    
    // If no conversation history, use the last user message
    if (contents.length === 0 && userMessages.length > 0) {
      contents.push({ role: 'user', parts: [{ text: userMessages[userMessages.length - 1].content }] });
    }
    
    // Build request payload
    // Note: v1 API doesn't support systemInstruction field directly
    // If we have a system instruction, prepend it to the first user message
    const requestBody: any = {
      contents: contents
    };
    
    if (systemInstruction && contents.length > 0 && contents[0].role === 'user') {
      // Prepend system instruction to first user message for v1 API
      const firstUserMessage = contents[0].parts[0].text;
      contents[0].parts[0].text = `${systemInstruction}\n\n${firstUserMessage}`;
    }
    
    // Call v1 API directly (NOT v1beta)
    const url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${STABLE_MODEL}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }
    
    const data: any = await response.json();
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const responseText = data.candidates[0].content.parts[0].text || 'No response from AI';
      
      // Track token usage (Gemini API includes usage metadata)
      if (options?.organizationId && options?.userId && data.usageMetadata) {
        const inputTokens = data.usageMetadata.promptTokenCount || 0;
        const outputTokens = data.usageMetadata.candidatesTokenCount || 0;
        
        await TokenUsageService.recordTokenUsage({
          organizationId: options.organizationId,
          userId: options.userId,
          provider: 'gemini',
          model,
          inputTokens,
          outputTokens,
          apiKeySource: options.apiKeySource || 'user',
          feature: options.feature,
          projectId: options.projectId,
          sessionId: options.sessionId
        }).catch(err => {
          console.warn('Failed to track token usage:', err);
        });
      }
      
      return responseText;
    }
    
    throw new Error('Invalid response format from Gemini API');
  } else if (provider === 'grok') {
    // Grok uses OpenAI-compatible API, so we can use OpenAI SDK with custom base URL
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.x.ai/v1'
    });

    const completion = await openai.chat.completions.create({
      model,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2000
    });

    const responseText = completion.choices[0]?.message?.content || 'No response from AI';
    
    // Track token usage (Grok uses OpenAI-compatible format)
    if (options?.organizationId && options?.userId) {
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      
      await TokenUsageService.recordTokenUsage({
        organizationId: options.organizationId,
        userId: options.userId,
        provider: 'grok',
        model,
        inputTokens,
        outputTokens,
        apiKeySource: options.apiKeySource || 'user',
        feature: options.feature,
        projectId: options.projectId,
        sessionId: options.sessionId
      }).catch(err => {
        console.warn('Failed to track token usage:', err);
      });
    }

    return responseText;
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

