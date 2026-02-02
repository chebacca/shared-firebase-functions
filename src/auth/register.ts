import { onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, validateEmail, generateId } from '../shared/utils';
import { User, Organization } from '../shared/types';

export const registerUser = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email, password, displayName, organizationId, organizationName } = data;

    if (!email || !password) {
      return createErrorResponse('Email and password are required');
    }

    if (!validateEmail(email)) {
      return createErrorResponse('Invalid email format');
    }

    if (password.length < 8) {
      return createErrorResponse('Password must be at least 8 characters long');
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return createErrorResponse('User already exists with this email');
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0]
    });

    let finalOrganizationId = organizationId;

    // Create organization if not provided
    if (!finalOrganizationId) {
      const orgId = generateId();
      const orgData: Omit<Organization, 'id'> = {
        name: organizationName || `${displayName || email.split('@')[0]}'s Organization`,
        description: 'Default organization',
        ownerId: userRecord.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {}
      };

      await admin.firestore().collection('organizations').doc(orgId).set(orgData);
      finalOrganizationId = orgId;
    }

    // Create user document in Firestore
    const userData: Omit<User, 'id'> = {
      email,
      displayName: displayName || email.split('@')[0],
      organizationId: finalOrganizationId,
      role: 'OWNER',
      hierarchy: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      preferences: {}
    };

    await admin.firestore().collection('users').doc(userRecord.uid).set(userData);

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'OWNER',
      hierarchy: 100,
      organizationId: finalOrganizationId,
      isOrganizationOwner: true,
      permissions: ['admin:organization', 'admin:timecard', 'read:projects', 'write:projects'],
      lastUpdated: Date.now()
    });

    return createSuccessResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      organizationId: finalOrganizationId,
      role: 'OWNER',
      hierarchy: 100
    }, 'User registered successfully');

  } catch (error) {
    return handleError(error, 'registerUser');
  }
});

export const registerTeamMember = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email, password, displayName, organizationId, role, hierarchy } = data;
    const inviterId = request.auth?.uid;

    if (!inviterId) {
      return createErrorResponse('User not authenticated');
    }

    if (!email || !password) {
      return createErrorResponse('Email and password are required');
    }

    if (!validateEmail(email)) {
      return createErrorResponse('Invalid email format');
    }

    if (password.length < 8) {
      return createErrorResponse('Password must be at least 8 characters long');
    }

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    // Check if inviter has permission to add team members
    const inviterDoc = await admin.firestore().collection('users').doc(inviterId).get();
    const inviterData = inviterDoc.data() as User;
    
    if (!inviterData || inviterData.organizationId !== organizationId) {
      return createErrorResponse('Access denied to organization');
    }

    if ((inviterData.hierarchy || 0) < 70) {
      return createErrorResponse('Insufficient permissions to add team members');
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return createErrorResponse('User already exists with this email');
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0]
    });

    // Create user document in Firestore
    const userData: Omit<User, 'id'> = {
      email,
      displayName: displayName || email.split('@')[0],
      organizationId,
      role: role || 'MEMBER',
      hierarchy: hierarchy || 50,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      preferences: {}
    };

    await admin.firestore().collection('users').doc(userRecord.uid).set(userData);

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: role || 'MEMBER',
      hierarchy: hierarchy || 50,
      organizationId,
      isOrganizationOwner: false,
      permissions: ['read:projects', 'write:projects'],
      lastUpdated: Date.now()
    });

    return createSuccessResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      organizationId,
      role: role || 'MEMBER',
      hierarchy: hierarchy || 50
    }, 'Team member registered successfully');

  } catch (error) {
    return handleError(error, 'registerTeamMember');
  }
});

export const inviteUser = onCall(defaultCallableOptions, async (request) => {
  const data = request.data as any;
  const context = { auth: request.auth };
  try {
    const { email, organizationId, role, hierarchy, message } = data;
    const inviterId = context.auth?.uid;

    if (!inviterId) {
      return createErrorResponse('User not authenticated');
    }

    if (!email || !organizationId) {
      return createErrorResponse('Email and organization ID are required');
    }

    if (!validateEmail(email)) {
      return createErrorResponse('Invalid email format');
    }

    // Check if inviter has permission to invite users
    const inviterDoc = await admin.firestore().collection('users').doc(inviterId).get();
    const inviterData = inviterDoc.data() as User;
    
    if (!inviterData || inviterData.organizationId !== organizationId) {
      return createErrorResponse('Access denied to organization');
    }

    if ((inviterData.hierarchy || 0) < 70) {
      return createErrorResponse('Insufficient permissions to invite users');
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(email);
      return createErrorResponse('User already exists with this email');
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create invitation
    const invitationId = generateId();
    const invitationData = {
      email,
      organizationId,
      role: role || 'MEMBER',
      hierarchy: hierarchy || 50,
      message: message || '',
      inviterId,
      inviterName: inviterData.displayName,
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days
    };

    await admin.firestore().collection('invitations').doc(invitationId).set(invitationData);

    // TODO: Send invitation email
    // await sendInvitationEmail(email, invitationData);

    return createSuccessResponse({
      invitationId,
      email,
      organizationId,
      role: role || 'MEMBER',
      hierarchy: hierarchy || 50,
      expiresAt: invitationData.expiresAt
    }, 'Invitation sent successfully');

  } catch (error) {
    return handleError(error, 'inviteUser');
  }
});

export const acceptInvitation = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { invitationId, password, displayName } = data;

    if (!invitationId || !password) {
      return createErrorResponse('Invitation ID and password are required');
    }

    if (password.length < 8) {
      return createErrorResponse('Password must be at least 8 characters long');
    }

    // Get invitation
    const invitationDoc = await admin.firestore().collection('invitations').doc(invitationId).get();
    
    if (!invitationDoc.exists) {
      return createErrorResponse('Invitation not found');
    }

    const invitationData = invitationDoc.data();
    
    if (invitationData?.status !== 'pending') {
      return createErrorResponse('Invitation is no longer valid');
    }

    if (invitationData?.expiresAt.toDate() < new Date()) {
      return createErrorResponse('Invitation has expired');
    }

    // Check if user already exists
    try {
      await admin.auth().getUserByEmail(invitationData.email);
      return createErrorResponse('User already exists with this email');
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: invitationData.email,
      password,
      displayName: displayName || invitationData.email.split('@')[0]
    });

    // Create user document in Firestore
    const userData: Omit<User, 'id'> = {
      email: invitationData.email,
      displayName: displayName || invitationData.email.split('@')[0],
      organizationId: invitationData.organizationId,
      role: invitationData.role,
      hierarchy: invitationData.hierarchy,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      preferences: {}
    };

    await admin.firestore().collection('users').doc(userRecord.uid).set(userData);

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: invitationData.role,
      hierarchy: invitationData.hierarchy,
      organizationId: invitationData.organizationId,
      isOrganizationOwner: false,
      permissions: ['read:projects', 'write:projects'],
      lastUpdated: Date.now()
    });

    // Update invitation status
    await admin.firestore().collection('invitations').doc(invitationId).update({
      status: 'accepted',
      acceptedAt: admin.firestore.Timestamp.now(),
      acceptedBy: userRecord.uid
    });

    return createSuccessResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      organizationId: invitationData.organizationId,
      role: invitationData.role,
      hierarchy: invitationData.hierarchy
    }, 'Invitation accepted successfully');

  } catch (error) {
    return handleError(error, 'acceptInvitation');
  }
});

export const resendInvitation = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { invitationId } = data;
    const inviterId = request.auth?.uid;

    if (!inviterId) {
      return createErrorResponse('User not authenticated');
    }

    if (!invitationId) {
      return createErrorResponse('Invitation ID is required');
    }

    // Get invitation
    const invitationDoc = await admin.firestore().collection('invitations').doc(invitationId).get();
    
    if (!invitationDoc.exists) {
      return createErrorResponse('Invitation not found');
    }

    const invitationData = invitationDoc.data();
    
    if (invitationData?.status !== 'pending') {
      return createErrorResponse('Invitation is no longer valid');
    }

    // Check if inviter has permission to resend invitation
    const inviterDoc = await admin.firestore().collection('users').doc(inviterId).get();
    const inviterData = inviterDoc.data() as User;
    
    if (!inviterData || inviterData.organizationId !== invitationData.organizationId) {
      return createErrorResponse('Access denied to organization');
    }

    if ((inviterData.hierarchy || 0) < 70) {
      return createErrorResponse('Insufficient permissions to resend invitation');
    }

    // Update invitation
    await admin.firestore().collection('invitations').doc(invitationId).update({
      resentAt: admin.firestore.Timestamp.now(),
      resentBy: inviterId
    });

    // TODO: Send invitation email
    // await sendInvitationEmail(invitationData.email, invitationData);

    return createSuccessResponse({}, 'Invitation resent successfully');

  } catch (error) {
    return handleError(error, 'resendInvitation');
  }
});

export const cancelInvitation = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { invitationId } = data;
    const inviterId = request.auth?.uid;

    if (!inviterId) {
      return createErrorResponse('User not authenticated');
    }

    if (!invitationId) {
      return createErrorResponse('Invitation ID is required');
    }

    // Get invitation
    const invitationDoc = await admin.firestore().collection('invitations').doc(invitationId).get();
    
    if (!invitationDoc.exists) {
      return createErrorResponse('Invitation not found');
    }

    const invitationData = invitationDoc.data();
    
    if (invitationData?.status !== 'pending') {
      return createErrorResponse('Invitation is no longer valid');
    }

    // Check if inviter has permission to cancel invitation
    const inviterDoc = await admin.firestore().collection('users').doc(inviterId).get();
    const inviterData = inviterDoc.data() as User;
    
    if (!inviterData || inviterData.organizationId !== invitationData.organizationId) {
      return createErrorResponse('Access denied to organization');
    }

    if ((inviterData.hierarchy || 0) < 70) {
      return createErrorResponse('Insufficient permissions to cancel invitation');
    }

    // Update invitation status
    await admin.firestore().collection('invitations').doc(invitationId).update({
      status: 'cancelled',
      cancelledAt: admin.firestore.Timestamp.now(),
      cancelledBy: inviterId
    });

    return createSuccessResponse({}, 'Invitation cancelled successfully');

  } catch (error) {
    return handleError(error, 'cancelInvitation');
  }
});
