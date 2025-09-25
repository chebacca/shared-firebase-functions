import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { Payment } from '../shared/types';

// Shared business logic function
async function updatePaymentLogic(data: any, context?: any): Promise<any> {
  try {
    const { paymentId, updates } = data;

    if (!paymentId || !updates) {
      return createErrorResponse('Missing required fields', 'paymentId and updates are required');
    }

    const updateData = {
      ...updates,
      updatedAt: admin.firestore.Timestamp.now()
    };

    await admin.firestore().collection('payments').doc(paymentId).update(updateData);

    console.log(`✏️ [UPDATE PAYMENT] Updated payment: ${paymentId}`);

    return createSuccessResponse({
      paymentId,
      ...updateData
    }, 'Payment updated successfully');

  } catch (error: any) {
    console.error('❌ [UPDATE PAYMENT] Error:', error);
    return handleError(error, 'updatePayment');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const updatePayment = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await updatePaymentLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [UPDATE PAYMENT HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to update payment', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const updatePaymentCallable = functions.https.onCall(async (data: any, context: any) => {
  return await updatePaymentLogic(data, context);
});