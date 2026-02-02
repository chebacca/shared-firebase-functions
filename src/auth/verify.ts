import { onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import { User } from '../shared/types';

export const verifyEmail = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email, verificationCode } = data;

    if (!email || !verificationCode) {
      return createErrorResponse('Email and verification code are required');
    }

    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Check if email is already verified
    if (userRecord.emailVerified) {
      return createErrorResponse('Email is already verified');
    }

    // TODO: Implement verification code validation
    // For now, we'll just mark the email as verified
    await admin.auth().updateUser(userRecord.uid, {
      emailVerified: true
    });

    // Update user data in Firestore
    await admin.firestore().collection('users').doc(userRecord.uid).update({
      emailVerified: true,
      updatedAt: admin.firestore.Timestamp.now()
    });

    return createSuccessResponse({}, 'Email verified successfully');

  } catch (error) {
    return handleError(error, 'verifyEmail');
  }
});

export const resendVerificationEmail = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email } = data;

    if (!email) {
      return createErrorResponse('Email is required');
    }

    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Check if email is already verified
    if (userRecord.emailVerified) {
      return createErrorResponse('Email is already verified');
    }

    // TODO: Send verification email
    // await sendVerificationEmail(email);

    return createSuccessResponse({}, 'Verification email sent successfully');

  } catch (error) {
    return handleError(error, 'resendVerificationEmail');
  }
});

export const forgotPassword = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email } = data;

    if (!email) {
      return createErrorResponse('Email is required');
    }

    // Check if user exists
    try {
      await admin.auth().getUserByEmail(email);
      
      // TODO: Send password reset email
      // await sendPasswordResetEmail(email);

      return createSuccessResponse({}, 'Password reset email sent successfully');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return createErrorResponse('User not found with this email');
      }
      throw error;
    }

  } catch (error) {
    return handleError(error, 'forgotPassword');
  }
});

export const resetPassword = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email, resetCode, newPassword } = data;

    if (!email || !resetCode || !newPassword) {
      return createErrorResponse('Email, reset code, and new password are required');
    }

    if (newPassword.length < 8) {
      return createErrorResponse('New password must be at least 8 characters long');
    }

    // Get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // TODO: Implement reset code validation
    // For now, we'll just update the password
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword
    });

    return createSuccessResponse({}, 'Password reset successfully');

  } catch (error) {
    return handleError(error, 'resetPassword');
  }
});

export const checkEmailAvailability = onCall(defaultCallableOptions, async (request) => {
  const data = request.data as any;
  try {
    const { email } = data;

    if (!email) {
      return createErrorResponse('Email is required');
    }

    try {
      await admin.auth().getUserByEmail(email);
      return createSuccessResponse({ available: false }, 'Email is already taken');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return createSuccessResponse({ available: true }, 'Email is available');
      }
      throw error;
    }

  } catch (error) {
    return handleError(error, 'checkEmailAvailability');
  }
});

export const validateSession = onCall(defaultCallableOptions, async (request) => {
  try {
    const userId = request.auth?.uid;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createErrorResponse('User data not found');
    }

    if (!userData.isActive) {
      return createErrorResponse('Account is deactivated');
    }

    return createSuccessResponse({
      valid: true,
      user: {
        uid: userId,
        email: userData.email,
        displayName: userData.displayName,
        organizationId: userData.organizationId,
        role: userData.role,
        hierarchy: userData.hierarchy,
        isActive: userData.isActive
      }
    }, 'Session is valid');

  } catch (error) {
    return handleError(error, 'validateSession');
  }
});

export const refreshUserClaims = onCall(defaultCallableOptions, async (request) => {
  try {
    const userId = request.auth?.uid;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createErrorResponse('User data not found');
    }

    // Update custom claims
    const customClaims = {
      role: userData.role,
      hierarchy: userData.hierarchy,
      organizationId: userData.organizationId,
      isOrganizationOwner: userData.role === 'OWNER',
      permissions: userData.role === 'OWNER' 
        ? ['admin:organization', 'admin:timecard', 'read:projects', 'write:projects']
        : ['read:projects', 'write:projects'],
      lastUpdated: Date.now()
    };

    await admin.auth().setCustomUserClaims(userId, customClaims);

    return createSuccessResponse({
      claims: customClaims
    }, 'User claims refreshed successfully');

  } catch (error) {
    return handleError(error, 'refreshUserClaims');
  }
});

export const getAuthStatus = onCall(defaultCallableOptions, async (request) => {
  try {
    const userId = request.auth?.uid;

    if (!userId) {
      return createSuccessResponse({
        authenticated: false,
        user: null
      }, 'User not authenticated');
    }

    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createSuccessResponse({
        authenticated: false,
        user: null
      }, 'User data not found');
    }

    if (!userData.isActive) {
      return createSuccessResponse({
        authenticated: false,
        user: null
      }, 'Account is deactivated');
    }

    return createSuccessResponse({
      authenticated: true,
      user: {
        uid: userId,
        email: userData.email,
        displayName: userData.displayName,
        organizationId: userData.organizationId,
        role: userData.role,
        hierarchy: userData.hierarchy,
        isActive: userData.isActive,
        lastLoginAt: userData.lastLoginAt
      }
    }, 'User is authenticated');

  } catch (error) {
    return handleError(error, 'getAuthStatus');
  }
});
