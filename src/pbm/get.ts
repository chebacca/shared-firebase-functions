import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PBM PROJECT RETRIEVAL
// ============================================================================

export const getProject = functions.https.onRequest(async (req, res) => {
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

    // Get project data
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId).get();
    
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
    }

    // Verify user has access to this project
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
    }

    // Get related schedules
    const schedulesSnapshot = await admin.firestore()
      .collection('pbmSchedules')
      .where('pbmProjectId', '==', projectId)
      .orderBy('order', 'asc')
      .get();

    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get related payscales
    const payscalesSnapshot = await admin.firestore()
      .collection('pbmPayscales')
      .where('pbmProjectId', '==', projectId)
      .orderBy('order', 'asc')
      .get();

    const payscales = payscalesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get related sessions
    const sessionsSnapshot = await admin.firestore()
      .collection('pbmSessions')
      .where('pbmProjectId', '==', projectId)
      .orderBy('createdAt', 'desc')
      .get();

    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const enrichedProject = {
      id: projectDoc.id,
      ...projectData,
      schedules,
      payscales,
      sessions,
      _count: {
        schedules: schedules.length,
        payscales: payscales.length,
        sessions: sessions.length
      }
    };

    console.log(`✅ [GET PBM PROJECT] Retrieved project: ${projectId} with ${schedules.length} schedules, ${payscales.length} payscales, ${sessions.length} sessions`);

    res.status(200).json(createSuccessResponse(enrichedProject, 'PBM project retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [GET PBM PROJECT] Error:', error);
    res.status(500).json(handleError(error, 'getPBMProject'));
  }
});
