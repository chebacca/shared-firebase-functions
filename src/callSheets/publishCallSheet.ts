import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
async function publishCallSheetLogic(data: any, context?: any): Promise<any> {
  try {
    const { callSheetId, organizationId, userId } = data;

    if (!callSheetId) {
      return createErrorResponse('Call sheet ID is required');
    }

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    console.log(`📋 [PUBLISH CALL SHEET] Publishing call sheet: ${callSheetId}`);

    // Get call sheet data
    const callSheetDoc = await admin.firestore().collection('callSheets').doc(callSheetId).get();
    if (!callSheetDoc.exists) {
      return createErrorResponse('Call sheet not found');
    }

    const callSheetData = callSheetDoc.data();
    
    // Verify organization access
    if (callSheetData?.organizationId !== organizationId) {
      return createErrorResponse('Call sheet not in organization');
    }

    // Create published call sheet
    const publishedCallSheet = {
      ...callSheetData,
      publishedAt: admin.firestore.Timestamp.now(),
      publishedBy: userId || (context?.auth?.uid || 'system'),
      isPublished: true,
      publicId: generatePublicId(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days
    };

    // Save published call sheet
    await admin.firestore().collection('publishedCallSheets').doc(callSheetId).set(publishedCallSheet);

    console.log(`📋 [PUBLISH CALL SHEET] Call sheet published successfully: ${callSheetId}`);

    return createSuccessResponse({
      callSheetId,
      publicId: publishedCallSheet.publicId,
      publishedAt: publishedCallSheet.publishedAt,
      expiresAt: publishedCallSheet.expiresAt
    }, 'Call sheet published successfully');

  } catch (error: any) {
    console.error('❌ [PUBLISH CALL SHEET] Error:', error);
    return handleError(error, 'publishCallSheet');
  }
}

// HTTP function for UniversalFirebaseInterceptor
export const publishCallSheet = functions.https.onRequest(async (req: any, res: any) => {
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

    const result = await publishCallSheetLogic(req.body);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error: any) {
    console.error('❌ [PUBLISH CALL SHEET HTTP] Error:', error);
    res.status(500).json(createErrorResponse('Failed to publish call sheet', error instanceof Error ? error.message : String(error)));
  }
});

// Callable function for direct Firebase usage
export const publishCallSheetCallable = functions.https.onCall(async (data: any, context: any) => {
  return await publishCallSheetLogic(data, context);
});

function generatePublicId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}