/**
 * Get Inventory Availability Function
 * 
 * Checks which inventory items are available (not checked out) for assignment
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { validateOrganizationAccess } from '../shared/utils';

export const getInventoryAvailability = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { organizationId, inventoryItemIds } = request.data;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      const userId = request.auth.uid;

      // Verify user has access to organization
      const hasAccess = await validateOrganizationAccess(userId, organizationId);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'You do not have access to this organization');
      }

      // Get all active inventory assignments for the organization
      const activeAssignmentsQuery = await db.collection('projectInventoryAssignments')
        .where('organizationId', '==', organizationId)
        .where('status', '==', 'ACTIVE')
        .where('isActive', '==', true)
        .get();

      // Create a set of checked-out inventory item IDs
      const checkedOutItemIds = new Set(
        activeAssignmentsQuery.docs.map(doc => doc.data().inventoryItemId)
      );

      // If specific item IDs were requested, check their availability
      if (inventoryItemIds && Array.isArray(inventoryItemIds)) {
        const availability = inventoryItemIds.map(itemId => ({
          inventoryItemId: itemId,
          isAvailable: !checkedOutItemIds.has(itemId),
        }));

        return {
          success: true,
          data: availability,
          checkedOutCount: inventoryItemIds.filter(id => checkedOutItemIds.has(id)).length,
          availableCount: inventoryItemIds.filter(id => !checkedOutItemIds.has(id)).length,
        };
      }

      // Otherwise, get all inventory items for the organization
      const inventoryQuery = await db.collection('inventoryItems')
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['ACTIVE', 'CHECKED_OUT'])
        .get();

      const availability = inventoryQuery.docs.map(doc => {
        const itemData = doc.data();
        const itemId = doc.id;
        const isCheckedOut = checkedOutItemIds.has(itemId);

        // If checked out, get assignment details
        let assignmentInfo = null;
        if (isCheckedOut) {
          const assignment = activeAssignmentsQuery.docs.find(
            a => a.data().inventoryItemId === itemId
          );
          if (assignment) {
            const assignmentData = assignment.data();
            assignmentInfo = {
              projectId: assignmentData.projectId,
              assignedAt: assignmentData.assignedAt,
              expectedReturnDate: assignmentData.expectedReturnDate,
            };
          }
        }

        return {
          inventoryItemId: itemId,
          ...itemData,
          isAvailable: !isCheckedOut,
          assignmentInfo,
        };
      });

      const availableCount = availability.filter(item => item.isAvailable).length;
      const checkedOutCount = availability.filter(item => !item.isAvailable).length;

      console.log(`✅ [INVENTORY AVAILABILITY] Found ${availableCount} available, ${checkedOutCount} checked out`);

      return {
        success: true,
        data: availability,
        availableCount,
        checkedOutCount,
        totalCount: availability.length,
      };
    } catch (error: any) {
      console.error('❌ [INVENTORY AVAILABILITY] Error getting availability:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to get inventory availability');
    }
  }
);

