import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
// import { Project } from '../shared/types';

// Shared business logic function
async function listProjectsLogic(data: any, context?: any): Promise<any> {
  try {
    const { organizationId, status, limit = 100 } = data;

    if (!organizationId) {
      return createErrorResponse('Organization ID is required', 'Missing organizationId in request body');
    }

    let query: admin.firestore.Query = admin.firestore().collection('projects').where('organizationId', '==', organizationId);

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const projects = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      projectId: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [LIST PROJECTS] Found ${projects.length} projects for organization: ${organizationId}`);

    return createSuccessResponse(projects, 'Projects listed successfully');

  } catch (error: any) {
    console.error('❌ [LIST PROJECTS] Error:', error);
    return handleError(error, 'listProjects');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const listProjects = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await listProjectsLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [LIST PROJECTS HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to list projects', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const listProjectsCallable = functions.https.onCall(async (data: any, context: any) => {
  return await listProjectsLogic(data, context);
});