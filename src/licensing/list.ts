import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
// import { License } from '../shared/types';

// Shared business logic function
async function listLicensesLogic(data: any, context?: any): Promise<any> {
  try {
    const { organizationId, userId, status, type, limit = 100 } = data;

    if (!organizationId) {
      return createErrorResponse('Organization ID is required', 'Missing organizationId in request body');
    }

    let query: admin.firestore.Query = admin.firestore().collection('licenses').where('organizationId', '==', organizationId);

    if (userId) {
      query = query.where('userId', '==', userId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (type) {
      query = query.where('type', '==', type);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const licenses = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      licenseId: doc.id,
      ...doc.data()
    }));

    console.log(`📋 [LIST LICENSES] Found ${licenses.length} licenses for organization: ${organizationId}`);

    return createSuccessResponse(licenses, 'Licenses listed successfully');

  } catch (error: any) {
    console.error('❌ [LIST LICENSES] Error:', error);
    return handleError(error, 'listLicenses');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const listLicenses = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await listLicensesLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [LIST LICENSES HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to list licenses', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const listLicensesCallable = onCall(defaultCallableOptions, async (request) => {
  return await listLicensesLogic(request.data, undefined);
});