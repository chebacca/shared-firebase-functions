import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Session } from '../shared/types';

// Shared business logic function
async function createSessionLogic(data: any, context?: any): Promise<any> {
  try {
    const {
      name,
      projectId,
      organizationId,
      createdBy,
      description = '',
      startDate,
      endDate,
      status = 'draft'
    } = data;

    if (!name || !projectId || !organizationId) {
      return createErrorResponse('Missing required fields: name, projectId, and organizationId are required');
    }

    const sessionData: Session = {
      name,
      projectId,
      organizationId,
      createdBy: createdBy || (context?.auth?.uid || 'system'),
      description,
      startDate,
      endDate,
      status,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const sessionRef = await admin.firestore().collection('sessions').add(sessionData);

    console.log(`✅ [CREATE SESSION] Created session: ${sessionRef.id}`);

    return createSuccessResponse({
      sessionId: sessionRef.id,
      ...sessionData
    }, 'Session created successfully');

  } catch (error: any) {
    console.error('❌ [CREATE SESSION] Error:', error);
    return handleError(error, 'createSession');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const createSession = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await createSessionLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [CREATE SESSION HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to create session', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const createSessionCallable = functions.https.onCall(async (data: any, context: any) => {
  return await createSessionLogic(data, context);
});