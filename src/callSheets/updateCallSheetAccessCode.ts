/**
 * Update Call Sheet Access Code Function
 * Temporary function to update accessCode and publicId for a published call sheet
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

export const updateCallSheetAccessCode = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 30,
    invoker: 'public',
    cors: false
  },
  async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      setCorsHeaders(req, res);
      res.status(204).send('');
      return;
    }
    
    setCorsHeaders(req, res);

    try {
      const { documentId, newAccessCode } = req.body;

      if (!documentId || !newAccessCode) {
        res.status(400).json(createErrorResponse('Document ID and new access code are required'));
        return;
      }

      console.log(`🔧 [UPDATE ACCESS CODE] Updating document ${documentId} with access code ${newAccessCode}`);

      const docRef = db.collection('publishedCallSheets').doc(documentId);
      const doc = await docRef.get();

      if (!doc.exists) {
        res.status(404).json(createErrorResponse('Published call sheet not found'));
        return;
      }

      const data = doc.data();
      console.log(`📋 Found call sheet: ${data?.title || data?.projectName || 'N/A'}`);
      console.log(`   Current accessCode: ${data?.accessCode || 'N/A'}`);

      // Update both accessCode and publicId
      await docRef.update({
        accessCode: newAccessCode,
        publicId: newAccessCode,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ Successfully updated access code to ${newAccessCode}`);

      res.status(200).json(createSuccessResponse({
        documentId,
        newAccessCode,
        message: 'Access code updated successfully'
      }));

    } catch (error: any) {
      console.error('❌ [UPDATE ACCESS CODE] Error:', error);
      res.status(500).json(createErrorResponse(error.message || 'Failed to update access code'));
    }
  }
);

