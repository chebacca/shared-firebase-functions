/**
 * Create Org Hierarchy Relationship Function
 * 
 * Creates a new organizational hierarchy relationship between a team member and their manager
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import type { CreateOrgHierarchyRelationshipRequest, OrgHierarchyRelationship } from 'shared-firebase-types';

const db = getFirestore();

export const createOrgHierarchyRelationship = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const data = request.data as CreateOrgHierarchyRelationshipRequest;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      const { organizationId, employeeId, managerId, department, position, assignmentReason, notes, effectiveDate } = data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      if (!employeeId || !managerId) {
        throw new Error('Employee ID and Manager ID are required');
      }

      if (employeeId === managerId) {
        throw new Error('Employee cannot report to themselves');
      }

      // Get user's organization from claims
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Verify user has access to this organization
      if (organizationId !== userOrgId) {
        throw new Error('Access denied: Cannot create relationships for other organization');
      }

      // Verify employee and manager exist and belong to the organization
      const [employeeDoc, managerDoc] = await Promise.all([
        db.collection('teamMembers').doc(employeeId).get(),
        db.collection('teamMembers').doc(managerId).get()
      ]);

      if (!employeeDoc.exists) {
        throw new Error(`Employee with ID ${employeeId} not found`);
      }

      if (!managerDoc.exists) {
        throw new Error(`Manager with ID ${managerId} not found`);
      }

      const employeeData = employeeDoc.data();
      const managerData = managerDoc.data();

      if (employeeData?.organizationId !== organizationId) {
        throw new Error('Employee does not belong to the specified organization');
      }

      if (managerData?.organizationId !== organizationId) {
        throw new Error('Manager does not belong to the specified organization');
      }

      // Check if relationship already exists
      const existingQuery = await db.collection('orgHierarchy')
        .where('organizationId', '==', organizationId)
        .where('employeeId', '==', employeeId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        throw new Error('An active organizational hierarchy relationship already exists for this employee');
      }

      // Create the relationship
      const relationshipData: Omit<OrgHierarchyRelationship, 'id'> = {
        organizationId,
        employeeId,
        managerId,
        department: department || employeeData?.department,
        position: position || employeeData?.position,
        effectiveDate: effectiveDate ? Timestamp.fromDate(new Date(effectiveDate)) : FieldValue.serverTimestamp(),
        isActive: true,
        assignedBy: userId,
        assignmentReason: assignmentReason || 'Organizational structure assignment',
        notes: notes,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const relationshipRef = await db.collection('orgHierarchy').add(relationshipData);

      console.log(`✅ [CREATE ORG HIERARCHY] Created relationship: ${relationshipRef.id} (${employeeId} -> ${managerId})`);

      // Return the created relationship with ID
      const createdRelationship: OrgHierarchyRelationship = {
        id: relationshipRef.id,
        ...relationshipData,
        effectiveDate: relationshipData.effectiveDate as any,
        createdAt: relationshipData.createdAt as any,
        updatedAt: relationshipData.updatedAt as any
      };

      return createSuccessResponse(createdRelationship, 'Organizational hierarchy relationship created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE ORG HIERARCHY] Error:', error);
      return handleError(error, 'createOrgHierarchyRelationship');
    }
  }
);
