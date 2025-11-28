/**
 * Migrate Data Function
 * 
 * Migrates data between collections or updates data structure
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const migrateData = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (req: any, res: any) => {
    try {
      const { migrationType, organizationId } = req.body;

      if (!migrationType) {
        res.status(400).json(createErrorResponse('Migration type is required'));
        return;
      }

      console.log(`🔄 [MIGRATE DATA] Starting migration: ${migrationType} for org: ${organizationId}`);

      const results = {
        migrationType,
        organizationId,
        documentsProcessed: 0,
        documentsUpdated: 0,
        errors: [],
        startTime: new Date(),
        endTime: null as string | null
      };

      switch (migrationType) {
        case 'addTimestamps':
          await migrateAddTimestamps(organizationId, results);
          break;
        case 'updateUserRoles':
          await migrateUpdateUserRoles(organizationId, results);
          break;
        case 'addOrganizationFields':
          await migrateAddOrganizationFields(organizationId, results);
          break;
        default:
          res.status(400).json(createErrorResponse(`Unknown migration type: ${migrationType}`));
          return;
      }

      results.endTime = new Date().toISOString();
      console.log(`🔄 [MIGRATE DATA] Migration completed: ${migrationType}`);

      res.status(200).json(createSuccessResponse(results, 'Data migration completed successfully'));

    } catch (error: any) {
      console.error('❌ [MIGRATE DATA] Error:', error);
      res.status(500).json(handleError(error, 'migrateData'));
    }
  }
);

async function migrateAddTimestamps(organizationId: string, results: any) {
  const collections = ['users', 'projects', 'datasets', 'sessions'];
  
  for (const collectionName of collections) {
    try {
      const snapshot = await db.collection(collectionName)
        .where('organizationId', '==', organizationId)
        .get();
      
      const batch = db.batch();
      let batchCount = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.updatedAt) {
          batch.update(doc.ref, {
            updatedAt: Timestamp.now(),
            createdAt: data.createdAt || Timestamp.now()
          });
          batchCount++;
        }
      });
      
      if (batchCount > 0) {
        await batch.commit();
        results.documentsUpdated += batchCount;
      }
      
      results.documentsProcessed += snapshot.size;
      console.log(`📊 [MIGRATE DATA] Processed ${snapshot.size} documents in ${collectionName}`);
    } catch (error) {
      console.error(`❌ [MIGRATE DATA] Error processing ${collectionName}:`, error);
      results.errors.push(`Failed to process ${collectionName}: ${error}`);
    }
  }
}

async function migrateUpdateUserRoles(organizationId: string, results: any) {
  try {
    const snapshot = await db.collection('users')
      .where('organizationId', '==', organizationId)
      .get();
    
    const batch = db.batch();
    let batchCount = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.hierarchy) {
        const hierarchy = getHierarchyFromRole(data.role);
        batch.update(doc.ref, {
          hierarchy,
          updatedAt: Timestamp.now()
        });
        batchCount++;
      }
    });
    
    if (batchCount > 0) {
      await batch.commit();
      results.documentsUpdated += batchCount;
    }
    
    results.documentsProcessed += snapshot.size;
    console.log(`📊 [MIGRATE DATA] Updated user roles for ${snapshot.size} users`);
  } catch (error) {
    console.error('❌ [MIGRATE DATA] Error updating user roles:', error);
    results.errors.push(`Failed to update user roles: ${error}`);
  }
}

async function migrateAddOrganizationFields(organizationId: string, results: any) {
  try {
    const orgRef = db.collection('organizations').doc(organizationId);
    const orgDoc = await orgRef.get();
    
    if (orgDoc.exists) {
      const data = orgDoc.data();
      const updates: any = {};
      
      if (!data?.settings) {
        updates.settings = {};
      }
      
      if (!data?.subscription) {
        updates.subscription = {
          type: 'basic',
          status: 'active'
        };
      }
      
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = Timestamp.now();
        await orgRef.update(updates);
        results.documentsUpdated++;
      }
      
      results.documentsProcessed++;
      console.log(`📊 [MIGRATE DATA] Updated organization fields`);
    }
  } catch (error) {
    console.error('❌ [MIGRATE DATA] Error updating organization fields:', error);
    results.errors.push(`Failed to update organization fields: ${error}`);
  }
}

function getHierarchyFromRole(role: string): number {
  const roleHierarchy: Record<string, number> = {
    'SUPERADMIN': 100,
    'ADMIN': 100,
    'admin': 90,
    'owner': 100,
    'MANAGER': 80,
    'POST_COORDINATOR': 70,
    'PRODUCER': 65,
    'EDITOR': 60,
    'member': 50,
    'viewer': 10,
    'USER': 30,
    'GUEST': 10
  };
  
  return roleHierarchy[role] || 30;
}
