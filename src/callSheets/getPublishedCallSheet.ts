/**
 * Get Published Call Sheet Function
 * 
 * Retrieves a published call sheet by public ID
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getPublishedCallSheet = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (request) => {
    try {
      const { publicId } = request.data;

      if (!publicId) {
        throw new Error('Public ID is required');
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET] Getting call sheet: ${publicId}`);

      // Find published call sheet by public ID
      const publishedCallSheetsQuery = await db.collection('publishedCallSheets')
        .where('publicId', '==', publicId)
        .where('isPublished', '==', true)
        .limit(1)
        .get();

      if (publishedCallSheetsQuery.empty) {
        throw new Error('Published call sheet not found');
      }

      const publishedCallSheetDoc = publishedCallSheetsQuery.docs[0];
      const publishedCallSheetData = publishedCallSheetDoc.data();

      // Check if expired
      if (publishedCallSheetData.expiresAt && new Date() > publishedCallSheetData.expiresAt.toDate()) {
        throw new Error('Published call sheet has expired');
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET] Call sheet retrieved successfully: ${publicId}`);

      return createSuccessResponse({
        callSheet: publishedCallSheetData,
        callSheetId: publishedCallSheetDoc.id
      }, 'Published call sheet retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET PUBLISHED CALL SHEET] Error:', error);
      return handleError(error, 'getPublishedCallSheet');
    }
  }
);

// HTTP function
export const getPublishedCallSheetHttp = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req, res) => {
    try {
      const { publicId } = req.query;

      if (!publicId) {
        res.status(400).json(createErrorResponse('Public ID is required'));
        return;
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET HTTP] Getting call sheet: ${publicId}`);

      // Find published call sheet by public ID
      const publishedCallSheetsQuery = await db.collection('publishedCallSheets')
        .where('publicId', '==', publicId)
        .where('isPublished', '==', true)
        .limit(1)
        .get();

      if (publishedCallSheetsQuery.empty) {
        res.status(404).json(createErrorResponse('Published call sheet not found'));
        return;
      }

      const publishedCallSheetDoc = publishedCallSheetsQuery.docs[0];
      const publishedCallSheetData = publishedCallSheetDoc.data();

      // Check if expired
      if (publishedCallSheetData.expiresAt && new Date() > publishedCallSheetData.expiresAt.toDate()) {
        res.status(410).json(createErrorResponse('Published call sheet has expired'));
        return;
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET HTTP] Call sheet retrieved successfully: ${publicId}`);

      res.status(200).json(createSuccessResponse({
        callSheet: publishedCallSheetData,
        callSheetId: publishedCallSheetDoc.id
      }, 'Published call sheet retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET PUBLISHED CALL SHEET HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getPublishedCallSheetHttp'));
    }
  }
);
