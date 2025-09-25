import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function for assigning dataset to project
async function assignDatasetToProjectLogic(data: any, context?: any): Promise<any> {
  try {
    const { projectId, datasetId, assignedBy } = data;

    if (!projectId || !datasetId) {
      return createErrorResponse('Missing required fields', 'projectId and datasetId are required');
    }

    const assignmentData = {
      projectId,
      datasetId,
      assignedBy: assignedBy || 'system',
      assignedAt: admin.firestore.Timestamp.now()
    };

    const assignmentRef = await admin.firestore().collection('projectDatasets').add(assignmentData);

    console.log(`🔗 [ASSIGN DATASET] Assigned dataset ${datasetId} to project ${projectId}`);

    return createSuccessResponse({
      assignmentId: assignmentRef.id,
      ...assignmentData
    }, 'Dataset assigned to project successfully');

  } catch (error: any) {
    console.error('❌ [ASSIGN DATASET] Error:', error);
    return handleError(error, 'assignDatasetToProject');
  }
}

// Shared business logic function for removing dataset from project
async function removeDatasetFromProjectLogic(data: any, context?: any): Promise<any> {
  try {
    const { projectId, datasetId } = data;

    if (!projectId || !datasetId) {
      return createErrorResponse('Missing required fields', 'projectId and datasetId are required');
    }

    const assignmentSnapshot = await admin.firestore().collection('projectDatasets')
      .where('projectId', '==', projectId)
      .where('datasetId', '==', datasetId)
      .get();

    if (assignmentSnapshot.empty) {
      return createErrorResponse('Assignment not found', 'Dataset is not assigned to this project');
    }

    const batch = admin.firestore().batch();
    assignmentSnapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`🔗 [REMOVE DATASET] Removed dataset ${datasetId} from project ${projectId}`);

    return createSuccessResponse({ projectId, datasetId }, 'Dataset removed from project successfully');

  } catch (error: any) {
    console.error('❌ [REMOVE DATASET] Error:', error);
    return handleError(error, 'removeDatasetFromProject');
  }
}

// Shared business logic function for getting project datasets
async function getProjectDatasetsLogic(data: any, context?: any): Promise<any> {
  try {
    const { projectId, limit = 100 } = data;

    if (!projectId) {
      return createErrorResponse('Project ID is required', 'Missing projectId in request body');
    }

    const projectDatasetsSnapshot = await admin.firestore().collection('projectDatasets')
      .where('projectId', '==', projectId)
      .limit(limit)
      .get();

    const datasets = projectDatasetsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [GET PROJECT DATASETS] Found ${datasets.length} datasets for project: ${projectId}`);

    return createSuccessResponse(datasets, 'Project datasets retrieved successfully');

  } catch (error: any) {
    console.error('❌ [GET PROJECT DATASETS] Error:', error);
    return handleError(error, 'getProjectDatasets');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const assignDatasetToProject = functions.https.onRequest(async (req: any, res: any) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const result = await assignDatasetToProjectLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [ASSIGN DATASET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to assign dataset to project', error instanceof Error ? error.message : String(error)));
  }
});

export const removeDatasetFromProject = functions.https.onRequest(async (req: any, res: any) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const result = await removeDatasetFromProjectLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [REMOVE DATASET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to remove dataset from project', error instanceof Error ? error.message : String(error)));
  }
});

export const getProjectDatasets = functions.https.onRequest(async (req: any, res: any) => {
  try {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const result = await getProjectDatasetsLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [GET PROJECT DATASETS HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to get project datasets', error instanceof Error ? error.message : String(error)));
  }
});

// Callable functions for direct Firebase usage
export const assignDatasetToProjectCallable = functions.https.onCall(async (data: any, context: any) => {
  return await assignDatasetToProjectLogic(data, context);
});

export const removeDatasetFromProjectCallable = functions.https.onCall(async (data: any, context: any) => {
  return await removeDatasetFromProjectLogic(data, context);
});

export const getProjectDatasetsCallable = functions.https.onCall(async (data: any, context: any) => {
  return await getProjectDatasetsLogic(data, context);
});