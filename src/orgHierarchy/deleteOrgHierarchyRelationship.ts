/**
 * Delete Org Hierarchy Relationship Function
 * 
 * Deactivates an organizational hierarchy relationship (soft delete)
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const deleteOrgHierarchyRelationship = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { relationshipId } = request.data as { relationshipId: string };
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

      const relationship = relationshipDoc.data();

      // Get user's organization from claims
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Verify user has access to this organization
      if (relationship?.organizationId !== userOrgId) {
        throw new Error('Access denied: Cannot delete relationships for other organization');
      }

      // Soft delete by setting isActive to false
      await relationshipRef.update({
        isActive: false,
        endDate: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ [DELETE ORG HIERARCHY] Deactivated relationship: ${relationshipId}`);

      return createSuccessResponse({ id: relationshipId, deleted: true }, 'Organizational hierarchy relationship deactivated successfully');

    } catch (error: any) {
      console.error('❌ [DELETE ORG HIERARCHY] Error:', error);
      return handleError(error, 'deleteOrgHierarchyRelationship');
    }
  }
);
