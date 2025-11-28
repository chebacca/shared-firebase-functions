import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

// ============================================================================
// PBM DAILY STATUS UPDATE
// ============================================================================

export const updateDailyStatus = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST' && req.method !== 'PUT') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only POST and PUT methods are allowed'));
    }

    const {
      pbmProjectId,
      payscaleId,
      date,
      status,
      notes
    } = req.body;

    if (!pbmProjectId || !payscaleId || !date || !status) {
      res.status(400).json(createErrorResponse('Missing required fields', 'pbmProjectId, payscaleId, date, and status are required'));
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

    // Check if daily status already exists
    const existingStatusQuery = await admin.firestore()
      .collection('pbmDailyStatus')
      .where('pbmProjectId', '==', pbmProjectId)
      .where('payscaleId', '==', payscaleId)
      .where('date', '==', date)
      .get();

    const dailyStatusData: any = {
      pbmProjectId,
      payscaleId,
      date,
      status,
      notes: notes || '',
      updatedAt: admin.firestore.Timestamp.now(),
      updatedBy: decodedToken.uid
    };

    let result;
    if (existingStatusQuery.empty) {
      // Create new daily status
      dailyStatusData.createdAt = admin.firestore.Timestamp.now();
      const docRef = await admin.firestore().collection('pbmDailyStatus').add(dailyStatusData);
      result = { id: docRef.id, ...dailyStatusData };
      console.log(`✅ [CREATE PBM DAILY STATUS] Created daily status: ${docRef.id}`);
    } else {
      // Update existing daily status
      const docRef = existingStatusQuery.docs[0].ref;
      await docRef.update(dailyStatusData);
      result = { id: docRef.id, ...dailyStatusData };
      console.log(`✅ [UPDATE PBM DAILY STATUS] Updated daily status: ${docRef.id}`);
    }

    res.status(200).json(createSuccessResponse(result, 'PBM daily status updated successfully'));

  } catch (error: any) {
    console.error('❌ [UPDATE PBM DAILY STATUS] Error:', error);
    res.status(500).json(handleError(error, 'updatePBMDailyStatus'));
  }
});
