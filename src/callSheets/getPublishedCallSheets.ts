/**
 * Get Published Call Sheets Function
 * 
 * Retrieves all published call sheets for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getPublishedCallSheets = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId, limit = 50, includeExpired = false } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`📋 [GET PUBLISHED CALL SHEETS] Getting call sheets for org: ${organizationId}`);

      let query = db.collection('publishedCallSheets')
        .where('organizationId', '==', organizationId)
        .where('isPublished', '==', true)
        .orderBy('publishedAt', 'desc')
        .limit(limit);

      const snapshot = await query.get();
      
      const callSheets = [];
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Filter out expired call sheets if not including them
        if (!includeExpired && data.expiresAt && new Date() > data.expiresAt.toDate()) {
          continue;
        }
        
        callSheets.push({
          id: doc.id,
          publicId: data.publicId,
          title: data.title,
          publishedAt: data.publishedAt,
          expiresAt: data.expiresAt,
          isExpired: data.expiresAt ? new Date() > data.expiresAt.toDate() : false,
          publishedBy: data.publishedBy
        });
      }

      console.log(`📋 [GET PUBLISHED CALL SHEETS] Found ${callSheets.length} call sheets`);

      return createSuccessResponse({
        callSheets,
        count: callSheets.length,
        organizationId
      }, 'Published call sheets retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET PUBLISHED CALL SHEETS] Error:', error);
      return handleError(error, 'getPublishedCallSheets');
    }
  }
);

// HTTP function
export const getPublishedCallSheetsHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      const { organizationId, limit = 50, includeExpired = false } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`📋 [GET PUBLISHED CALL SHEETS HTTP] Getting call sheets for org: ${organizationId}`);

      let query = db.collection('publishedCallSheets')
        .where('organizationId', '==', organizationId)
        .where('isPublished', '==', true)
        .orderBy('publishedAt', 'desc')
        .limit(parseInt(limit as string));

      const snapshot = await query.get();
      
      const callSheets = [];
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        // Filter out expired call sheets if not including them
        if (includeExpired !== 'true' && data.expiresAt && new Date() > data.expiresAt.toDate()) {
          continue;
        }
        
        callSheets.push({
          id: doc.id,
          publicId: data.publicId,
          title: data.title,
          publishedAt: data.publishedAt,
          expiresAt: data.expiresAt,
          isExpired: data.expiresAt ? new Date() > data.expiresAt.toDate() : false,
          publishedBy: data.publishedBy
        });
      }

      console.log(`📋 [GET PUBLISHED CALL SHEETS HTTP] Found ${callSheets.length} call sheets`);

      res.status(200).json(createSuccessResponse({
        callSheets,
        count: callSheets.length,
        organizationId
      }, 'Published call sheets retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET PUBLISHED CALL SHEETS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getPublishedCallSheetsHttp'));
    }
  }
);
