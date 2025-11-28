/**
 * Get Direct Reports Function
 * 
 * Retrieves direct reports for a manager in an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getDirectReports = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId, managerId } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      if (!managerId) {
        throw new Error('Manager ID is required');
      }

      console.log(`⏰ [GET DIRECT REPORTS] Getting direct reports for manager: ${managerId} in org: ${organizationId}`);

      // Get team members who report to this manager
      const teamMembersQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('managerId', '==', managerId)
        .where('isActive', '==', true)
        .get();

      const directReports = [];
      
      for (const doc of teamMembersQuery.docs) {
        const teamMember = doc.data();
        
        // Get user details from users collection
        const userDoc = await db.collection('users').doc(teamMember.userId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            directReports.push({
              id: teamMember.userId,
              email: userData.email,
              displayName: userData.displayName || userData.name,
              role: teamMember.role,
              teamMemberRole: teamMember.teamMemberRole,
              isActive: teamMember.isActive,
              createdAt: teamMember.createdAt,
              managerId: teamMember.managerId
            });
          }
        }
      }

      console.log(`⏰ [GET DIRECT REPORTS] Found ${directReports.length} direct reports`);

      return createSuccessResponse({
        directReports,
        count: directReports.length,
        organizationId,
        managerId
      }, 'Direct reports retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET DIRECT REPORTS] Error:', error);
      return handleError(error, 'getDirectReports');
    }
  }
);

// HTTP function
export const getDirectReportsHttp = onRequest(
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

      const { organizationId, managerId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      if (!managerId) {
        res.status(400).json(createErrorResponse('Manager ID is required'));
        return;
      }

      console.log(`⏰ [GET DIRECT REPORTS HTTP] Getting direct reports for manager: ${managerId} in org: ${organizationId}`);

      // Get team members who report to this manager
      const teamMembersQuery = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .where('managerId', '==', managerId)
        .where('isActive', '==', true)
        .get();

      const directReports = [];
      
      for (const doc of teamMembersQuery.docs) {
        const teamMember = doc.data();
        
        // Get user details from users collection
        const userDoc = await db.collection('users').doc(teamMember.userId).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData) {
            directReports.push({
              id: teamMember.userId,
              email: userData.email,
              displayName: userData.displayName || userData.name,
              role: teamMember.role,
              teamMemberRole: teamMember.teamMemberRole,
              isActive: teamMember.isActive,
              createdAt: teamMember.createdAt,
              managerId: teamMember.managerId
            });
          }
        }
      }

      console.log(`⏰ [GET DIRECT REPORTS HTTP] Found ${directReports.length} direct reports`);

      res.status(200).json(createSuccessResponse({
        directReports,
        count: directReports.length,
        organizationId,
        managerId
      }, 'Direct reports retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET DIRECT REPORTS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getDirectReportsHttp'));
    }
  }
);
