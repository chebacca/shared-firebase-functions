import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Syncs subscription add-ons from Firestore user document to Firebase Auth custom claims
 * This ensures that subscription add-ons are immediately available in the user's token
 */
export const syncSubscriptionAddOns = onCall(async (request) => {
  try {
    const { userId } = request.data;
    
    if (!userId) {
      throw new Error('User ID is required');
    }

    // Verify the user is authenticated
    if (!request.auth) {
      throw new Error('User must be authenticated');
    }

    // Only allow users to sync their own claims or admins to sync any user's claims
    if (request.auth.uid !== userId && !request.auth.token.admin) {
      throw new Error('Unauthorized: Can only sync your own subscription add-ons');
    }

    const db = getFirestore();
    const auth = getAuth();

    // Get user document from Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error('User document not found');
    }

    const userData = userDoc.data();
    if (!userData) {
      throw new Error('User data not found');
    }

    // Get current custom claims
    const userRecord = await auth.getUser(userId);
    const currentClaims = userRecord.customClaims || {};

    // Prepare new subscription add-ons claims
    const subscriptionAddOns = userData.subscriptionAddOns || {};
    const permissions = userData.permissions || [];

    // Build new custom claims
    const newClaims = {
      ...currentClaims,
      subscriptionAddOns: {
        clipShowPro: Boolean(subscriptionAddOns.clipShowPro),
        callSheetPro: Boolean(subscriptionAddOns.callSheetPro),
        edlConverter: Boolean(subscriptionAddOns.edlConverter),
      },
      permissions: permissions,
      // Preserve other existing claims
      organizationId: userData.organizationId || currentClaims.organizationId,
      role: userData.role || currentClaims.role,
      userType: userData.userType || currentClaims.userType,
    };

    // Update custom claims
    await auth.setCustomUserClaims(userId, newClaims);

    logger.info(`Successfully synced subscription add-ons for user ${userId}`, {
      userId,
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    });

    return {
      success: true,
      message: 'Subscription add-ons synced successfully',
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    };

  } catch (error) {
    logger.error('Error syncing subscription add-ons:', error);
    throw new Error(`Failed to sync subscription add-ons: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Automatically syncs subscription add-ons when a user document is updated
 * This ensures that changes to subscription add-ons are immediately reflected in custom claims
 */
export const onUserDocumentUpdated = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    try {
      const userId = event.params.userId;
      const beforeData = event.data?.before?.data();
      const afterData = event.data?.after?.data();

      if (!beforeData || !afterData) {
        logger.warn('User document update event missing data');
        return;
      }

      // Check if subscription add-ons or permissions have changed
      const subscriptionAddOnsChanged = 
        JSON.stringify(beforeData.subscriptionAddOns) !== JSON.stringify(afterData.subscriptionAddOns);
      
      const permissionsChanged = 
        JSON.stringify(beforeData.permissions) !== JSON.stringify(afterData.permissions);

      if (!subscriptionAddOnsChanged && !permissionsChanged) {
        logger.info('No subscription add-ons or permissions changes detected, skipping sync');
        return;
      }

      const auth = getAuth();

      // Get current custom claims
      const userRecord = await auth.getUser(userId);
      const currentClaims = userRecord.customClaims || {};

      // Prepare new subscription add-ons claims
      const subscriptionAddOns = afterData.subscriptionAddOns || {};
      const permissions = afterData.permissions || [];

      // Build new custom claims
      const newClaims = {
        ...currentClaims,
        subscriptionAddOns: {
          clipShowPro: Boolean(subscriptionAddOns.clipShowPro),
          callSheetPro: Boolean(subscriptionAddOns.callSheetPro),
          edlConverter: Boolean(subscriptionAddOns.edlConverter),
        },
        permissions: permissions,
        // Preserve other existing claims
        organizationId: afterData.organizationId || currentClaims.organizationId,
        role: afterData.role || currentClaims.role,
        userType: afterData.userType || currentClaims.userType,
      };

      // Update custom claims
      await auth.setCustomUserClaims(userId, newClaims);

      logger.info(`Automatically synced subscription add-ons for user ${userId}`, {
        userId,
        subscriptionAddOns: newClaims.subscriptionAddOns,
        permissions: newClaims.permissions,
        changes: {
          subscriptionAddOnsChanged,
          permissionsChanged,
        },
      });

    } catch (error) {
      logger.error('Error in automatic subscription add-ons sync:', error);
      // Don't throw error to avoid breaking the document update
    }
  }
);

/**
 * Grants Clip Show Pro access to a user
 * This function can be called by admins to grant add-on access
 */
export const grantClipShowProAccess = onCall(async (request) => {
  try {
    const { targetUserId, grantedBy } = request.data;
    
    if (!targetUserId) {
      throw new Error('Target user ID is required');
    }

    if (!grantedBy) {
      throw new Error('Granted by user ID is required');
    }

    // Verify the caller is authenticated and has admin privileges
    if (!request.auth) {
      throw new Error('User must be authenticated');
    }

    if (!request.auth.token.admin) {
      throw new Error('Unauthorized: Admin privileges required');
    }

    const db = getFirestore();
    const auth = getAuth();

    // Get target user document
    const userDoc = await db.collection('users').doc(targetUserId).get();
    
    if (!userDoc.exists) {
      throw new Error('Target user document not found');
    }

    const userData = userDoc.data();
    if (!userData) {
      throw new Error('Target user data not found');
    }

    // Update user document with Clip Show Pro access
    await userDoc.ref.update({
      'subscriptionAddOns.clipShowPro': true,
      permissions: admin.firestore.FieldValue.arrayUnion('CLIP_SHOW_PRO'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: grantedBy,
    });

    // Get current custom claims
    const userRecord = await auth.getUser(targetUserId);
    const currentClaims = userRecord.customClaims || {};

    // Update custom claims
    const newClaims = {
      ...currentClaims,
      subscriptionAddOns: {
        ...(currentClaims.subscriptionAddOns || {}),
        clipShowPro: true,
      },
      permissions: [...new Set([...(currentClaims.permissions || []), 'CLIP_SHOW_PRO'])],
    };

    await auth.setCustomUserClaims(targetUserId, newClaims);

    logger.info(`Granted Clip Show Pro access to user ${targetUserId}`, {
      targetUserId,
      grantedBy,
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    });

    return {
      success: true,
      message: 'Clip Show Pro access granted successfully',
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    };

  } catch (error) {
    logger.error('Error granting Clip Show Pro access:', error);
    throw new Error(`Failed to grant Clip Show Pro access: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

/**
 * Revokes Clip Show Pro access from a user
 * This function can be called by admins to revoke add-on access
 */
export const revokeClipShowProAccess = onCall(async (request) => {
  try {
    const { targetUserId, revokedBy } = request.data;
    
    if (!targetUserId) {
      throw new Error('Target user ID is required');
    }

    if (!revokedBy) {
      throw new Error('Revoked by user ID is required');
    }

    // Verify the caller is authenticated and has admin privileges
    if (!request.auth) {
      throw new Error('User must be authenticated');
    }

    if (!request.auth.token.admin) {
      throw new Error('Unauthorized: Admin privileges required');
    }

    const db = getFirestore();
    const auth = getAuth();

    // Get target user document
    const userDoc = await db.collection('users').doc(targetUserId).get();
    
    if (!userDoc.exists) {
      throw new Error('Target user document not found');
    }

    const userData = userDoc.data();
    if (!userData) {
      throw new Error('Target user data not found');
    }

    // Update user document to remove Clip Show Pro access
    await userDoc.ref.update({
      'subscriptionAddOns.clipShowPro': false,
      permissions: admin.firestore.FieldValue.arrayRemove('CLIP_SHOW_PRO'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastModifiedBy: revokedBy,
    });

    // Get current custom claims
    const userRecord = await auth.getUser(targetUserId);
    const currentClaims = userRecord.customClaims || {};

    // Update custom claims
    const newClaims = {
      ...currentClaims,
      subscriptionAddOns: {
        ...(currentClaims.subscriptionAddOns || {}),
        clipShowPro: false,
      },
      permissions: (currentClaims.permissions || []).filter((p: string) => p !== 'CLIP_SHOW_PRO'),
    };

    await auth.setCustomUserClaims(targetUserId, newClaims);

    logger.info(`Revoked Clip Show Pro access from user ${targetUserId}`, {
      targetUserId,
      revokedBy,
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    });

    return {
      success: true,
      message: 'Clip Show Pro access revoked successfully',
      subscriptionAddOns: newClaims.subscriptionAddOns,
      permissions: newClaims.permissions,
    };

  } catch (error) {
    logger.error('Error revoking Clip Show Pro access:', error);
    throw new Error(`Failed to revoke Clip Show Pro access: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

