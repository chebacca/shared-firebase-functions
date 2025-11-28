import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM PAYSCALE DELETION
// ============================================================================

export const deletePayscale = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'DELETE') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only DELETE method is allowed'));
    }

    const payscaleId = String(req.params[0]) || String(req.query.id);
    if (!payscaleId) {
      res.status(400).json(createErrorResponse('Missing payscale ID', 'Payscale ID is required'));
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      res.status(401).json(createErrorResponse('Invalid token', 'Authentication token is invalid'));
    }

    // Get existing payscale
    const payscaleDoc = await admin.firestore().collection('pbmPayscales').doc(payscaleId).get();
    
    if (!payscaleDoc.exists) {
      res.status(404).json(createErrorResponse('Payscale not found', 'PBM payscale does not exist'));
    }

    const existingPayscale = payscaleDoc.data();
    if (!existingPayscale) {
      res.status(404).json(createErrorResponse('Payscale data not found', 'PBM payscale data is empty'));
    }

    // Verify project exists and user has access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(existingPayscale.pbmProjectId).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
    }

    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
    }

    // Delete the payscale
    await admin.firestore().collection('pbmPayscales').doc(payscaleId).delete();

    console.log(`✅ [DELETE PBM PAYSCALE] Deleted payscale: ${payscaleId}`);

    res.status(200).json(createSuccessResponse({
      payscaleId
    }, 'PBM payscale deleted successfully'));

  } catch (error: any) {
    console.error('❌ [DELETE PBM PAYSCALE] Error:', error);
    res.status(500).json(handleError(error, 'deletePBMPayscale'));
  }
});
