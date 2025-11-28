import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PBM PROJECT UPDATE
// ============================================================================

export const updateProject = functions.https.onRequest(async (req, res) => {
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

    const projectId = String(req.params[0]) || String(req.query.id);
    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'Project ID is required'));
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

    // Get existing project
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId).get();
    
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
    }

    const existingProject = projectDoc.data();
    if (!existingProject) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
    }

    // Verify user has access to this project
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (userOrgId !== existingProject.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
    }

    // Update project data
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.Timestamp.now()
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.createdBy;
    delete updateData.organizationId;

    await admin.firestore().collection('pbmProjects').doc(projectId).update(updateData);

    console.log(`✅ [UPDATE PBM PROJECT] Updated project: ${projectId}`);

    res.status(200).json(createSuccessResponse({
      id: projectId,
      ...existingProject,
      ...updateData
    }, 'PBM project updated successfully'));

  } catch (error: any) {
    console.error('❌ [UPDATE PBM PROJECT] Error:', error);
    res.status(500).json(handleError(error, 'updatePBMProject'));
  }
});
