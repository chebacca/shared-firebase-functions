/**
 * Create Timecard Assignment Function
 * 
 * Assigns a timecard template to a user/project
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const createTimecardAssignment = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { userId, templateId, projectId, organizationId: providedOrgId, isActive = true } = request.data;
      const authUserId = request.auth?.uid;

      if (!authUserId) {
        throw new Error('Authentication required');
      }

      if (!userId || !templateId) {
        throw new Error('User ID and Template ID are required');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(authUserId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Use provided orgId or user's orgId
      const organizationId = providedOrgId || userOrgId;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Verify user has access to this organization
      if (providedOrgId && providedOrgId !== userOrgId) {
        throw new Error('Access denied: Cannot create assignments in other organization');
      }

      console.log(`⏰ [CREATE TIMECARD ASSIGNMENT] Assigning template ${templateId} to user ${userId} in org: ${organizationId}`);

      // Verify template exists
      const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
      if (!templateDoc.exists) {
        throw new Error('Timecard template not found');
      }

      // Verify user exists
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        throw new Error('User not found');
      }

      // Check if assignment already exists
      let query = db.collection('timecardAssignments')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId)
        .where('templateId', '==', templateId);

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      } else {
        query = query.where('projectId', '==', null);
      }

      const existingQuery = await query.limit(1).get();

      if (!existingQuery.empty) {
        // Update existing assignment
        const existingDoc = existingQuery.docs[0];
        await existingDoc.ref.update({
          isActive: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: authUserId
        });

        const updatedData = (await existingDoc.ref.get()).data();
        console.log(`✅ [CREATE TIMECARD ASSIGNMENT] Updated existing assignment`);

        return createSuccessResponse({
          id: existingDoc.id,
          userId,
          templateId,
          projectId: projectId || null,
          organizationId,
          isActive: true,
          ...updatedData
        }, 'Timecard assignment updated successfully');
      }

      // Create new assignment
      const assignmentData = {
        userId,
        templateId,
        projectId: projectId || null,
        organizationId,
        isActive,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: authUserId
      };

      const newDocRef = await db.collection('timecardAssignments').add(assignmentData);
      const newDoc = await newDocRef.get();

      console.log(`✅ [CREATE TIMECARD ASSIGNMENT] Created assignment: ${newDocRef.id}`);

      return createSuccessResponse({
        id: newDocRef.id,
        userId,
        templateId,
        projectId: projectId || null,
        organizationId,
        isActive,
        ...newDoc.data()
      }, 'Timecard assignment created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD ASSIGNMENT] Error:', error);
      return handleError(error, 'createTimecardAssignment');
    }
  }
);

