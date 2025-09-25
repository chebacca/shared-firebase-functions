import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { License } from '../shared/types';

// Shared business logic function
async function createLicenseLogic(data: any, context?: any): Promise<any> {
  try {
    const {
      userId,
      organizationId,
      type,
      status = 'active',
      expiresAt,
      features = [],
      subscriptionId
    } = data;

    if (!userId || !organizationId || !type) {
      return createErrorResponse('Missing required fields: userId, organizationId, and type are required');
    }

    const licenseData: License = {
      userId,
      organizationId,
      type,
      status,
      expiresAt,
      features,
      subscriptionId,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const licenseRef = await admin.firestore().collection('licenses').add(licenseData);

    console.log(`✅ [CREATE LICENSE] Created license: ${licenseRef.id}`);

    return createSuccessResponse({
      licenseId: licenseRef.id,
      ...licenseData
    }, 'License created successfully');

  } catch (error: any) {
    console.error('❌ [CREATE LICENSE] Error:', error);
    return handleError(error, 'createLicense');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const createLicense = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await createLicenseLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [CREATE LICENSE HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to create license', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const createLicenseCallable = functions.https.onCall(async (data: any, context: any) => {
  return await createLicenseLogic(data, context);
});