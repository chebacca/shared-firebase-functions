/**
 * Call Sheet Personnel Management Functions
 * Functions for creating and managing personnel accounts with Firebase Auth
 */

import { onCall } from 'firebase-functions/v2/https';
import { defaultCallableOptions } from '../lib/functionOptions';
import * as admin from 'firebase-admin';

/**
 * Helper function to generate secure random password
 */
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 12 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

/**
 * Create Personnel Account
 * Creates a Firebase Auth user and Firestore document for personnel
 */
export const callsheet_createPersonnelAccount = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    // Verify user is authenticated
    if (!request.auth?.uid) {
      return { success: false, error: 'User not authenticated' };
    }

    const { email, displayName, position, department, organizationId } = data;

    // Validate required fields
    if (!email || !displayName) {
      return { success: false, error: 'Email and displayName required' };
    }

    // Verify caller owns the organization (license holder check)
    const callerDoc = await admin.firestore()
      .collection('users')
      .doc(request.auth.uid)
      .get();
    const callerData = callerDoc.data();
    
    if (!callerData || callerData.organizationId !== organizationId) {
      return { success: false, error: 'Access denied to organization' };
    }
    
    // Check if email already exists
    try {
      await admin.auth().getUserByEmail(email);
      return { success: false, error: 'User already exists with this email' };
    } catch (error: any) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
      // User doesn't exist, continue with creation
    }
    
    // Generate secure temporary password
    const tempPassword = generateSecurePassword();
    
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName
    });
    
    // Set custom claims for personnel role
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'PERSONNEL',
      hierarchy: 30,
      organizationId,
      permissions: ['read:callsheets', 'write:timecards'],
      isPersonnel: true,
      lastUpdated: Date.now()
    });
    
    // Create document in standalonePersonnel collection
    await admin.firestore()
      .collection('standalonePersonnel')
      .add({
        authUid: userRecord.uid,
        userId: organizationId, // Owner's organization ID
        email,
        fullName: displayName,
        position: position || 'Crew Member',
        department: department || 'Production',
        isActive: true,
        hasAuthAccount: true,
        accountCreatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    
    console.log(`✅ Personnel account created: ${email} (${userRecord.uid}) for org: ${organizationId}`);
    
    return {
      success: true,
      data: {
        uid: userRecord.uid,
        email,
        displayName,
        tempPassword,
        organizationId
      },
      message: 'Personnel account created successfully'
    };
  } catch (error: any) {
    console.error('❌ Error creating personnel account:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to create personnel account' 
    };
  }
});

/**
 * Change Personnel Password
 * Allows personnel users to change their own password
 */
export const callsheet_changePersonnelPassword = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    // Verify user is authenticated
    if (!request.auth?.uid) {
      return { success: false, error: 'User not authenticated' };
    }

    const { currentPassword, newPassword } = data;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return { success: false, error: 'Current and new password required' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters' };
    }

    // Verify user has PERSONNEL role
    const userRecord = await admin.auth().getUser(request.auth.uid);
    const claims = userRecord.customClaims;

    if (!claims || claims.role !== 'PERSONNEL') {
      return { success: false, error: 'Only personnel can use this method' };
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(request.auth.uid, {
      password: newPassword
    });

    // Update lastPasswordChange in Firestore
    const personnelQuery = await admin.firestore()
      .collection('standalonePersonnel')
      .where('authUid', '==', request.auth.uid)
      .limit(1)
      .get();

    if (!personnelQuery.empty) {
      await personnelQuery.docs[0].ref.update({
        lastPasswordChange: new Date(),
        updatedAt: new Date()
      });
    }

    console.log(`✅ Password changed for personnel: ${request.auth.uid}`);

    return {
      success: true,
      data: { uid: request.auth.uid },
      message: 'Password changed successfully'
    };
  } catch (error: any) {
    console.error('❌ Error changing personnel password:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to change password' 
    };
  }
});

/**
 * Reset Personnel Password (Admin Only)
 * Allows admin to reset a personnel user's password
 */
export const callsheet_resetPersonnelPassword = onCall(defaultCallableOptions, async (request) => {
  try {
    const data = request.data as any;
    // Verify admin is authenticated
    if (!request.auth?.uid) {
      return { success: false, error: 'User not authenticated' };
    }

    const { personnelUid, organizationId } = data;
    
    // Validate inputs
    if (!personnelUid || !organizationId) {
      return { success: false, error: 'Personnel UID and organization ID required' };
    }
    
    // Verify caller is admin of the organization
    const adminDoc = await admin.firestore()
      .collection('users')
      .doc(request.auth.uid)
      .get();
    const adminData = adminDoc.data();
    
    if (!adminData || adminData.organizationId !== organizationId) {
      return { success: false, error: 'Access denied to organization' };
    }
    
    // Verify personnel belongs to the same organization
    const personnelQuery = await admin.firestore()
      .collection('standalonePersonnel')
      .where('authUid', '==', personnelUid)
      .where('userId', '==', organizationId)
      .limit(1)
      .get();
    
    if (personnelQuery.empty) {
      return { success: false, error: 'Personnel not found in your organization' };
    }
    
    // Generate new secure password
    const newPassword = generateSecurePassword();
    
    // Update password in Firebase Auth
    await admin.auth().updateUser(personnelUid, {
      password: newPassword
    });
    
    // Update lastPasswordReset in Firestore
    await personnelQuery.docs[0].ref.update({
      lastPasswordReset: new Date(),
      resetByAdmin: request.auth.uid,
      updatedAt: new Date()
    });

    console.log(`✅ Password reset for personnel: ${personnelUid} by admin: ${request.auth.uid}`);
    
    return {
      success: true,
      data: {
        uid: personnelUid,
        newPassword,
        email: personnelQuery.docs[0].data().email
      },
      message: 'Password reset successfully'
    };
  } catch (error: any) {
    console.error('❌ Error resetting personnel password:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to reset password' 
    };
  }
});

