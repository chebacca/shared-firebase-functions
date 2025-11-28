import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM PAYSCALE UPDATE
// ============================================================================

export const updatePayscale = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'PUT') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only PUT method is allowed'));
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

    // Update payscale data
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.Timestamp.now()
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.pbmProjectId;
    delete updateData.createdAt;

    await admin.firestore().collection('pbmPayscales').doc(payscaleId).update(updateData);

    console.log(`✅ [UPDATE PBM PAYSCALE] Updated payscale: ${payscaleId}`);

    res.status(200).json(createSuccessResponse({
      id: payscaleId,
      ...existingPayscale,
      ...updateData
    }, 'PBM payscale updated successfully'));

  } catch (error: any) {
    console.error('❌ [UPDATE PBM PAYSCALE] Error:', error);
    res.status(500).json(handleError(error, 'updatePBMPayscale'));
  }
});
