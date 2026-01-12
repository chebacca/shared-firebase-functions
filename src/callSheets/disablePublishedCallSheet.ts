import * as functions from 'firebase-functions';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// Shared business logic function
export async function disablePublishedCallSheetLogic(data: any, context?: any): Promise<any> {
  try {
    const { callSheetId, organizationId, userId } = data;

    if (!callSheetId) {
      return createErrorResponse('Call sheet ID is required');
    }

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    console.log(`📋 [DISABLE PUBLISHED CALL SHEET] Disabling call sheet: ${callSheetId}`);

    // Try to find published call sheet by callSheetId field (not document ID)
    // First, try to find by callSheetId field
    let publishedCallSheetQuery = await admin.firestore()
      .collection('publishedCallSheets')
      .where('callSheetId', '==', callSheetId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    // If not found by callSheetId field, try document ID as fallback
    if (publishedCallSheetQuery.empty) {
      const publishedCallSheetDoc = await admin.firestore().collection('publishedCallSheets').doc(callSheetId).get();
      if (publishedCallSheetDoc.exists) {
        // Verify organization access
        const docData = publishedCallSheetDoc.data();
        if (docData?.organizationId !== organizationId) {
          return createErrorResponse('Published call sheet not in organization');
        }
        // Update using document ID
        await admin.firestore().collection('publishedCallSheets').doc(callSheetId).update({
          isPublished: false,
          isActive: false, // Also set isActive to false for consistency
          disabledAt: admin.firestore.Timestamp.now(),
          disabledBy: userId || (context?.auth?.uid || 'system')
        });
        console.log(`📋 [DISABLE PUBLISHED CALL SHEET] Call sheet disabled successfully: ${callSheetId}`);
        return createSuccessResponse({
          callSheetId,
          disabledAt: admin.firestore.Timestamp.now()
        }, 'Published call sheet disabled successfully');
      } else {
        return createErrorResponse('Published call sheet not found');
      }
    }

    // Found by callSheetId field - get the document
    const publishedCallSheetDoc = publishedCallSheetQuery.docs[0];
    const publishedCallSheetData = publishedCallSheetDoc.data();
    const publishedCallSheetDocId = publishedCallSheetDoc.id;

    // Verify organization access (already filtered by query, but double-check)
    if (publishedCallSheetData?.organizationId !== organizationId) {
      return createErrorResponse('Published call sheet not in organization');
    }

    // Update published call sheet to disabled using the actual document ID
    await admin.firestore().collection('publishedCallSheets').doc(publishedCallSheetDocId).update({
      isPublished: false,
      isActive: false, // Also set isActive to false for consistency
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

// HTTP function for UniversalFirebaseInterceptor (v2 API)
export const disablePublishedCallSheet = onRequest(
  {
    region: 'us-central1',
    cors: true,
  },
  async (req: any, res: any) => {
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
  }
);

// Callable function for direct Firebase usage (v2 API with CORS support)
export const disablePublishedCallSheetCallable = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: true,         // Enable CORS support
  },
  async (request) => {
    // Verify authentication (even though invoker is public, we still require auth for the actual request)
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required to disable published call sheets'
      );
    }

    // Convert v2 request to v1-compatible context format
    const context = {
      auth: {
        uid: request.auth.uid,
        token: request.auth.token
      }
    };
    return await disablePublishedCallSheetLogic(request.data, context);
  }
);