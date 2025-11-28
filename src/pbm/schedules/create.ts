import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM SCHEDULE CREATION
// ============================================================================

export const createSchedule = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only POST method is allowed'));
    }

    const {
      pbmProjectId,
      sessionNumber,
      sceneNumber,
      sceneDescription,
      status = 'SCHEDULED',
      pageReference,
      pageCount,
      estimatedTime,
      cast,
      stunts,
      vehicles,
      notes,
      order
    } = req.body;

    if (!pbmProjectId || !sessionNumber || !sceneNumber) {
      res.status(400).json(createErrorResponse('Missing required fields', 'pbmProjectId, sessionNumber, and sceneNumber are required'));
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
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(pbmProjectId).get();
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

    // Get next order number if not provided
    let finalOrder = order;
    if (!finalOrder) {
      const schedulesSnapshot = await admin.firestore()
        .collection('pbmSchedules')
        .where('pbmProjectId', '==', pbmProjectId)
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      finalOrder = schedulesSnapshot.empty ? 1 : (schedulesSnapshot.docs[0].data().order || 0) + 1;
    }

    const scheduleData = {
      pbmProjectId,
      sessionNumber,
      sceneNumber,
      sceneDescription: sceneDescription || '',
      status,
      pageReference: pageReference || '',
      pageCount: pageCount || 0,
      estimatedTime: estimatedTime || '',
      cast: cast || '',
      stunts: stunts || '',
      vehicles: vehicles || '',
      notes: notes || '',
      order: finalOrder,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const scheduleRef = await admin.firestore().collection('pbmSchedules').add(scheduleData);

    console.log(`✅ [CREATE PBM SCHEDULE] Created schedule: ${scheduleRef.id}`);

    res.status(201).json(createSuccessResponse({
      id: scheduleRef.id,
      ...scheduleData
    }, 'PBM schedule created successfully'));

  } catch (error: any) {
    console.error('❌ [CREATE PBM SCHEDULE] Error:', error);
    res.status(500).json(handleError(error, 'createPBMSchedule'));
  }
});
