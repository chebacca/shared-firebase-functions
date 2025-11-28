/**
 * Trashcan Auto-Cleanup Function
 * 
 * Automatically removes trashcan items older than the retention period (default: 90 days)
 * Runs daily to prevent unbounded growth of the trashcan collection
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const db = getFirestore();

// Default retention period: 90 days
// Can be overridden via environment variable TRASHCAN_RETENTION_DAYS
const DEFAULT_RETENTION_DAYS = 90;

/**
 * Scheduled function to cleanup old trashcan items
 * Runs daily at 2 AM UTC
 */
export const cleanupTrashcan = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'UTC',
    memory: '512MiB',
    timeoutSeconds: 540
  },
  async () => {
    try {
      console.log('🧹 [TRASHCAN CLEANUP] Starting trashcan cleanup...');

      // Get retention period from environment or use default
      const retentionDays = parseInt(
        process.env.TRASHCAN_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS),
        10
      );

      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      console.log(`🧹 [TRASHCAN CLEANUP] Removing items older than ${retentionDays} days (before ${cutoffDate.toISOString()})`);

      // Query all trashcan items older than cutoff date
      // Note: We can't use orderBy in the query without an index, so we'll filter client-side
      // This is acceptable since we're processing in batches
      const trashcanSnapshot = await db.collection('trashcan').get();

      let totalDeleted = 0;
      let totalProcessed = 0;
      let batch = db.batch();
      let batchCount = 0;

      for (const docSnap of trashcanSnapshot.docs) {
        totalProcessed++;
        const data = docSnap.data();
        const deletedAt = data.deletedAt;

        // Check if deletedAt is older than cutoff
        if (deletedAt) {
          // Handle Firestore Timestamp
          const deletedAtTimestamp = deletedAt instanceof Timestamp 
            ? deletedAt 
            : Timestamp.fromDate(new Date(deletedAt));

          if (deletedAtTimestamp.toMillis() < cutoffTimestamp.toMillis()) {
            batch.delete(docSnap.ref);
            batchCount++;
            totalDeleted++;

            // Firestore batch limit is 500 operations
            if (batchCount >= 500) {
              await batch.commit();
              console.log(`🧹 [TRASHCAN CLEANUP] Committed batch: ${batchCount} items deleted`);
              batch = db.batch();
              batchCount = 0;
            }
          }
        } else {
          // If deletedAt is missing, log warning but don't delete (might be important data)
          console.warn(`⚠️ [TRASHCAN CLEANUP] Item ${docSnap.id} missing deletedAt field`);
        }
      }

      // Commit remaining deletions
      if (batchCount > 0) {
        await batch.commit();
        console.log(`🧹 [TRASHCAN CLEANUP] Committed final batch: ${batchCount} items deleted`);
      }

      console.log(`✅ [TRASHCAN CLEANUP] Cleanup completed: ${totalDeleted} items deleted out of ${totalProcessed} processed`);
      console.log(`📊 [TRASHCAN CLEANUP] Summary: retention=${retentionDays} days, cutoff=${cutoffDate.toISOString()}`);
    } catch (error) {
      console.error('❌ [TRASHCAN CLEANUP] Error during cleanup:', error);
      throw error;
    }
  }
);

/**
 * Manual cleanup function (callable via HTTP)
 * Allows manual triggering of trashcan cleanup
 */
import { onRequest } from 'firebase-functions/v2/https';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

export const cleanupTrashcanManual = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 540,
    cors: true
  },
  async (req, res) => {
    try {
      const { retentionDays: requestedRetentionDays } = req.body || {};
      
      const retentionDays = requestedRetentionDays 
        ? parseInt(String(requestedRetentionDays), 10)
        : parseInt(process.env.TRASHCAN_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10);

      if (isNaN(retentionDays) || retentionDays < 0) {
        res.status(400).json(createErrorResponse('Invalid retentionDays value. Must be a positive number.'));
        return;
      }

      console.log(`🧹 [TRASHCAN CLEANUP MANUAL] Starting manual cleanup with ${retentionDays} days retention...`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffTimestamp = Timestamp.fromDate(cutoffDate);

      const trashcanSnapshot = await db.collection('trashcan').get();

      let totalDeleted = 0;
      let totalProcessed = 0;
      let batch = db.batch();
      let batchCount = 0;

      for (const docSnap of trashcanSnapshot.docs) {
        totalProcessed++;
        const data = docSnap.data();
        const deletedAt = data.deletedAt;

        if (deletedAt) {
          const deletedAtTimestamp = deletedAt instanceof Timestamp 
            ? deletedAt 
            : Timestamp.fromDate(new Date(deletedAt));

          if (deletedAtTimestamp.toMillis() < cutoffTimestamp.toMillis()) {
            batch.delete(docSnap.ref);
            batchCount++;
            totalDeleted++;

            if (batchCount >= 500) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      console.log(`✅ [TRASHCAN CLEANUP MANUAL] Manual cleanup completed: ${totalDeleted} items deleted`);

      res.status(200).json(createSuccessResponse({
        deletedCount: totalDeleted,
        processedCount: totalProcessed,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        completedAt: new Date().toISOString()
      }, 'Trashcan cleanup completed successfully'));

    } catch (error: any) {
      console.error('❌ [TRASHCAN CLEANUP MANUAL] Error:', error);
      res.status(500).json(handleError(error, 'cleanupTrashcanManual'));
    }
  }
);

