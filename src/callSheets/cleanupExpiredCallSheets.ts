/**
 * Cleanup Expired Call Sheets Function
 * 
 * Cleans up expired published call sheets
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const cleanupExpiredCallSheets = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId } = request.data || {};

      console.log(`🧹 [CLEANUP EXPIRED CALL SHEETS] Starting cleanup...`);

      const now = new Date();
      let query = db.collection('publishedCallSheets')
        .where('isPublished', '==', true)
        .where('expiresAt', '<', now);

      if (organizationId) {
        query = query.where('organizationId', '==', organizationId);
      }

      const snapshot = await query.get();
      
      const batch = db.batch();
      let deletedCount = 0;
      
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        deletedCount++;
      }
      
      if (deletedCount > 0) {
        await batch.commit();
      }

      console.log(`🧹 [CLEANUP EXPIRED CALL SHEETS] Cleaned up ${deletedCount} expired call sheets`);

      return createSuccessResponse({
        deletedCount,
        cleanedAt: new Date(),
        organizationId: organizationId || 'all'
      }, 'Expired call sheets cleaned up successfully');

    } catch (error: any) {
      console.error('❌ [CLEANUP EXPIRED CALL SHEETS] Error:', error);
      return handleError(error, 'cleanupExpiredCallSheets');
    }
  }
);

// HTTP function
export const cleanupExpiredCallSheetsHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      const { organizationId } = req.query;

      console.log(`🧹 [CLEANUP EXPIRED CALL SHEETS HTTP] Starting cleanup...`);

      const now = new Date();
      let query = db.collection('publishedCallSheets')
        .where('isPublished', '==', true)
        .where('expiresAt', '<', now);

      if (organizationId) {
        query = query.where('organizationId', '==', organizationId);
      }

      const snapshot = await query.get();
      
      const batch = db.batch();
      let deletedCount = 0;
      
      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        deletedCount++;
      }
      
      if (deletedCount > 0) {
        await batch.commit();
      }

      console.log(`🧹 [CLEANUP EXPIRED CALL SHEETS HTTP] Cleaned up ${deletedCount} expired call sheets`);

      res.status(200).json(createSuccessResponse({
        deletedCount,
        cleanedAt: new Date(),
        organizationId: organizationId || 'all'
      }, 'Expired call sheets cleaned up successfully'));

    } catch (error: any) {
      console.error('❌ [CLEANUP EXPIRED CALL SHEETS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'cleanupExpiredCallSheetsHttp'));
    }
  }
);
