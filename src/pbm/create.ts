import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PBM PROJECT CREATION
// ============================================================================

export const createProject = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json(createErrorResponse('Method not allowed', 'Only POST method is allowed'));
      return;
    }

    const {
      name,
      description,
      organizationId,
      startDate,
      endDate,
      status = 'PLANNING',
      totalBudget,
      projectedBudget,
      createdBy
    } = req.body;

    if (!name || !organizationId || !createdBy) {
      res.status(400).json(createErrorResponse('Missing required fields', 'name, organizationId, and createdBy are required'));
      return;
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      res.status(401).json(createErrorResponse('Invalid token', 'Authentication token is invalid'));
      return;
    }

    // Verify user belongs to organization
    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (userOrgId !== organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not belong to the specified organization'));
      return;
    }

    const projectData = {
      name,
      description: description || '',
      organizationId,
      startDate: startDate || null,
      endDate: endDate || null,
      status,
      totalBudget: totalBudget || 0,
      projectedBudget: projectedBudget || 0,
      actualCosts: 0,
      createdBy,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const projectRef = await admin.firestore().collection('pbmProjects').add(projectData);

    console.log(`✅ [CREATE PBM PROJECT] Created project: ${projectRef.id}`);

    res.status(201).json(createSuccessResponse({
      id: projectRef.id,
      ...projectData
    }, 'PBM project created successfully'));
    return;

  } catch (error: any) {
    console.error('❌ [CREATE PBM PROJECT] Error:', error);
    res.status(500).json(handleError(error, 'createPBMProject'));
    return;
  }
});
