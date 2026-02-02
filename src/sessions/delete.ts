import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function deleteSessionLogic(data: any, context?: any): Promise<any> {
  try {
    const { sessionId } = data;

    if (!sessionId) {
      return createErrorResponse('Session ID is required', 'Missing sessionId in request body');
    }

    await admin.firestore().collection('sessions').doc(sessionId).delete();

    console.log(`🗑️ [DELETE SESSION] Deleted session: ${sessionId}`);

    return createSuccessResponse({ sessionId }, 'Session deleted successfully');

  } catch (error: any) {
    console.error('❌ [DELETE SESSION] Error:', error);
    return handleError(error, 'deleteSession');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const deleteSession = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await deleteSessionLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [DELETE SESSION HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to delete session', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const deleteSessionCallable = onCall(defaultCallableOptions, async (request) => {
  return await deleteSessionLogic(request.data, undefined);
});