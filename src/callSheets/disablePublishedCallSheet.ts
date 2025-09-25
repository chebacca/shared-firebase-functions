import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function disablePublishedCallSheetLogic(data: any, context?: any): Promise<any> {
  try {
    const { callSheetId, organizationId, userId } = data;

    if (!callSheetId) {
      return createErrorResponse('Call sheet ID is required');
    }

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    console.log(`📋 [DISABLE PUBLISHED CALL SHEET] Disabling call sheet: ${callSheetId}`);

    // Get published call sheet data
    const publishedCallSheetDoc = await admin.firestore().collection('publishedCallSheets').doc(callSheetId).get();
    if (!publishedCallSheetDoc.exists) {
      return createErrorResponse('Published call sheet not found');
    }

    const publishedCallSheetData = publishedCallSheetDoc.data();
    
    // Verify organization access
    if (publishedCallSheetData?.organizationId !== organizationId) {
      return createErrorResponse('Published call sheet not in organization');
    }

    // Update published call sheet to disabled
    await admin.firestore().collection('publishedCallSheets').doc(callSheetId).update({
      isPublished: false,
      disabledAt: admin.firestore.Timestamp.now(),
      disabledBy: userId || (context?.auth?.uid || 'system')
    });

    console.log(`📋 [DISABLE PUBLISHED CALL SHEET] Call sheet disabled successfully: ${callSheetId}`);

    return createSuccessResponse({
      callSheetId,
      disabledAt: admin.firestore.Timestamp.now()
    }, 'Published call sheet disabled successfully');

  } catch (error: any) {
    console.error('❌ [DISABLE PUBLISHED CALL SHEET] Error:', error);
    return handleError(error, 'disablePublishedCallSheet');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const disablePublishedCallSheet = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await disablePublishedCallSheetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [DISABLE PUBLISHED CALL SHEET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to disable published call sheet', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const disablePublishedCallSheetCallable = functions.https.onCall(async (data: any, context: any) => {
  return await disablePublishedCallSheetLogic(data, context);
});