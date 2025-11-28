import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM SCHEDULE UPDATE
// ============================================================================

export const updateSchedule = functions.https.onRequest(async (req, res) => {
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

    const scheduleId = String(req.params[0]) || String(req.query.id);
    if (!scheduleId) {
      res.status(400).json(createErrorResponse('Missing schedule ID', 'Schedule ID is required'));
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

    // Get existing schedule
    const scheduleDoc = await admin.firestore().collection('pbmSchedules').doc(scheduleId).get();
    
    if (!scheduleDoc.exists) {
      res.status(404).json(createErrorResponse('Schedule not found', 'PBM schedule does not exist'));
    }

    const existingSchedule = scheduleDoc.data();
    if (!existingSchedule) {
      res.status(404).json(createErrorResponse('Schedule data not found', 'PBM schedule data is empty'));
    }

    // Verify project exists and user has access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(existingSchedule.pbmProjectId).get();
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

    // Update schedule data
    const updateData = {
      ...req.body,
      updatedAt: admin.firestore.Timestamp.now()
    };

    // Remove fields that shouldn't be updated
    delete updateData.id;
    delete updateData.pbmProjectId;
    delete updateData.createdAt;

    await admin.firestore().collection('pbmSchedules').doc(scheduleId).update(updateData);

    console.log(`✅ [UPDATE PBM SCHEDULE] Updated schedule: ${scheduleId}`);

    res.status(200).json(createSuccessResponse({
      id: scheduleId,
      ...existingSchedule,
      ...updateData
    }, 'PBM schedule updated successfully'));

  } catch (error: any) {
    console.error('❌ [UPDATE PBM SCHEDULE] Error:', error);
    res.status(500).json(handleError(error, 'updatePBMSchedule'));
  }
});
