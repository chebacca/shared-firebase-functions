/**
 * Vector Search Service
 * 
 * Provides semantic search capabilities using Vertex AI embeddings.
 * Enables natural language queries and similarity matching across Firestore collections.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';

// Define secret for Gemini API key (for embeddings)
const geminiApiKey = defineSecret('GEMINI_API_KEY');

export interface SearchResult {
  id: string;
  collection: string;
  score: number;
  data: any;
  metadata?: {
    matchedFields?: string[];
    snippet?: string;
  };
}

export interface EmbeddingResult {
  embedding: number[];
  text: string;
  metadata?: Record<string, any>;
}

export class VectorSearchService {
  private db: FirebaseFirestore.Firestore;
  private genAI: GoogleGenerativeAI | null = null;
  private embeddingModel: any = null;

  constructor(apiKey?: string) {
    this.db = getFirestore();
    
    // Initialize Gemini for embeddings if API key is available
    if (apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use text-embedding-004 model for embeddings
        // Note: This may need to be adjusted based on actual Gemini embedding model
        this.embeddingModel = this.genAI.getGenerativeModel({ 
          model: 'text-embedding-004' 
        });
      } catch (error) {
        console.error('Failed to initialize Gemini for embeddings:', error);
      }
    }
  }

  /**
   * Generate embedding for text using Gemini
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingModel) {
      throw new Error('Embedding model not initialized. API key required.');
    }

    try {
      // Generate embedding using Gemini
      // Note: Actual implementation may vary based on Gemini embedding API
      const result = await this.embeddingModel.embedContent({
        content: { parts: [{ text }] }
      });

      // Extract embedding values
      // Adjust based on actual Gemini response structure
      return result.embedding?.values || [];
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }

  /**
   * Index an entity for vector search
   * Stores embedding in Firestore document
   */
  async indexEntity(
    collection: string,
    docId: string,
    text: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Generate embedding
      const embedding = await this.generateEmbedding(text);

      // Store embedding in Firestore
      await this.db.collection(collection).doc(docId).update({
        embedding: embedding,
        embeddingText: text,
        embeddingUpdatedAt: new Date(),
        ...metadata
      });

      console.log(`✅ Indexed entity: ${collection}/${docId}`);
    } catch (error) {
      console.error(`Error indexing entity ${collection}/${docId}:`, error);
      throw error;
    }
  }

  /**
   * Semantic search across a collection
   * Uses vector similarity to find relevant documents
   */
  async semanticSearch(
    query: string,
    collection: string,
    organizationId: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    try {
      // Validate organizationId is provided
      if (!organizationId) {
        throw new Error('organizationId is required for semantic search');
      }

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Get all documents in collection with embeddings
      const snapshot = await this.db
        .collection(collection)
        .where('organizationId', '==', organizationId)
        .where('embedding', '!=', null)
        .get();

      if (snapshot.empty) {
        console.log(`No documents with embeddings found in ${collection}`);
        return [];
      }

      // Calculate cosine similarity for each document
      const results: SearchResult[] = [];
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const docEmbedding = data.embedding as number[];

        if (!docEmbedding || docEmbedding.length === 0) {
          continue;
        }

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(queryEmbedding, docEmbedding);

        results.push({
          id: doc.id,
          collection: collection,
          score: similarity,
          data: data,
          metadata: {
            snippet: this.extractSnippet(data.embeddingText || '', query)
          }
        });
      }

      // Sort by similarity score (descending)
      results.sort((a, b) => b.score - a.score);

      // Return top results
      return results.slice(0, limit);
    } catch (error) {
      console.error('Error in semantic search:', error);
      throw error;
    }
  }

  /**
   * Search across multiple collections
   */
  async searchAll(
    query: string,
    organizationId: string,
    collections: string[],
    limit: number = 10
  ): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    // Search each collection
    for (const collection of collections) {
      try {
        const results = await this.semanticSearch(
          query,
          collection,
          organizationId,
          limit
        );
        allResults.push(...results);
      } catch (error) {
        console.error(`Error searching collection ${collection}:`, error);
        // Continue with other collections
      }
    }

    // Sort all results by score
    allResults.sort((a, b) => b.score - a.score);

    // Return top results across all collections
    return allResults.slice(0, limit);
  }

  /**
   * Find similar entities to a given entity
   */
  async findSimilar(
    collection: string,
    docId: string,
    organizationId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      // Validate organizationId is provided
      if (!organizationId) {
        throw new Error('organizationId is required for findSimilar');
      }

      // Get the source document
      const docRef = this.db.collection(collection).doc(docId);
      const doc = await docRef.get();

      if (!doc.exists) {
        throw new Error(`Document ${docId} not found in ${collection}`);
      }

      const data = doc.data();
      
      // Validate source document belongs to organization
      if (data?.organizationId !== organizationId) {
        throw new Error(`Document ${docId} does not belong to organization ${organizationId}`);
      }

      const sourceEmbedding = data?.embedding as number[];

      if (!sourceEmbedding || sourceEmbedding.length === 0) {
        throw new Error(`Document ${docId} has no embedding`);
      }

      // Get all other documents in collection with embeddings
      const snapshot = await this.db
        .collection(collection)
        .where('organizationId', '==', organizationId)
        .where('embedding', '!=', null)
        .get();

      const results: SearchResult[] = [];

      for (const otherDoc of snapshot.docs) {
        // Skip the source document
        if (otherDoc.id === docId) {
          continue;
        }

        const otherData = otherDoc.data();
        const otherEmbedding = otherData.embedding as number[];

        if (!otherEmbedding || otherEmbedding.length === 0) {
          continue;
        }

        // Calculate similarity
        const similarity = this.cosineSimilarity(sourceEmbedding, otherEmbedding);

        results.push({
          id: otherDoc.id,
          collection: collection,
          score: similarity,
          data: otherData
        });
      }

      // Sort by similarity and return top results
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    } catch (error) {
      console.error('Error finding similar entities:', error);
      throw error;
    }
  }

  /**
   * Batch index multiple entities
   */
  async batchIndex(
    collection: string,
    entities: Array<{ id: string; text: string; metadata?: Record<string, any> }>
  ): Promise<void> {
    const batch = this.db.batch();
    const batchSize = 500; // Firestore batch limit

    for (let i = 0; i < entities.length; i += batchSize) {
      const batchEntities = entities.slice(i, i + batchSize);

      for (const entity of batchEntities) {
        try {
          const embedding = await this.generateEmbedding(entity.text);
          const docRef = this.db.collection(collection).doc(entity.id);

          batch.update(docRef, {
            embedding: embedding,
            embeddingText: entity.text,
            embeddingUpdatedAt: new Date(),
            ...entity.metadata
          });
        } catch (error) {
          console.error(`Error processing entity ${entity.id}:`, error);
          // Continue with other entities
        }
      }

      // Commit batch
      await batch.commit();
      console.log(`✅ Indexed batch ${i / batchSize + 1}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * Extract a snippet of text around query terms
   */
  private extractSnippet(text: string, query: string, maxLength: number = 200): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();

    // Find first occurrence of any query term
    let startIndex = -1;
    for (const term of queryTerms) {
      const index = textLower.indexOf(term);
      if (index !== -1 && (startIndex === -1 || index < startIndex)) {
        startIndex = index;
      }
    }

    if (startIndex === -1) {
      // No match found, return beginning of text
      return text.substring(0, maxLength) + (text.length > maxLength ? '...' : '');
    }

    // Extract snippet around match
    const snippetStart = Math.max(0, startIndex - maxLength / 2);
    const snippetEnd = Math.min(text.length, startIndex + maxLength / 2);

    let snippet = text.substring(snippetStart, snippetEnd);
    if (snippetStart > 0) snippet = '...' + snippet;
    if (snippetEnd < text.length) snippet = snippet + '...';

    return snippet;
  }
}

// Export singleton instance factory
export function getVectorSearchService(apiKey?: string): VectorSearchService {
  return new VectorSearchService(apiKey);
}

