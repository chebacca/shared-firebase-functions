/**
 * Update Org Hierarchy Relationship Function
 * 
 * Updates an existing organizational hierarchy relationship
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import type { UpdateOrgHierarchyRelationshipRequest, OrgHierarchyRelationship } from 'shared-firebase-types';

const db = getFirestore();

export const updateOrgHierarchyRelationship = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { relationshipId, ...updateData } = request.data as UpdateOrgHierarchyRelationshipRequest & { relationshipId: string };
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!relationshipId) {
        throw new Error('Relationship ID is required');
      }

      // Get the relationship
      const relationshipRef = db.collection('orgHierarchy').doc(relationshipId);
      const relationshipDoc = await relationshipRef.get();

      if (!relationshipDoc.exists) {
        throw new Error('Relationship not found');
      }

      const relationship = relationshipDoc.data() as OrgHierarchyRelationship;

      // Get user's organization from claims
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Verify user has access to this organization
      if (relationship.organizationId !== userOrgId) {
        throw new Error('Access denied: Cannot update relationships for other organization');
      }

      // If updating managerId, verify the new manager exists and belongs to the organization
      if (updateData.managerId && updateData.managerId !== relationship.managerId) {
        if (updateData.managerId === relationship.employeeId) {
          throw new Error('Employee cannot report to themselves');
        }

        const newManagerDoc = await db.collection('teamMembers').doc(updateData.managerId).get();
        
        if (!newManagerDoc.exists) {
          throw new Error(`Manager with ID ${updateData.managerId} not found`);
        }

        const newManagerData = newManagerDoc.data();
        if (newManagerData?.organizationId !== relationship.organizationId) {
          throw new Error('New manager does not belong to the same organization');
        }
      }

      // Build update object
      const updates: Partial<OrgHierarchyRelationship> = {
        updatedAt: FieldValue.serverTimestamp() as any
      };

      if (updateData.managerId !== undefined) updates.managerId = updateData.managerId;
      if (updateData.department !== undefined) updates.department = updateData.department;
      if (updateData.position !== undefined) updates.position = updateData.position;
      if (updateData.assignmentReason !== undefined) updates.assignmentReason = updateData.assignmentReason;
      if (updateData.notes !== undefined) updates.notes = updateData.notes;
      if (updateData.isActive !== undefined) updates.isActive = updateData.isActive;
      if (updateData.endDate !== undefined) {
        updates.endDate = updateData.endDate ? Timestamp.fromDate(new Date(updateData.endDate)) : undefined;
      }

      await relationshipRef.update(updates);

      // Get updated relationship
      const updatedDoc = await relationshipRef.get();
      const updatedData = updatedDoc.data() as OrgHierarchyRelationship;
      const updatedRelationship: OrgHierarchyRelationship = {
        ...updatedData,
        id: updatedDoc.id
      };

      console.log(`✅ [UPDATE ORG HIERARCHY] Updated relationship: ${relationshipId}`);

      return createSuccessResponse(updatedRelationship, 'Organizational hierarchy relationship updated successfully');

    } catch (error: any) {
      console.error('❌ [UPDATE ORG HIERARCHY] Error:', error);
      return handleError(error, 'updateOrgHierarchyRelationship');
    }
  }
);
