/**
 * Embedding Service
 * 
 * Generate embeddings for app knowledge using OpenAI or other providers
 * Supports embedding documentation, workflow definitions, role descriptions, etc.
 */

import { getAIApiKey } from '../utils/aiHelpers';
import { GeminiService } from '../GeminiService';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Generate embedding for text using Gemini (Unified Service)
 */
export async function generateEmbedding(
  text: string,
  organizationId: string,
  options?: {
    model?: string;
  }
): Promise<EmbeddingResult> {
  const { model = 'text-embedding-004' } = options || {};

  try {
    // Get Gemini API key
    const keyData = await getAIApiKey(organizationId, 'gemini');
    if (!keyData || !keyData.apiKey) {
      throw new Error('Gemini API key not found');
    }

    const geminiSvc = new GeminiService(keyData.apiKey);
    const embedding = await geminiSvc.generateEmbedding(text);

    return {
      embedding,
      model: model, // Current Gemini default
    };
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  organizationId: string,
  options?: {
    model?: string;
    batchSize?: number;
  }
): Promise<EmbeddingResult[]> {
  const { batchSize = 10 } = options || {}; // Gemini batching might be smaller

  const results: EmbeddingResult[] = [];

  // Process sequentially to avoid rate limits, or in parallel chunks
  for (const text of texts) {
    try {
      const res = await generateEmbedding(text, organizationId, options);
      results.push(res);
    } catch (error) {
      console.error(`Error generating embedding for item:`, error);
    }
  }

  return results;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

