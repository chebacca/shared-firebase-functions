import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PBM PROJECT DELETION
// ============================================================================

export const deleteProject = functions.https.onRequest(async (req, res) => {
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

    // Delete related data first
    const batch = admin.firestore().batch();

    // Delete schedules
    const schedulesSnapshot = await admin.firestore()
      .collection('pbmSchedules')
      .where('pbmProjectId', '==', projectId)
      .get();

    schedulesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete payscales
    const payscalesSnapshot = await admin.firestore()
      .collection('pbmPayscales')
      .where('pbmProjectId', '==', projectId)
      .get();

    payscalesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete sessions
    const sessionsSnapshot = await admin.firestore()
      .collection('pbmSessions')
      .where('pbmProjectId', '==', projectId)
      .get();

    sessionsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete daily status
    const dailyStatusSnapshot = await admin.firestore()
      .collection('pbmDailyStatus')
      .where('pbmProjectId', '==', projectId)
      .get();

    dailyStatusSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete the project
    batch.delete(admin.firestore().collection('pbmProjects').doc(projectId));

    await batch.commit();

    console.log(`✅ [DELETE PBM PROJECT] Deleted project: ${projectId} and all related data`);

    res.status(200).json(createSuccessResponse({
      projectId,
      deletedSchedules: schedulesSnapshot.docs.length,
      deletedPayscales: payscalesSnapshot.docs.length,
      deletedSessions: sessionsSnapshot.docs.length,
      deletedDailyStatus: dailyStatusSnapshot.docs.length
    }, 'PBM project and all related data deleted successfully'));

  } catch (error: any) {
    console.error('❌ [DELETE PBM PROJECT] Error:', error);
    res.status(500).json(handleError(error, 'deletePBMProject'));
  }
});
