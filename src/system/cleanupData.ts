/**
 * Cleanup Data Function
 * 
 * Cleans up old, orphaned, or invalid data from the database
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Request, Response } from 'express';

const db = getFirestore();

export const cleanupData = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (req: Request, res: Response) => {
    try {
      const { organizationId, cleanupType, options = {} } = req.body;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`🧹 [CLEANUP DATA] Starting cleanup: ${cleanupType || 'all'} for org: ${organizationId}`);

      const results = {
        organizationId,
        cleanupType: cleanupType || 'all',
        documentsDeleted: 0,
        collectionsProcessed: 0,
        errors: [],
        startTime: new Date(),
        endTime: null as string | null
      };

      // Perform different types of cleanup
      if (!cleanupType || cleanupType === 'all' || cleanupType === 'orphaned') {
        await cleanupOrphanedData(organizationId, results);
      }

      if (!cleanupType || cleanupType === 'all' || cleanupType === 'old') {
        await cleanupOldData(organizationId, results, options);
      }

      if (!cleanupType || cleanupType === 'all' || cleanupType === 'invalid') {
        await cleanupInvalidData(organizationId, results);
      }

      results.endTime = new Date().toISOString();
      console.log(`🧹 [CLEANUP DATA] Cleanup completed: ${results.documentsDeleted} documents deleted`);

      res.status(200).json(createSuccessResponse(results, 'Data cleanup completed successfully'));

    } catch (error: any) {
      console.error('❌ [CLEANUP DATA] Error:', error);
      res.status(500).json(handleError(error, 'cleanupData'));
    }
  }
);

async function cleanupOrphanedData(organizationId: string, results: any) {
  console.log('🧹 [CLEANUP DATA] Cleaning up orphaned data...');
  
  // Clean up orphaned team members
  try {
    const teamMembersSnapshot = await db.collection('teamMembers')
      .where('organizationId', '==', organizationId)
      .get();
    
    const batch = db.batch();
    let batchCount = 0;
    
    for (const doc of teamMembersSnapshot.docs) {
      const data = doc.data();
      
      // Check if the referenced user still exists
      const userRef = db.collection('users').doc(data.userId);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        batch.delete(doc.ref);
        batchCount++;
        console.log(`🧹 [CLEANUP DATA] Deleting orphaned team member: ${doc.id}`);
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
      results.documentsDeleted += batchCount;
    }
    
    results.collectionsProcessed++;
  } catch (error) {
    console.error('❌ [CLEANUP DATA] Error cleaning orphaned team members:', error);
    results.errors.push(`Failed to clean orphaned team members: ${error}`);
  }
}

async function cleanupOldData(organizationId: string, results: any, options: any) {
  console.log('🧹 [CLEANUP DATA] Cleaning up old data...');
  
  const daysOld = options.daysOld || 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  // Clean up old sessions
  try {
    const sessionsSnapshot = await db.collection('sessions')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'completed')
      .where('updatedAt', '<', cutoffDate)
      .get();
    
    const batch = db.batch();
    let batchCount = 0;
    
    sessionsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      batchCount++;
    });
    
    if (batchCount > 0) {
      await batch.commit();
      results.documentsDeleted += batchCount;
      console.log(`🧹 [CLEANUP DATA] Deleted ${batchCount} old sessions`);
    }
    
    results.collectionsProcessed++;
  } catch (error) {
    console.error('❌ [CLEANUP DATA] Error cleaning old sessions:', error);
    results.errors.push(`Failed to clean old sessions: ${error}`);
  }
}

async function cleanupInvalidData(organizationId: string, results: any) {
  console.log('🧹 [CLEANUP DATA] Cleaning up invalid data...');
  
  // Clean up users without required fields
  try {
    const usersSnapshot = await db.collection('users')
      .where('organizationId', '==', organizationId)
      .get();
    
    const batch = db.batch();
    let batchCount = 0;
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Check for invalid users (no email or role)
      if (!data.email || !data.role) {
        batch.delete(doc.ref);
        batchCount++;
        console.log(`🧹 [CLEANUP DATA] Deleting invalid user: ${doc.id}`);
      }
    });
    
    if (batchCount > 0) {
      await batch.commit();
      results.documentsDeleted += batchCount;
    }
    
    results.collectionsProcessed++;
  } catch (error) {
    console.error('❌ [CLEANUP DATA] Error cleaning invalid users:', error);
    results.errors.push(`Failed to clean invalid users: ${error}`);
  }
}
