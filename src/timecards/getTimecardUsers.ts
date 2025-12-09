/**
 * Get Timecard Users Function
 * 
 * Retrieves users who can submit timecards for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getTimecardUsers = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: [
      'http://localhost:4003',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://backbone-client.web.app',
      'https://backbone-logic.web.app'
    ]
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { organizationId } = request.data;
      const callerId = request.auth.uid;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(callerId, organizationId));
      if (!hasAccess) {
        // Also check if user is admin/owner via custom claims as a fallback/bypass
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;

        // Check for special enterprise access if applicable
        const isEnterprise = token.email === 'enterprise.user@enterprisemedia.com' &&
          (organizationId === 'enterprise-media-org' || organizationId === 'enterprise-org-001');

        if (!isAdmin && !isEnterprise) {
          console.warn(`🚨 [GET TIMECARD USERS] Security violation: User ${callerId} attempted to access org ${organizationId} without access`);
          throw new Error('Permission denied: You do not have access to this organization');
        }
      }

      console.log(`⏰ [GET TIMECARD USERS] Getting users for org: ${organizationId} (caller: ${callerId})`);

      // Get team members for the organization
      const teamMembersQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      const users = [];

      for (const doc of teamMembersQuery.docs) {
        const teamMember = doc.data();

        // Get user details from users collection
        const userDoc = await db.collection('users').doc(teamMember.userId).get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            users.push({
              id: teamMember.userId,
              email: userData.email,
              displayName: userData.displayName || userData.name,
              role: teamMember.role,
              teamMemberRole: teamMember.teamMemberRole,
              isActive: teamMember.isActive,
              createdAt: teamMember.createdAt
            });
          }
        }
      }

      console.log(`⏰ [GET TIMECARD USERS] Found ${users.length} users`);

      return createSuccessResponse({
        users,
        count: users.length,
        organizationId
      }, 'Timecard users retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD USERS] Error:', error);
      return handleError(error, 'getTimecardUsers');
    }
  }
);

// HTTP function
export const getTimecardUsersHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      // Set CORS headers
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET TIMECARD USERS HTTP] Getting users for org: ${organizationId}`);

      // Get team members for the organization
      const teamMembersQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      const users = [];

      for (const doc of teamMembersQuery.docs) {
        const teamMember = doc.data();

        // Get user details from users collection
        const userDoc = await db.collection('users').doc(teamMember.userId).get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            users.push({
              id: teamMember.userId,
              email: userData.email,
              displayName: userData.displayName || userData.name,
              role: teamMember.role,
              teamMemberRole: teamMember.teamMemberRole,
              isActive: teamMember.isActive,
              createdAt: teamMember.createdAt
            });
          }
        }
      }

      console.log(`⏰ [GET TIMECARD USERS HTTP] Found ${users.length} users`);

      res.status(200).json(createSuccessResponse({
        users,
        count: users.length,
        organizationId
      }, 'Timecard users retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET TIMECARD USERS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getTimecardUsersHttp'));
    }
  }
);
