import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
// import { Dataset } from '../shared/types';

// Shared business logic function
async function updateDatasetLogic(data: any, context?: any): Promise<any> {
  try {
    const { datasetId, updates } = data;

    if (!datasetId || !updates) {
      return createErrorResponse('Missing required fields', 'datasetId and updates are required');
    }

    const updateData = {
      ...updates,
      updatedAt: admin.firestore.Timestamp.now()
    };

    await admin.firestore().collection('datasets').doc(datasetId).update(updateData);

    console.log(`✏️ [UPDATE DATASET] Updated dataset: ${datasetId}`);

    return createSuccessResponse({
      datasetId,
      ...updateData
    }, 'Dataset updated successfully');

  } catch (error: any) {
    console.error('❌ [UPDATE DATASET] Error:', error);
    return handleError(error, 'updateDataset');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const updateDataset = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await updateDatasetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [UPDATE DATASET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to update dataset', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const updateDatasetCallable = functions.https.onCall(async (data: any, context: any) => {
  return await updateDatasetLogic(data, context);
});