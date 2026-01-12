import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse } from '../../shared/utils';

export class CallSheetActions {
    /**
     * Duplicates a call sheet by ID, creating a fresh copy with a new ID
     * @param callSheetId ID of the call sheet to duplicate
     * @param organizationId Organization context
     * @param userId User performing the action
     */
    static async duplicateCallSheet(callSheetId: string, organizationId: string, userId: string): Promise<any> {
        console.log(`📋 [ACTION] Duplicating call sheet ${callSheetId}`);

        try {
            // 1. Fetch original call sheet
            // Try dailyCallSheets first (dashboard)
            let doc = await admin.firestore().collection('dailyCallSheets').doc(callSheetId).get();
            let data = doc.exists ? doc.data() : null;
            let collectionName = 'dailyCallSheets';

            // If not found, try standalone callSheets
            if (!doc.exists) {
                doc = await admin.firestore().collection('callSheets').doc(callSheetId).get();
                data = doc.exists ? doc.data() : null;
                collectionName = 'callSheets';
            }

            if (!data) {
                // Try to find in daily records as a fallback
                const dailyRecordsQuery = await admin.firestore()
                    .collection('dailyCallSheetRecords')
                    .where('callSheetData.id', '==', callSheetId)
                    .limit(1)
                    .get();

                if (!dailyRecordsQuery.empty) {
                    data = dailyRecordsQuery.docs[0].data().callSheetData;
                    collectionName = 'dailyCallSheets'; // Assume it goes back here
                }
            }

            if (!data) return { success: false, error: 'Call sheet not found' };

            // 2. Prepare new data
            const newId = admin.firestore().collection(collectionName).doc().id;
            const now = admin.firestore.Timestamp.now();

            // Deep copy and clean
            const newData = {
                ...data,
                id: newId,
                title: `${data.title || data.projectName} (Copy)`,
                createdAt: now,
                updatedAt: now,
                createdBy: userId,
                status: 'draft', // Reset status
                publishedAt: null,
                isPublished: false,
                accessCode: null, // Clear public access
                publicId: null,
                // Clean up specific fields that shouldn't be copied if needed
            };

            // 3. Save new call sheet
            await admin.firestore().collection(collectionName).doc(newId).set(newData);

            return {
                success: true,
                data: {
                    originalId: callSheetId,
                    newId: newId,
                    link: collectionName === 'dailyCallSheets'
                        ? `/call-sheet/${newId}` // Dashboard pattern
                        : `/sheet/${newId}`,      // Standalone pattern
                    message: `Successfully duplicated call sheet. New ID: ${newId}`
                }
            };
        } catch (error: any) {
            console.error('❌ [ACTION] Error duplicating call sheet:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Publishes a call sheet
     * Delegates to the existing publishCallSheet logic via internal call or code reuse
     */
    static async publishCallSheet(callSheetId: string, organizationId: string, userId: string, baseUrl: string): Promise<any> {
        console.log(`📋 [ACTION] Publishing call sheet ${callSheetId}`);

        // We can import the logic directly if it's exported, or call the cloud function
        // For now, let's try to assume we can direct invoke the logic if we refactor,
        // but given the file structure, we might need to import `publishCallSheetLogic` if we exported it
        // Or simply reimplement the wrapper here which is safer to avoid circular deps if not careful.

        // Let's rely on the existence of the `publishedCallSheets` collection approach 
        // essentially mirroring `publishCallSheet.ts` but streamlined for AI execution.

        // ACTUALLY: The best way is to import the logic from `src/callSheets/publishCallSheet.ts`
        // But since that file is an index-style export, let's see if we can just import the logic.
        // I checked `publishCallSheet.ts` and `publishCallSheetLogic` is NOT exported.
        // I will RECOMMEND exporting it in a future step, but for now I will implement a "passthrough" 
        // or effectively re-implement the core "set to published" update which triggers valid system events.

        try {
            // For now, let's just trigger the HTTP function or doing the write directly?
            // Direct write is faster and we are in the same admin context.

            // ... Wait, the user specifically asked for "publish the new duplicate".
            // The `src/callSheets/publishCallSheet.ts` is complex (emails, notifications).
            // We should definitely REUSE it.

            // Plan: I will MODIFY `src/callSheets/publishCallSheet.ts` to export `publishCallSheetLogic`
            // so I can call it here.

            return { success: false, error: "Publish logic requires linking. Please standby." };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Unpublishes a call sheet
     */
    static async unpublishCallSheet(callSheetId: string, organizationId: string, userId: string): Promise<any> {
        console.log(`📋 [ACTION] Unpublishing call sheet ${callSheetId}`);
        try {
            // Dynamic import to avoid circular dependencies
            const { disablePublishedCallSheetLogic } = await import('../../callSheets/disablePublishedCallSheet');

            const result = await disablePublishedCallSheetLogic({
                callSheetId,
                organizationId,
                userId
            });

            return result;
        } catch (error: any) {
            console.error('❌ [ACTION] Error unpublishing call sheet:', error);
            return { success: false, error: error.message };
        }
    }
}
