/**
 * List Collections Function
 * 
 * Lists all Firestore collections in the project
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const listCollections = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      console.log('📊 [LIST COLLECTIONS] Fetching all collections...');

      // Get all collections
      const collections = await db.listCollections();
      
      const collectionList = collections.map(collection => ({
        id: collection.id,
        path: collection.path,
        parent: collection.parent?.path || null
      }));

      console.log(`📊 [LIST COLLECTIONS] Found ${collectionList.length} collections`);

      return res.status(200).json(createSuccessResponse({
        collections: collectionList,
        count: collectionList.length
      }, 'Collections listed successfully'));

    } catch (error: any) {
      console.error('❌ [LIST COLLECTIONS] Error:', error);
      return res.status(500).json(handleError(error, 'listCollections'));
    }
  }
);
