/**
 * Authenticate Team Member Function
 * 
 * Authenticates a team member for call sheet access
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const authenticateTeamMember = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (request) => {
    try {
      const { email, password, organizationId } = request.data;

      if (!email) {
        throw new Error('Email is required');
      }

      if (!password) {
        throw new Error('Password is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`👥 [AUTHENTICATE TEAM MEMBER] Authenticating: ${email}`);

      // Find team member by email
      const teamMembersQuery = await db.collection('teamMembers')
        .where('email', '==', email)
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (teamMembersQuery.empty) {
        throw new Error('Team member not found or inactive');
      }

      const teamMemberDoc = teamMembersQuery.docs[0];
      const teamMemberData = teamMemberDoc.data();

      // In a real implementation, you would verify the password hash
      // For now, we'll just check if the password matches (basic implementation)
      if (teamMemberData.password !== password) {
        throw new Error('Invalid credentials');
      }

      console.log(`👥 [AUTHENTICATE TEAM MEMBER] Authentication successful: ${email}`);

      return createSuccessResponse({
        teamMemberId: teamMemberDoc.id,
        email: teamMemberData.email,
        displayName: teamMemberData.displayName,
        role: teamMemberData.role,
        organizationId: teamMemberData.organizationId,
        authenticatedAt: new Date()
      }, 'Team member authenticated successfully');

    } catch (error: any) {
      console.error('❌ [AUTHENTICATE TEAM MEMBER] Error:', error);
      return handleError(error, 'authenticateTeamMember');
    }
  }
);

// HTTP function
export const authenticateTeamMemberHttp = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req, res) => {
    try {
      const { email, password, organizationId } = req.body;

      if (!email) {
        res.status(400).json(createErrorResponse('Email is required'));
        return;
      }

      if (!password) {
        res.status(400).json(createErrorResponse('Password is required'));
        return;
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`👥 [AUTHENTICATE TEAM MEMBER HTTP] Authenticating: ${email}`);

      // Find team member by email
      const teamMembersQuery = await db.collection('teamMembers')
        .where('email', '==', email)
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (teamMembersQuery.empty) {
        res.status(404).json(createErrorResponse('Team member not found or inactive'));
        return;
      }

      const teamMemberDoc = teamMembersQuery.docs[0];
      const teamMemberData = teamMemberDoc.data();

      // In a real implementation, you would verify the password hash
      // For now, we'll just check if the password matches (basic implementation)
      if (teamMemberData.password !== password) {
        res.status(401).json(createErrorResponse('Invalid credentials'));
        return;
      }

      console.log(`👥 [AUTHENTICATE TEAM MEMBER HTTP] Authentication successful: ${email}`);

      res.status(200).json(createSuccessResponse({
        teamMemberId: teamMemberDoc.id,
        email: teamMemberData.email,
        displayName: teamMemberData.displayName,
        role: teamMemberData.role,
        organizationId: teamMemberData.organizationId,
        authenticatedAt: new Date()
      }, 'Team member authenticated successfully'));

    } catch (error: any) {
      console.error('❌ [AUTHENTICATE TEAM MEMBER HTTP] Error:', error);
      res.status(500).json(handleError(error, 'authenticateTeamMemberHttp'));
    }
  }
);
