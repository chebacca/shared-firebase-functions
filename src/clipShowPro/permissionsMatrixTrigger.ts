/**
 * Permissions Matrix Trigger
 * 
 * Automatically syncs Permissions Matrix (userPagePermissions) updates to Firebase Auth claims.
 * When an admin updates permissions in the Permissions Matrix, this trigger ensures
 * the user's Firebase Auth claims are updated immediately.
 * 
 * Users just need to refresh or logout/login to get the new token with updated claims.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { updateClipShowProClaimsInternal } from './clipShowProUpdateClaims';

const auth = getAuth();
const db = getFirestore();

const ORGANIZATION_ID = 'clip-show-pro-productions';

/**
 * Sync permissions from Permissions Matrix to Firebase Auth claims
 */
async function syncPermissionsToClaims(
  matrixData: any,
  userId: string
): Promise<void> {
  try {
    // Verify user exists in Firebase Auth
    let userRecord;
    try {
      userRecord = await auth.getUser(userId);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        console.log(`⚠️ [PermissionsMatrixTrigger] User ${userId} not found in Firebase Auth, skipping`);
        return;
      }
      throw error;
    }

    // Build pagePermissions array from matrix data
    const pagePermissions = (matrixData.permissions || []).map((perm: any) => ({
      pageId: perm.pageId,
      read: perm.read || false,
      write: perm.write || false,
    }));

    // Get user role
    const userRole = matrixData.userRole || userRecord.customClaims?.role || 'CONTACT';

    // Update claims using the centralized update function
    await updateClipShowProClaimsInternal({
      uid: userId,
      role: userRole,
      organizationId: matrixData.organizationId || ORGANIZATION_ID,
      pagePermissions: pagePermissions.length > 0 ? pagePermissions : undefined,
      preserveExistingClaims: true,
    });

    console.log(`✅ [PermissionsMatrixTrigger] Synced claims for user ${userId} (${userRecord.email || 'no email'})`);
    console.log(`   Role: ${userRole}, Pages: ${pagePermissions.length}`);
  } catch (error: any) {
    console.error(`❌ [PermissionsMatrixTrigger] Error syncing claims for ${userId}:`, error.message);
    // Don't throw - we don't want to fail the Firestore write
    // The admin can manually sync if needed
  }
}

/**
 * Firestore trigger: When Permissions Matrix document is created or updated
 */
export const onPermissionsMatrixUpdate = onDocumentWritten(
  'userPagePermissions/{docId}',
  async (event) => {
    try {
      const after = event.data?.after;
      const before = event.data?.before;

      // Skip if document was deleted
      if (!after || !after.exists) {
        console.log(`ℹ️ [PermissionsMatrixTrigger] Document deleted, skipping`);
        return;
      }

      const matrixData = after.data();
      const docId = event.params.docId;

      // Only process documents for the Clip Show Pro organization
      if (matrixData.organizationId !== ORGANIZATION_ID) {
        console.log(`ℹ️ [PermissionsMatrixTrigger] Document not for ${ORGANIZATION_ID}, skipping`);
        return;
      }

      // Get Firebase UID from the document
      const firebaseUid = matrixData.firebaseUid || matrixData.userId;

      if (!firebaseUid) {
        console.log(`⚠️ [PermissionsMatrixTrigger] No firebaseUid or userId in document ${docId}, skipping`);
        return;
      }

      // Check if permissions actually changed (to avoid unnecessary updates)
      if (before?.exists) {
        const beforeData = before.data();
        const beforePerms = JSON.stringify(beforeData.permissions || []);
        const afterPerms = JSON.stringify(matrixData.permissions || []);
        
        if (beforePerms === afterPerms && beforeData.userRole === matrixData.userRole) {
          console.log(`ℹ️ [PermissionsMatrixTrigger] Permissions unchanged for ${docId}, skipping`);
          return;
        }
      }

      console.log(`🔄 [PermissionsMatrixTrigger] Permissions Matrix updated for document ${docId}`);
      console.log(`   User: ${matrixData.userName || matrixData.userEmail || firebaseUid}`);
      console.log(`   Firebase UID: ${firebaseUid}`);

      // Sync to Firebase Auth claims
      await syncPermissionsToClaims(matrixData, firebaseUid);

      console.log(`✅ [PermissionsMatrixTrigger] Successfully processed document ${docId}`);
    } catch (error: any) {
      console.error(`❌ [PermissionsMatrixTrigger] Error processing trigger:`, error.message);
      // Don't throw - we don't want to fail the Firestore write
    }
  }
);














