/**
 * Get Published Call Sheet Function
 * 
 * Retrieves a published call sheet by public ID
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getPublishedCallSheet = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',  // Required for CORS preflight requests
    cors: true
  },
  async (request) => {
    try {
      const { publicId, accessCode } = request.data;

      // Support both publicId and accessCode for backward compatibility
      const searchValue = publicId || accessCode;

      if (!searchValue) {
        throw new Error('Public ID or access code is required');
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET] Getting call sheet: ${searchValue} (publicId: ${publicId}, accessCode: ${accessCode})`);

      // Try to find by accessCode first (most common case)
      let publishedCallSheetsQuery = await db.collection('publishedCallSheets')
        .where('accessCode', '==', searchValue)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      // If not found by accessCode, try publicId
      if (publishedCallSheetsQuery.empty) {
        publishedCallSheetsQuery = await db.collection('publishedCallSheets')
          .where('publicId', '==', searchValue)
          .where('isPublished', '==', true)
          .limit(1)
          .get();
      }

      // Also try without status filter as last resort (for backward compatibility)
      if (publishedCallSheetsQuery.empty) {
        publishedCallSheetsQuery = await db.collection('publishedCallSheets')
          .where('publicId', '==', searchValue)
          .limit(1)
          .get();
      }

      if (publishedCallSheetsQuery.empty) {
        throw new Error('Published call sheet not found');
      }

      const publishedCallSheetDoc = publishedCallSheetsQuery.docs[0];
      const publishedCallSheetData = publishedCallSheetDoc.data();

      // 🔧 CRITICAL FIX: Check if call sheet is disabled/cancelled
      if (publishedCallSheetData.isActive === false || publishedCallSheetData.isPublished === false) {
        console.log(`📋 [GET PUBLISHED CALL SHEET] Call sheet is disabled: ${searchValue}`, {
          isActive: publishedCallSheetData.isActive,
          isPublished: publishedCallSheetData.isPublished
        });
        throw new Error('Published call sheet has been cancelled or disabled');
      }

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
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',  // Required for CORS preflight requests
    cors: false  // 🔧 CRITICAL FIX: Handle CORS manually to ensure proper preflight handling
  },
  async (req, res) => {
    // 🔧 CRITICAL FIX: Handle OPTIONS preflight request FIRST before any other logic
    if (req.method === 'OPTIONS') {
      setCorsHeaders(req, res);
      res.status(204).send('');
      return;
    }
    
    // 🔧 CRITICAL FIX: Set CORS headers for all responses using the utility function
    setCorsHeaders(req, res);
    
    try {
      const { publicId, accessCode } = req.query;

      // Support both publicId and accessCode for backward compatibility
      const searchValue = publicId || accessCode;

      if (!searchValue) {
        res.status(400).json(createErrorResponse('Public ID or access code is required'));
        return;
      }

      console.log(`📋 [GET PUBLISHED CALL SHEET HTTP] Getting call sheet: ${searchValue} (publicId: ${publicId}, accessCode: ${accessCode})`);

      // Try to find by accessCode first (most common case)
      let publishedCallSheetsQuery = await db.collection('publishedCallSheets')
        .where('accessCode', '==', searchValue)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      // If not found by accessCode, try publicId
      if (publishedCallSheetsQuery.empty) {
        publishedCallSheetsQuery = await db.collection('publishedCallSheets')
          .where('publicId', '==', searchValue)
          .where('isPublished', '==', true)
          .limit(1)
          .get();
      }

      // Also try without status filter as last resort (for backward compatibility)
      if (publishedCallSheetsQuery.empty) {
        publishedCallSheetsQuery = await db.collection('publishedCallSheets')
          .where('publicId', '==', searchValue)
          .limit(1)
          .get();
      }

      if (publishedCallSheetsQuery.empty) {
        res.status(404).json(createErrorResponse('Published call sheet not found'));
        return;
      }

      const publishedCallSheetDoc = publishedCallSheetsQuery.docs[0];
      const publishedCallSheetData = publishedCallSheetDoc.data();

      // 🔧 CRITICAL FIX: Check if call sheet is disabled/cancelled
      if (publishedCallSheetData.isActive === false || publishedCallSheetData.isPublished === false) {
        console.log(`📋 [GET PUBLISHED CALL SHEET HTTP] Call sheet is disabled: ${searchValue}`, {
          isActive: publishedCallSheetData.isActive,
          isPublished: publishedCallSheetData.isPublished
        });
        res.status(410).json(createErrorResponse('Published call sheet has been cancelled or disabled'));
        return;
      }

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
