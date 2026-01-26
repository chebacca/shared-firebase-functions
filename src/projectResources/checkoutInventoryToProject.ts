/**
 * Checkout Inventory to Project Function
 * 
 * Checks out inventory items to a project with tracking
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { canCheckoutInventory } from '../shared/projectPermissions';
import * as admin from 'firebase-admin';

export const checkoutInventoryToProject = onCall(
  {
    cors: true,
    cpu: 0.5,
    memory: '512MiB',
    region: 'us-central1',
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      const { projectId, inventoryItemId, assignedToUserId, assignmentType = 'CHECKED_OUT', expectedReturnDate, checkoutNotes } = request.data;

      if (!projectId || !inventoryItemId) {
        throw new HttpsError('invalid-argument', 'Project ID and Inventory Item ID are required');
      }

      const userId = request.auth.uid;

      // Verify user has permission to checkout inventory
      const canCheckout = await canCheckoutInventory(userId, inventoryItemId, projectId);
      if (!canCheckout) {
        throw new HttpsError('permission-denied', 'You do not have permission to checkout inventory to this project');
      }

      // Get project to verify organization
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (!projectDoc.exists) {
        throw new HttpsError('not-found', 'Project not found');
      }

      const projectData = projectDoc.data();
      const organizationId = projectData?.organizationId;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Project must have an organization ID');
      }

      // Get inventory item
      const inventoryDoc = await db.collection('inventoryItems').doc(inventoryItemId).get();
      if (!inventoryDoc.exists) {
        throw new HttpsError('not-found', 'Inventory item not found');
      }

      const inventoryData = inventoryDoc.data();
      if (inventoryData?.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Inventory item must belong to the same organization as the project');
      }

      // Check if item is already checked out to another project
      const activeAssignmentQuery = await db.collection('projectInventoryAssignments')
        .where('inventoryItemId', '==', inventoryItemId)
        .where('status', '==', 'ACTIVE')
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!activeAssignmentQuery.empty) {
        const existingAssignment = activeAssignmentQuery.docs[0].data();
        if (existingAssignment.projectId !== projectId) {
          throw new HttpsError('failed-precondition', `Item is already checked out to project: ${existingAssignment.projectId}`);
        }
        // If already checked out to this project, return existing assignment
        return {
          success: true,
          data: {
            assignmentId: activeAssignmentQuery.docs[0].id,
            ...existingAssignment,
          },
          message: 'Item is already checked out to this project',
        };
      }

      // Get assigned user details if provided
      let assignedUserName = null;
      let assignedUserEmail = null;
      if (assignedToUserId) {
        try {
          // First try teamMembers collection (this is what the frontend passes)
          const teamMemberDoc = await db.collection('teamMembers').doc(assignedToUserId).get();
          if (teamMemberDoc.exists) {
            const teamMemberData = teamMemberDoc.data();
            // Construct full name from firstName and lastName, or use name field
            const firstName = teamMemberData?.firstName || '';
            const lastName = teamMemberData?.lastName || '';
            assignedUserName = teamMemberData?.name || `${firstName} ${lastName}`.trim() || null;
            assignedUserEmail = teamMemberData?.email || null;
            console.log(`✅ [PROJECT INVENTORY] Found assigned user in teamMembers: ${assignedUserName}`);
          } else {
            // Fall back to users collection if not found in teamMembers
            console.log(`⚠️ [PROJECT INVENTORY] User ${assignedToUserId} not found in teamMembers, trying users collection`);
            const assignedUserDoc = await db.collection('users').doc(assignedToUserId).get();
            if (assignedUserDoc.exists) {
              const assignedUserData = assignedUserDoc.data();
              assignedUserName = assignedUserData?.displayName || assignedUserData?.name || null;
              assignedUserEmail = assignedUserData?.email || null;
              console.log(`✅ [PROJECT INVENTORY] Found assigned user in users: ${assignedUserName}`);
            } else {
              console.warn(`⚠️ [PROJECT INVENTORY] User ${assignedToUserId} not found in either teamMembers or users collection`);
            }
          }
        } catch (userError) {
          console.warn('❌ [PROJECT INVENTORY] Could not fetch assigned user details:', userError);
        }
      }

      // Create assignment document
      const assignmentData = {
        projectId,
        organizationId,
        inventoryItemId,
        assignmentType,
        assignedBy: userId,
        assignedToUserId: assignedToUserId || null,
        assignedUserName: assignedUserName || null,
        assignedUserEmail: assignedUserEmail || null,
        assignedAt: admin.firestore.FieldValue.serverTimestamp(),
        expectedReturnDate: expectedReturnDate ? admin.firestore.Timestamp.fromDate(new Date(expectedReturnDate)) : null,
        checkoutNotes: checkoutNotes || null,
        status: 'ACTIVE',
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const assignmentRef = await db.collection('projectInventoryAssignments').add(assignmentData);

      // Update inventory item status
      const inventoryUpdate: any = {
        status: 'CHECKED_OUT',
        projectId: projectId,
        checkedOutBy: userId,
        checkedOutAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Add assigned user info if provided
      if (assignedToUserId) {
        inventoryUpdate.assignedTo = assignedToUserId;
        inventoryUpdate['specifications.assignedUserId'] = assignedToUserId;
        inventoryUpdate['specifications.assignedUserName'] = assignedUserName;
        inventoryUpdate['specifications.checkoutStatus'] = 'CHECKED_OUT';
        inventoryUpdate['specifications.checkoutDate'] = admin.firestore.FieldValue.serverTimestamp();
      }

      await db.collection('inventoryItems').doc(inventoryItemId).update(inventoryUpdate);

      console.log(`✅ [PROJECT INVENTORY] Checked out item ${inventoryItemId} to project ${projectId}`);

      return {
        success: true,
        data: {
          assignmentId: assignmentRef.id,
          ...assignmentData,
        },
        message: 'Inventory item checked out to project successfully',
      };
    } catch (error: any) {
      console.error('❌ [PROJECT INVENTORY] Error checking out inventory:', error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', error.message || 'Failed to checkout inventory to project');
    }
  }
);

