/**
 * Vector Store Service
 * 
 * Store and retrieve embeddings in Firestore
 * Supports semantic search for relevant context
 */

import { getFirestore } from 'firebase-admin/firestore';
import { generateEmbedding, cosineSimilarity } from './EmbeddingService';

const db = getFirestore();

export interface StoredEmbedding {
  id: string;
  content: string;
  embedding: number[];
  category: string;
  metadata?: any;
  createdAt: Date;
}

export interface SearchResult {
  content: string;
  category: string;
  similarity: number;
  metadata?: any;
}

/**
 * Store embedding in Firestore
 */
export async function storeEmbedding(
  organizationId: string,
  content: string,
  category: string,
  embedding: number[],
  metadata?: any
): Promise<string> {
  const docRef = db.collection('clipShowAIEmbeddings').doc();
  
  await docRef.set({
    organizationId,
    content,
    embedding,
    category,
    metadata: metadata || {},
    createdAt: new Date()
  });

  return docRef.id;
}

/**
 * Store multiple embeddings in batch
 */
export async function storeEmbeddingsBatch(
  organizationId: string,
  embeddings: Array<{
    content: string;
    category: string;
    embedding: number[];
    metadata?: any;
  }>
): Promise<string[]> {
  const batch = db.batch();
  const ids: string[] = [];

  embeddings.forEach(({ content, category, embedding, metadata }) => {
    const docRef = db.collection('clipShowAIEmbeddings').doc();
    ids.push(docRef.id);
    
    batch.set(docRef, {
      organizationId,
      content,
      embedding,
      category,
      metadata: metadata || {},
      createdAt: new Date()
    });
  });

  await batch.commit();
  return ids;
}

/**
 * Search for similar embeddings using cosine similarity
 */
export async function searchSimilarEmbeddings(
  organizationId: string,
  queryEmbedding: number[],
  options?: {
    category?: string;
    limit?: number;
    minSimilarity?: number;
  }
): Promise<SearchResult[]> {
  const {
    category,
    limit = 10,
    minSimilarity = 0.7
  } = options || {};

  // Fetch all embeddings for the organization
  let query = db
    .collection('clipShowAIEmbeddings')
    .where('organizationId', '==', organizationId);

  if (category) {
    query = query.where('category', '==', category) as any;
  }

  const snapshot = await query.get();
  
  const results: Array<SearchResult & { similarity: number }> = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const storedEmbedding = data.embedding as number[];
    
    if (storedEmbedding && storedEmbedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
      
      if (similarity >= minSimilarity) {
        results.push({
          content: data.content,
          category: data.category,
          similarity,
          metadata: data.metadata
        });
      }
    }
  });

  // Sort by similarity (highest first) and limit
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}

/**
 * Index content by generating and storing embedding
 */
export async function indexContent(
  organizationId: string,
  content: string,
  category: string,
  metadata?: any
): Promise<string> {
  // Generate embedding
  const embeddingResult = await generateEmbedding(content, organizationId);
  
  // Store embedding
  const id = await storeEmbedding(
    organizationId,
    content,
    category,
    embeddingResult.embedding,
    metadata
  );

  return id;
}

/**
 * Index multiple content items in batch
 */
export async function indexContentBatch(
  organizationId: string,
  items: Array<{
    content: string;
    category: string;
    metadata?: any;
  }>
): Promise<string[]> {
  // Generate embeddings for all items
  const texts = items.map(item => item.content);
  const { generateEmbeddingsBatch } = await import('./EmbeddingService');
  const embeddingResults = await generateEmbeddingsBatch(texts, organizationId);
  
  // Prepare embeddings for storage
  const embeddings = items.map((item, index) => ({
    content: item.content,
    category: item.category,
    embedding: embeddingResults[index].embedding,
    metadata: item.metadata
  }));

  // Store all embeddings
  const ids = await storeEmbeddingsBatch(organizationId, embeddings);
  
  return ids;
}

/**
 * Search for relevant content using text query
 */
export async function searchContent(
  organizationId: string,
  query: string,
  options?: {
    category?: string;
    limit?: number;
    minSimilarity?: number;
  }
): Promise<SearchResult[]> {
  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query, organizationId);
  
  // Search for similar embeddings
  const results = await searchSimilarEmbeddings(
    organizationId,
    queryEmbedding.embedding,
    options
  );

  return results;
}

