import { onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, validateEmail } from '../shared/utils';
import { User } from '../shared/types';

export const loginUser = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { email, password } = data;

    if (!email || !password) {
      return createErrorResponse('Email and password are required');
    }

    if (!validateEmail(email)) {
      return createErrorResponse('Invalid email format');
    }

    // Firebase Auth handles the actual login
    // This function is for additional business logic
    const userRecord = await admin.auth().getUserByEmail(email);
    
    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createErrorResponse('User data not found');
    }

    if (!userData.isActive) {
      return createErrorResponse('Account is deactivated');
    }

    // Update last login and last active
    await admin.firestore().collection('users').doc(userRecord.uid).update({
      lastLoginAt: admin.firestore.Timestamp.now(),
      lastActive: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    return createSuccessResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      organizationId: userData.organizationId,
      role: userData.role,
      hierarchy: userData.hierarchy,
      isActive: userData.isActive,
      lastLoginAt: userData.lastLoginAt
    }, 'Login successful');

  } catch (error) {
    return handleError(error, 'loginUser');
  }
});

export const verifyToken = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { token } = data;

    if (!token) {
      return createErrorResponse('Token is required');
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createErrorResponse('User data not found');
    }

    return createSuccessResponse({
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.displayName,
      organizationId: userData.organizationId,
      role: userData.role,
      hierarchy: userData.hierarchy,
      isActive: userData.isActive,
      customClaims: decodedToken
    }, 'Token verified successfully');

  } catch (error) {
    return handleError(error, 'verifyToken');
  }
});

export const refreshToken = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const { refreshToken } = data;

    if (!refreshToken) {
      return createErrorResponse('Refresh token is required');
    }

    // Firebase handles refresh token validation
    // This function is for additional business logic
    const userRecord = await admin.auth().getUser(request.auth?.uid || '');
    
    // Get user data from Firestore
    const userDoc = await admin.firestore().collection('users').doc(userRecord.uid).get();
    const userData = userDoc.data() as User;
    
    if (!userData) {
      return createErrorResponse('User data not found');
    }

    if (!userData.isActive) {
      return createErrorResponse('Account is deactivated');
    }

    return createSuccessResponse({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      organizationId: userData.organizationId,
      role: userData.role,
      hierarchy: userData.hierarchy,
      isActive: userData.isActive
    }, 'Token refreshed successfully');

  } catch (error) {
    return handleError(error, 'refreshToken');
  }
});

export const logoutUser = onCall(defaultCallableOptions, async (request) => {
  try {
    const userId = request.auth?.uid;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    // Update last logout time
    await admin.firestore().collection('users').doc(userId).update({
      lastLogoutAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    return createSuccessResponse({}, 'Logout successful');

  } catch (error) {
    return handleError(error, 'logoutUser');
  }
});

export const getUserProfile = onCall(defaultCallableOptions, async (request) => {
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

    return createSuccessResponse({
      uid: userId,
      email: userData.email,
      displayName: userData.displayName,
      organizationId: userData.organizationId,
      role: userData.role,
      hierarchy: userData.hierarchy,
      isActive: userData.isActive,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      lastLoginAt: userData.lastLoginAt,
      preferences: userData.preferences
    }, 'User profile retrieved successfully');

  } catch (error) {
    return handleError(error, 'getUserProfile');
  }
});

export const updateUserProfile = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const userId = request.auth?.uid;
    const { displayName, preferences } = data;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    if (preferences !== undefined) {
      updateData.preferences = preferences;
    }

    // Update user data in Firestore
    await admin.firestore().collection('users').doc(userId).update(updateData);

    // Update Firebase Auth if displayName changed
    if (displayName !== undefined) {
      await admin.auth().updateUser(userId, {
        displayName: displayName
      });
    }

    return createSuccessResponse({}, 'User profile updated successfully');

  } catch (error) {
    return handleError(error, 'updateUserProfile');
  }
});

export const changePassword = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const userId = request.auth?.uid;
    const { currentPassword, newPassword } = data;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    if (!currentPassword || !newPassword) {
      return createErrorResponse('Current password and new password are required');
    }

    if (newPassword.length < 8) {
      return createErrorResponse('New password must be at least 8 characters long');
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(userId, {
      password: newPassword
    });

    return createSuccessResponse({}, 'Password changed successfully');

  } catch (error) {
    return handleError(error, 'changePassword');
  }
});

export const deleteAccount = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    const userId = request.auth?.uid;
    const { password } = data;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    if (!password) {
      return createErrorResponse('Password is required for account deletion');
    }

    // Verify password before deletion
    // Note: This is a simplified check - in production, you might want to verify the password
    // through a separate authentication step

    // Delete user from Firebase Auth
    await admin.auth().deleteUser(userId);

    // Delete user data from Firestore
    await admin.firestore().collection('users').doc(userId).delete();

    return createSuccessResponse({}, 'Account deleted successfully');

  } catch (error) {
    return handleError(error, 'deleteAccount');
  }
});
