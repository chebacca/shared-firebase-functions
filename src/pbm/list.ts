import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PBM PROJECT LISTING
// ============================================================================

export const listProjects = functions.https.onRequest(async (req, res) => {
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

    const { organizationId, status, limit = 100 } = req.query;

    if (!organizationId) {
      res.status(400).json(createErrorResponse('Missing organization ID', 'organizationId is required'));
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

    // Verify user belongs to organization
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (userOrgId !== organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not belong to the specified organization'));
    }

    // Build query
    let query: admin.firestore.Query = admin.firestore()
      .collection('pbmProjects')
      .where('organizationId', '==', organizationId);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.limit(parseInt(limit as string));

    const snapshot = await query.get();
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [LIST PBM PROJECTS] Found ${projects.length} projects for organization: ${organizationId}`);

    res.status(200).json(createSuccessResponse(projects, 'PBM projects listed successfully'));

  } catch (error: any) {
    console.error('❌ [LIST PBM PROJECTS] Error:', error);
    res.status(500).json(handleError(error, 'listPBMProjects'));
  }
});
