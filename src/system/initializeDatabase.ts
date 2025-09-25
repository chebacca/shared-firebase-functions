/**
 * Initialize Database Function
 * 
 * Initializes the database with default collections, indexes, and sample data
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const initializeDatabase = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (req, res) => {
    try {
      const { organizationId, userId } = req.body;

      if (!organizationId) {
        return res.status(400).json(createErrorResponse('Organization ID is required'));
      }

      if (!userId) {
        return res.status(400).json(createErrorResponse('User ID is required'));
      }

      console.log(`🚀 [INITIALIZE DATABASE] Starting database initialization for org: ${organizationId}`);

      const batch = db.batch();
      const results = {
        collectionsCreated: 0,
        documentsCreated: 0,
        errors: []
      };

      // Create default collections and documents
      const defaultCollections = [
        {
          name: 'organizations',
          documents: [{
            id: organizationId,
            name: 'Default Organization',
            description: 'Auto-created organization',
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerId: userId,
            settings: {},
            subscription: {
              type: 'basic',
              status: 'active'
            }
          }]
        },
        {
          name: 'users',
          documents: [{
            id: userId,
            email: 'admin@example.com',
            displayName: 'Admin User',
            organizationId: organizationId,
            role: 'ADMIN',
            hierarchy: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true,
            lastLoginAt: new Date()
          }]
        },
        {
          name: 'projects',
          documents: []
        },
        {
          name: 'datasets',
          documents: []
        },
        {
          name: 'sessions',
          documents: []
        },
        {
          name: 'licenses',
          documents: []
        },
        {
          name: 'payments',
          documents: []
        },
        {
          name: 'teamMembers',
          documents: []
        }
      ];

      // Create collections and documents
      for (const collection of defaultCollections) {
        try {
          const collectionRef = db.collection(collection.name);
          
          for (const docData of collection.documents) {
            const docRef = collectionRef.doc(docData.id);
            batch.set(docRef, {
              ...docData,
              createdAt: new Date(),
              updatedAt: new Date()
            });
            results.documentsCreated++;
          }
          
          results.collectionsCreated++;
          console.log(`📊 [INITIALIZE DATABASE] Created collection: ${collection.name}`);
        } catch (error) {
          console.error(`❌ [INITIALIZE DATABASE] Error creating collection ${collection.name}:`, error);
          results.errors.push(`Failed to create collection ${collection.name}: ${error}`);
        }
      }

      // Commit the batch
      await batch.commit();

      console.log(`🚀 [INITIALIZE DATABASE] Database initialization completed for org: ${organizationId}`);

      return res.status(200).json(createSuccessResponse({
        organizationId,
        userId,
        results,
        timestamp: new Date()
      }, 'Database initialized successfully'));

    } catch (error: any) {
      console.error('❌ [INITIALIZE DATABASE] Error:', error);
      return res.status(500).json(handleError(error, 'initializeDatabase'));
    }
  }
);
