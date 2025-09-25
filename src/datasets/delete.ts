import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function deleteDatasetLogic(data: any, context?: any): Promise<any> {
  try {
    const { datasetId } = data;

    if (!datasetId) {
      return createErrorResponse('Dataset ID is required', 'Missing datasetId in request body');
    }

    // Delete dataset
    await admin.firestore().collection('datasets').doc(datasetId).delete();

    // Remove dataset from all projects
    const projectDatasetsSnapshot = await admin.firestore().collection('projectDatasets')
      .where('datasetId', '==', datasetId)
      .get();

    const batch = admin.firestore().batch();
    projectDatasetsSnapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`🗑️ [DELETE DATASET] Deleted dataset: ${datasetId}`);

    return createSuccessResponse({ datasetId }, 'Dataset deleted successfully');

  } catch (error: any) {
    console.error('❌ [DELETE DATASET] Error:', error);
    return handleError(error, 'deleteDataset');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const deleteDataset = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await deleteDatasetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [DELETE DATASET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to delete dataset', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const deleteDatasetCallable = functions.https.onCall(async (data: any, context: any) => {
  return await deleteDatasetLogic(data, context);
});