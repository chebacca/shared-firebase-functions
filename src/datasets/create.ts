import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Dataset } from '../shared/types';

// Shared business logic function
async function createDatasetLogic(data: any, context?: any): Promise<any> {
  try {
    const {
      name,
      type,
      organizationId,
      createdBy,
      size = 0,
      description = '',
      metadata = {}
    } = data;

    if (!name || !type || !organizationId) {
      return createErrorResponse('Missing required fields: name, type, and organizationId are required');
    }

    const datasetData: Dataset = {
      name,
      type,
      organizationId,
      createdBy: createdBy || (context?.auth?.uid || 'system'),
      size,
      description,
      metadata,
      status: 'active',
      isActive: true,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const datasetRef = await admin.firestore().collection('datasets').add(datasetData);

    console.log(`📊 [CREATE DATASET] Created dataset: ${datasetRef.id}`);

    return createSuccessResponse({
      datasetId: datasetRef.id,
      ...datasetData
    }, 'Dataset created successfully');

  } catch (error: any) {
    console.error('❌ [CREATE DATASET] Error:', error);
    return handleError(error, 'createDataset');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const createDataset = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await createDatasetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [CREATE DATASET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to create dataset', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const createDatasetCallable = onCall(defaultCallableOptions, async (request) => {
  return await createDatasetLogic(request.data, { auth: request.auth });
});