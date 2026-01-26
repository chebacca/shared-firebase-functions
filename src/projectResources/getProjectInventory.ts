/**
 * Get Project Inventory Function
 * 
 * Retrieves all inventory items assigned to a project
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { isProjectMember } from '../shared/projectPermissions';

export const getProjectInventory = onCall(
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

      const { projectId, includeReturned = false } = request.data;

      if (!projectId) {
        throw new HttpsError('invalid-argument', 'Project ID is required');
      }

      const userId = request.auth.uid;

      // Verify user has access to project
      const isMember = await isProjectMember(userId, projectId);
      if (!isMember) {
        throw new HttpsError('permission-denied', 'You do not have access to this project');
      }

      // Get project to verify organization
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      // Get all inventory assignments for this project
      let assignmentsQuery = db.collection('projectInventoryAssignments')
        .where('projectId', '==', projectId)
        .where('isActive', '==', true);

      if (!includeReturned) {
        assignmentsQuery = assignmentsQuery.where('status', '==', 'ACTIVE');
      }

      const assignmentsSnapshot = await assignmentsQuery.get();

      const inventoryItems = [];

      // Fetch inventory details for each assignment
      for (const assignmentDoc of assignmentsSnapshot.docs) {
        const assignmentData = assignmentDoc.data();
        const inventoryItemId = assignmentData.inventoryItemId;

        // Get inventory item details
        const inventoryDoc = await db.collection('inventoryItems').doc(inventoryItemId).get();
        if (inventoryDoc.exists) {
          const inventoryData = inventoryDoc.data();
          inventoryItems.push({
            assignmentId: assignmentDoc.id,
            inventoryId: inventoryItemId,
            ...inventoryData,
            assignmentType: assignmentData.assignmentType,
            assignedAt: assignmentData.assignedAt,
            assignedBy: assignmentData.assignedBy,
            expectedReturnDate: assignmentData.expectedReturnDate,
            actualReturnDate: assignmentData.actualReturnDate,
            checkoutNotes: assignmentData.checkoutNotes,
            returnNotes: assignmentData.returnNotes,
            status: assignmentData.status,
            isOverdue: assignmentData.expectedReturnDate && 
                      assignmentData.expectedReturnDate.toDate() < new Date() && 
                      assignmentData.status === 'ACTIVE',
          });
        }
      }

      console.log(`✅ [PROJECT INVENTORY] Retrieved ${inventoryItems.length} inventory items for project ${projectId}`);

      return {
        success: true,
        data: inventoryItems,
        count: inventoryItems.length,
        projectId,
      };
    } catch (error: any) {
      console.error('❌ [PROJECT INVENTORY] Error getting project inventory:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to get project inventory');
    }
  }
);

