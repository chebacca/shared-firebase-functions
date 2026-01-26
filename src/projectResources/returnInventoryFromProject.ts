/**
 * Return Inventory from Project Function
 * 
 * Returns inventory items from a project back to organization pool
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { canCheckoutInventory } from '../shared/projectPermissions';
import * as admin from 'firebase-admin';

export const returnInventoryFromProject = onCall(
  {
    cors: true,
    cpu: 0.5,
    memory: '512MiB',
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { assignmentId, inventoryItemId, projectId, returnNotes } = request.data;

      if (!assignmentId && (!inventoryItemId || !projectId)) {
        throw new HttpsError('invalid-argument', 'Either assignmentId or both inventoryItemId and projectId are required');
      }

      const userId = request.auth.uid;

      let assignmentRef;
      let assignmentDoc;

      if (assignmentId) {
        // Use assignment ID directly
        assignmentRef = db.collection('projectInventoryAssignments').doc(assignmentId);
        assignmentDoc = await assignmentRef.get();
      } else {
        // Find active assignment by inventoryItemId and projectId
        const assignmentQuery = await db.collection('projectInventoryAssignments')
          .where('inventoryItemId', '==', inventoryItemId)
          .where('projectId', '==', projectId)
          .where('status', '==', 'ACTIVE')
          .where('isActive', '==', true)
          .limit(1)
          .get();

        if (assignmentQuery.empty) {
          throw new HttpsError('not-found', 'Active inventory assignment not found');
        }

        assignmentRef = db.collection('projectInventoryAssignments').doc(assignmentQuery.docs[0].id);
        assignmentDoc = assignmentQuery.docs[0];
      }

      if (!assignmentDoc.exists) {
        throw new HttpsError('not-found', 'Inventory assignment not found');
      }

      const assignmentData = assignmentDoc.data();
      const assignmentProjectId = assignmentData?.projectId;
      const itemId = assignmentData?.inventoryItemId;

      // Verify user has permission
      const canReturn = await canCheckoutInventory(userId, itemId, assignmentProjectId);
      if (!canReturn) {
        throw new HttpsError('permission-denied', 'You do not have permission to return inventory from this project');
      }

      // Update assignment status
      await assignmentRef.update({
        status: 'RETURNED',
        actualReturnDate: admin.firestore.FieldValue.serverTimestamp(),
        returnNotes: returnNotes || null,
        returnedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update inventory item status back to ACTIVE
      await db.collection('inventoryItems').doc(itemId).update({
        status: 'ACTIVE',
        checkedOutBy: null,
        checkedOutAt: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`✅ [PROJECT INVENTORY] Returned item ${itemId} from project ${assignmentProjectId}`);

      return {
        success: true,
        message: 'Inventory item returned from project successfully',
      };
    } catch (error: any) {
      console.error('❌ [PROJECT INVENTORY] Error returning inventory:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to return inventory from project');
    }
  }
);

