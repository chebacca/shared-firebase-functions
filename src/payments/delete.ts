import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function deletePaymentLogic(data: any, context?: any): Promise<any> {
  try {
    const { paymentId } = data;

    if (!paymentId) {
      return createErrorResponse('Payment ID is required', 'Missing paymentId in request body');
    }

    await admin.firestore().collection('payments').doc(paymentId).delete();

    console.log(`🗑️ [DELETE PAYMENT] Deleted payment: ${paymentId}`);

    return createSuccessResponse({ paymentId }, 'Payment deleted successfully');

  } catch (error: any) {
    console.error('❌ [DELETE PAYMENT] Error:', error);
    return handleError(error, 'deletePayment');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const deletePayment = onRequest({ memory: '512MiB' }, async (req: any, res: any) => {
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

    const result = await deletePaymentLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [DELETE PAYMENT HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to delete payment', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const deletePaymentCallable = onCall(defaultCallableOptions, async (request) => {
  return await deletePaymentLogic(request.data, undefined);
});
