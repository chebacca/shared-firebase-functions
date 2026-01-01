/**
 * Create Direct Report Function
 * 
 * Creates a direct report relationship between a manager and employee
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const createDirectReport = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { employeeId, managerId, organizationId: providedOrgId, canApproveTimecards = true } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      if (!employeeId || !managerId) {
        throw new Error('Employee ID and Manager ID are required');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Use provided orgId or user's orgId
      const organizationId = providedOrgId || userOrgId;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Verify user has access to this organization
      if (providedOrgId && providedOrgId !== userOrgId) {
        throw new Error('Access denied: Cannot create direct reports in other organization');
      }

      console.log(`⏰ [CREATE DIRECT REPORT] Creating direct report: ${employeeId} -> ${managerId} in org: ${organizationId}`);

      // Verify employee exists
      const employeeDoc = await db.collection('users').doc(employeeId).get();
      if (!employeeDoc.exists) {
        throw new Error('Employee not found');
      }

      // Verify manager exists
      const managerDoc = await db.collection('users').doc(managerId).get();
      if (!managerDoc.exists) {
        throw new Error('Manager not found');
      }

      // Check if relationship already exists
      const existingQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', employeeId)
        .where('managerId', '==', managerId)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        // Update existing relationship
        const existingDoc = existingQuery.docs[0];
        await existingDoc.ref.update({
          isActive: true,
          canApproveTimecards,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userId
        });

        const updatedData = (await existingDoc.ref.get()).data();
        console.log(`✅ [CREATE DIRECT REPORT] Updated existing direct report relationship`);

        return createSuccessResponse({
          id: existingDoc.id,
          employeeId,
          managerId,
          organizationId,
          canApproveTimecards,
          isActive: true,
          ...updatedData
        }, 'Direct report relationship updated successfully');
      }

      // Create new relationship
      const teamMemberData = {
        userId: employeeId,
        managerId,
        organizationId,
        role: 'member',
        teamMemberRole: 'member',
        isActive: true,
        canApproveTimecards,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId
      };

      const newDocRef = await db.collection('teamMembers').add(teamMemberData);
      const newDoc = await newDocRef.get();

      console.log(`✅ [CREATE DIRECT REPORT] Created direct report relationship: ${newDocRef.id}`);

      return createSuccessResponse({
        id: newDocRef.id,
        employeeId,
        managerId,
        organizationId,
        canApproveTimecards,
        isActive: true,
        ...newDoc.data()
      }, 'Direct report relationship created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE DIRECT REPORT] Error:', error);
      return handleError(error, 'createDirectReport');
    }
  }
);

