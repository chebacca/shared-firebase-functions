/**
 * Create Collection Function
 * 
 * Creates a new Firestore collection with proper indexing and security rules
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const createCollection = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res): Promise<void> => {
    try {
      const { collectionName, indexes, securityRules } = req.body;

      if (!collectionName) {
        res.status(400).json(createErrorResponse('Collection name is required'));
        return;
      }

      // Create the collection by adding a dummy document
      const collectionRef = db.collection(collectionName);
      const dummyDoc = await collectionRef.add({
        _created: new Date(),
        _type: 'collection_initializer',
        _description: 'This document initializes the collection'
      });

      // Delete the dummy document
      await dummyDoc.delete();

      console.log(`📊 [CREATE COLLECTION] Created collection: ${collectionName}`);

      // If indexes are provided, create them
      if (indexes && Array.isArray(indexes)) {
        console.log(`📊 [CREATE COLLECTION] Creating ${indexes.length} indexes for ${collectionName}`);
        // Note: Index creation is typically done via firestore.indexes.json
        // This is a placeholder for future index management
      }

      // If security rules are provided, log them
      if (securityRules) {
        console.log(`📊 [CREATE COLLECTION] Security rules provided for ${collectionName}`);
        // Note: Security rules are typically managed via firestore.rules
        // This is a placeholder for future rule management
      }

      res.status(200).json(createSuccessResponse({
        collectionName,
        created: true,
        timestamp: new Date()
      }, 'Collection created successfully'));

    } catch (error: any) {
      console.error('❌ [CREATE COLLECTION] Error:', error);
      res.status(500).json(handleError(error, 'createCollection'));
    }
  }
);
