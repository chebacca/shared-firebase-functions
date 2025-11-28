import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// UNIFIED PBM API FUNCTION
// Handles all PBM operations through a single endpoint
// ============================================================================

export const pbmApi = functions.https.onRequest(async (req, res) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
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

    const userRecord = await admin.auth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    // Parse the URL path to determine the operation
    const path = req.path;
    const method = req.method;

    // Handle different PBM operations based on path and method
    if (path.startsWith('/pbm/projects')) {
      await handleProjectOperations(req, res, decodedToken, userClaims, userOrgId);
    } else if (path.startsWith('/pbm/schedules')) {
      await handleScheduleOperations(req, res, decodedToken, userClaims, userOrgId);
    } else if (path.startsWith('/pbm/payscales')) {
      await handlePayscaleOperations(req, res, decodedToken, userClaims, userOrgId);
    } else if (path.startsWith('/pbm/daily-status')) {
      await handleDailyStatusOperations(req, res, decodedToken, userClaims, userOrgId);
    } else if (path.startsWith('/pbm/analytics')) {
      await handleAnalyticsOperations(req, res, decodedToken, userClaims, userOrgId);
    } else {
      res.status(404).json(createErrorResponse('Not found', 'PBM endpoint not found'));
      return;
    }

  } catch (error: any) {
    console.error('❌ [PBM API] Error:', error);
    res.status(500).json(handleError(error, 'pbmApi'));
    return;
  }
});

// ============================================================================
// PROJECT OPERATIONS
// ============================================================================

async function handleProjectOperations(req: any, res: any, decodedToken: any, userClaims: any, userOrgId: string) {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path === '/pbm/projects') {
    // List projects
    const { organizationId, status, limit = 100 } = req.query;

    if (!organizationId) {
      res.status(400).json(createErrorResponse('Missing organization ID', 'organizationId is required'));
      return;
    }

    if (userOrgId !== organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not belong to the specified organization'));
      return;
    }

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

    res.status(200).json(createSuccessResponse(projects, 'PBM projects listed successfully'));
    return;

  } else if (method === 'GET' && path.includes('/pbm/projects/')) {
    // Get specific project
    const projectId = path.split('/pbm/projects/')[1];
    
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId).get();
    
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    // Get related data
    const [schedulesSnapshot, payscalesSnapshot] = await Promise.all([
      admin.firestore().collection('pbmSchedules').where('pbmProjectId', '==', projectId).orderBy('order', 'asc').get(),
      admin.firestore().collection('pbmPayscales').where('pbmProjectId', '==', projectId).orderBy('order', 'asc').get()
    ]);

    const schedules = schedulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const payscales = payscalesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const enrichedProject = {
      id: projectDoc.id,
      ...projectData,
      schedules,
      payscales,
      _count: {
        schedules: schedules.length,
        payscales: payscales.length,
        sessions: 0
      }
    };

    res.status(200).json(createSuccessResponse(enrichedProject, 'PBM project retrieved successfully'));
    return;

  } else if (method === 'POST' && path === '/pbm/projects') {
    // Create project
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

    res.status(201).json(createSuccessResponse({
      id: projectRef.id,
      ...projectData
    }, 'PBM project created successfully'));
    return;

  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'Unsupported method for this endpoint'));
    return;
  }
}

// ============================================================================
// SCHEDULE OPERATIONS
// ============================================================================

async function handleScheduleOperations(req: any, res: any, decodedToken: any, userClaims: any, userOrgId: string) {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/pbm/schedules')) {
    // Get schedules for a project
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'projectId is required'));
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId as string).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    const schedulesSnapshot = await admin.firestore()
      .collection('pbmSchedules')
      .where('pbmProjectId', '==', projectId)
      .orderBy('order', 'asc')
      .get();

    const schedules = schedulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json(createSuccessResponse(schedules, 'PBM schedules retrieved successfully'));
    return;

  } else if (method === 'POST' && path === '/pbm/schedules') {
    // Create schedule
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
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(pbmProjectId).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
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

    res.status(201).json(createSuccessResponse({
      id: scheduleRef.id,
      ...scheduleData
    }, 'PBM schedule created successfully'));
    return;

  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'Unsupported method for this endpoint'));
    return;
  }
}

// ============================================================================
// PAYSCALE OPERATIONS
// ============================================================================

async function handlePayscaleOperations(req: any, res: any, decodedToken: any, userClaims: any, userOrgId: string) {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/pbm/payscales')) {
    // Get payscales for a project
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'projectId is required'));
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId as string).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    const payscalesSnapshot = await admin.firestore()
      .collection('pbmPayscales')
      .where('pbmProjectId', '==', projectId)
      .orderBy('order', 'asc')
      .get();

    const payscales = payscalesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json(createSuccessResponse(payscales, 'PBM payscales retrieved successfully'));
    return;

  } else if (method === 'POST' && path === '/pbm/payscales') {
    // Create payscale
    const {
      pbmProjectId,
      accountNumber,
      description,
      guaranteedDays = 0,
      dailyRate = 0,
      weeklyRate = 0,
      totalRate = 0,
      order
    } = req.body;

    if (!pbmProjectId || !accountNumber || !description) {
      res.status(400).json(createErrorResponse('Missing required fields', 'pbmProjectId, accountNumber, and description are required'));
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(pbmProjectId).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    // Get next order number if not provided
    let finalOrder = order;
    if (!finalOrder) {
      const payscalesSnapshot = await admin.firestore()
        .collection('pbmPayscales')
        .where('pbmProjectId', '==', pbmProjectId)
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      finalOrder = payscalesSnapshot.empty ? 1 : (payscalesSnapshot.docs[0].data().order || 0) + 1;
    }

    const payscaleData = {
      pbmProjectId,
      accountNumber,
      description,
      guaranteedDays,
      dailyRate,
      weeklyRate,
      totalRate,
      order: finalOrder,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const payscaleRef = await admin.firestore().collection('pbmPayscales').add(payscaleData);

    res.status(201).json(createSuccessResponse({
      id: payscaleRef.id,
      ...payscaleData
    }, 'PBM payscale created successfully'));
    return;

  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'Unsupported method for this endpoint'));
    return;
  }
}

// ============================================================================
// DAILY STATUS OPERATIONS
// ============================================================================

async function handleDailyStatusOperations(req: any, res: any, decodedToken: any, userClaims: any, userOrgId: string) {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/pbm/daily-status')) {
    // Get daily status for a project
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'projectId is required'));
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId as string).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    const dailyStatusSnapshot = await admin.firestore()
      .collection('pbmDailyStatus')
      .where('pbmProjectId', '==', projectId)
      .get();

    const dailyStatus = dailyStatusSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json(createSuccessResponse(dailyStatus, 'PBM daily status retrieved successfully'));
    return;

  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'Unsupported method for this endpoint'));
    return;
  }
}

// ============================================================================
// ANALYTICS OPERATIONS
// ============================================================================

async function handleAnalyticsOperations(req: any, res: any, decodedToken: any, userClaims: any, userOrgId: string) {
  const method = req.method;
  const path = req.path;

  if (method === 'GET' && path.includes('/pbm/analytics')) {
    // Get analytics for a project
    const { projectId } = req.query;

    if (!projectId) {
      res.status(400).json(createErrorResponse('Missing project ID', 'projectId is required'));
      return;
    }

    // Verify project access
    const projectDoc = await admin.firestore().collection('pbmProjects').doc(projectId as string).get();
    if (!projectDoc.exists) {
      res.status(404).json(createErrorResponse('Project not found', 'PBM project does not exist'));
      return;
    }

    const projectData = projectDoc.data();
    if (!projectData) {
      res.status(404).json(createErrorResponse('Project data not found', 'PBM project data is empty'));
      return;
    }

    if (userOrgId !== projectData.organizationId && !userClaims.isAdmin) {
      res.status(403).json(createErrorResponse('Forbidden', 'User does not have access to this project'));
      return;
    }

    // Get analytics data
    const [schedulesSnapshot, payscalesSnapshot, dailyStatusSnapshot] = await Promise.all([
      admin.firestore().collection('pbmSchedules').where('pbmProjectId', '==', projectId).get(),
      admin.firestore().collection('pbmPayscales').where('pbmProjectId', '==', projectId).get(),
      admin.firestore().collection('pbmDailyStatus').where('pbmProjectId', '==', projectId).get()
    ]);

    const schedules = schedulesSnapshot.docs.map(doc => doc.data());
    const payscales = payscalesSnapshot.docs.map(doc => doc.data());
    const dailyStatus = dailyStatusSnapshot.docs.map(doc => doc.data());

    // Calculate analytics
    const totalSchedules = schedules.length;
    const completedSchedules = schedules.filter(s => s.status === 'COMPLETED').length;
    const inProgressSchedules = schedules.filter(s => s.status === 'IN_PROGRESS').length;
    const scheduledSchedules = schedules.filter(s => s.status === 'SCHEDULED').length;

    const totalPayscales = payscales.length;
    const totalBudget = payscales.reduce((sum, p) => sum + (p.totalRate || 0), 0);
    const totalDailyRates = payscales.reduce((sum, p) => sum + (p.dailyRate || 0), 0);

    const statusCounts = dailyStatus.reduce((counts, status) => {
      counts[status.status] = (counts[status.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const analytics = {
      projectId,
      totalSchedules,
      completedSchedules,
      inProgressSchedules,
      scheduledSchedules,
      completionRate: totalSchedules > 0 ? (completedSchedules / totalSchedules) * 100 : 0,
      totalPayscales,
      totalBudget,
      totalDailyRates,
      statusCounts,
      lastUpdated: admin.firestore.Timestamp.now()
    };

    res.status(200).json(createSuccessResponse(analytics, 'PBM analytics retrieved successfully'));
    return;

  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'Unsupported method for this endpoint'));
    return;
  }
}
