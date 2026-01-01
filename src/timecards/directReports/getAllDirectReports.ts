/**
 * Get All Direct Reports Function
 * 
 * Retrieves all direct reports in an organization (not filtered by manager)
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../../shared/utils';

const db = getFirestore();

export const getAllDirectReports = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId: providedOrgId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
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
        throw new Error('Access denied: Cannot access other organization');
      }

      console.log(`⏰ [GET ALL DIRECT REPORTS] Getting all direct reports for org: ${organizationId}`);

      // Get all team members with managers (direct reports)
      const teamMembersQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('managerId', '!=', null)
        .where('isActive', '==', true)
        .get();

      const directReports = [];
      
      for (const doc of teamMembersQuery.docs) {
        const teamMember = doc.data();
        
        // Get user details
        const userDoc = await db.collection('users').doc(teamMember.userId).get();
        const managerDoc = teamMember.managerId ? await db.collection('users').doc(teamMember.managerId).get() : null;
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const managerData = managerDoc?.exists ? managerDoc.data() : null;
          
          if (userData) {
            directReports.push({
              id: teamMember.userId,
              email: userData.email,
              displayName: userData.displayName || userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
              firstName: userData.firstName,
              lastName: userData.lastName,
              role: teamMember.role,
              teamMemberRole: teamMember.teamMemberRole,
              isActive: teamMember.isActive,
              createdAt: teamMember.createdAt,
              managerId: teamMember.managerId,
              manager: managerData ? {
                id: teamMember.managerId,
                email: managerData.email,
                displayName: managerData.displayName || managerData.name || `${managerData.firstName || ''} ${managerData.lastName || ''}`.trim()
              } : null,
              canApproveTimecards: teamMember.canApproveTimecards !== false,
              effectiveDate: teamMember.createdAt || new Date().toISOString()
            });
          }
        }
      }

      console.log(`✅ [GET ALL DIRECT REPORTS] Found ${directReports.length} direct reports`);

      return createSuccessResponse({
        directReports,
        count: directReports.length,
        organizationId
      }, 'All direct reports retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET ALL DIRECT REPORTS] Error:', error);
      return handleError(error, 'getAllDirectReports');
    }
  }
);

