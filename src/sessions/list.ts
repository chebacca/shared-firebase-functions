import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Session } from '../shared/types';

// Shared business logic function
async function listSessionsLogic(data: any, context?: any): Promise<any> {
  try {
    const { organizationId, projectId, status, limit = 100 } = data;

    if (!organizationId) {
      return createErrorResponse('Organization ID is required', 'Missing organizationId in request body');
    }

    let query: admin.firestore.Query = admin.firestore().collection('sessions').where('organizationId', '==', organizationId);

    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const sessions = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      sessionId: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [LIST SESSIONS] Found ${sessions.length} sessions for organization: ${organizationId}`);

    return createSuccessResponse(sessions, 'Sessions listed successfully');

  } catch (error: any) {
    console.error('❌ [LIST SESSIONS] Error:', error);
    return handleError(error, 'listSessions');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const listSessions = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await listSessionsLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [LIST SESSIONS HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to list sessions', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const listSessionsCallable = functions.https.onCall(async (data: any, context: any) => {
  return await listSessionsLogic(data, context);
});