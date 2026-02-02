import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Payment } from '../shared/types';

// Shared business logic function
async function createPaymentLogic(data: any, context?: any): Promise<any> {
  try {
    const {
      userId,
      organizationId,
      amount,
      currency,
      status = 'pending',
      type,
      stripePaymentIntentId,
      stripeSubscriptionId,
      description,
      metadata
    } = data;

    if (!userId || !organizationId || !amount || !currency || !type) {
      return createErrorResponse('Missing required fields: userId, organizationId, amount, currency, and type are required');
    }

    const paymentData: Payment = {
      userId,
      organizationId,
      amount,
      currency,
      status,
      type,
      stripePaymentIntentId,
      stripeSubscriptionId,
      description,
      metadata,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    };

    const paymentRef = await admin.firestore().collection('payments').add(paymentData);

    console.log(`✅ [CREATE PAYMENT] Created payment: ${paymentRef.id}`);

    return createSuccessResponse({
      paymentId: paymentRef.id,
      ...paymentData
    }, 'Payment created successfully');

  } catch (error: any) {
    console.error('❌ [CREATE PAYMENT] Error:', error);
    return handleError(error, 'createPayment');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const createPayment = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await createPaymentLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [CREATE PAYMENT HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to create payment', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const createPaymentCallable = onCall(defaultCallableOptions, async (request) => {
  return await createPaymentLogic(request.data, undefined);
});