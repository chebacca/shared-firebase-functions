/**
 * Embedding Service
 * 
 * Generate embeddings for app knowledge using OpenAI or other providers
 * Supports embedding documentation, workflow definitions, role descriptions, etc.
 */

import { getAIApiKey } from '../utils/aiHelpers';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Generate embedding for text using OpenAI
 */
export async function generateEmbedding(
  text: string,
  organizationId: string,
  options?: {
    model?: string;
  }
): Promise<EmbeddingResult> {
  const { model = 'text-embedding-3-small' } = options || {};

  try {
    // Get OpenAI API key
    const apiKey = await getAIApiKey(organizationId, 'openai');
    if (!apiKey) {
      throw new Error('OpenAI API key not found');
    }

    // Call OpenAI embeddings API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as any;
    
    return {
      embedding: data.data[0].embedding,
      model: data.model,
      usage: data.usage
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
  const { model = 'text-embedding-3-small', batchSize = 100 } = options || {};

  const results: EmbeddingResult[] = [];
  
  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    try {
      const apiKey = await getAIApiKey(organizationId, 'openai');
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          input: batch
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json() as any;
      
      data.data.forEach((item: any, index: number) => {
        results.push({
          embedding: item.embedding,
          model: data.model,
          usage: index === 0 ? data.usage : undefined // Usage is for the entire batch
        });
      });
    } catch (error) {
      console.error(`Error generating embeddings for batch ${i}:`, error);
      // Continue with other batches even if one fails
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

