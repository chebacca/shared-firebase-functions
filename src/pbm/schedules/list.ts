import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM SCHEDULE LISTING
// ============================================================================

export const getSchedules = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only GET method is allowed'));
    }

    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'projectId is required'));
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

    // Verify project exists and user has access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId as string).get();
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

    // Get schedules
    const schedulesSnapshot = await admin.firestore()
      .collection('pbmSchedules')
      .where('pbmProjectId', '==', projectId)
      .orderBy('order', 'asc')
      .get();

    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [GET PBM SCHEDULES] Found ${schedules.length} schedules for project: ${projectId}`);

    res.status(200).json(createSuccessResponse(schedules, 'PBM schedules retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [GET PBM SCHEDULES] Error:', error);
    res.status(500).json(handleError(error, 'getPBMSchedules'));
  }
});
