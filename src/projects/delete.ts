import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function deleteProjectLogic(data: any, context?: any): Promise<any> {
  try {
    const { projectId } = data;

    if (!projectId) {
      return createErrorResponse('Project ID is required', 'Missing projectId in request body');
    }

    // Delete project
    await admin.firestore().collection('projects').doc(projectId).delete();

    // Delete related project datasets
    const projectDatasetsSnapshot = await admin.firestore().collection('projectDatasets')
      .where('projectId', '==', projectId)
      .get();

    const batch = admin.firestore().batch();
    projectDatasetsSnapshot.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    console.log(`🗑️ [DELETE PROJECT] Deleted project: ${projectId}`);

    return createSuccessResponse({ projectId }, 'Project deleted successfully');

  } catch (error: any) {
    console.error('❌ [DELETE PROJECT] Error:', error);
    return handleError(error, 'deleteProject');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const deleteProject = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await deleteProjectLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [DELETE PROJECT HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to delete project', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const deleteProjectCallable = onCall(defaultCallableOptions, async (request) => {
  return await deleteProjectLogic(request.data, undefined);
});