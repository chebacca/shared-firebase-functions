import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

/**
 * Migrate existing users to have lastActive timestamps
 * This function should be run once to populate lastActive for existing users
 */
export const migrateUserLastActive = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { organizationId, dryRun = false } = data;

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    console.log(`🔄 Starting lastActive migration for organization: ${organizationId}`);
    
    // Get all users in the organization
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('organizationId', '==', organizationId)
      .get();

    const usersToUpdate = [];
    const batch = admin.firestore().batch();
    const timestamp = admin.firestore.Timestamp.now();

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      
      // Only update users who don't have lastActive set
      if (!userData.lastActive) {
        const fallbackTimestamp = userData.lastLoginAt || 
                                 userData.updatedAt || 
                                 userData.createdAt || 
                                 timestamp;

        usersToUpdate.push({
          id: doc.id,
          email: userData.email,
          fallbackTimestamp: fallbackTimestamp
        });

        if (!dryRun) {
          batch.update(doc.ref, {
            lastActive: fallbackTimestamp,
            updatedAt: timestamp
          });
        }
      }
    });

    if (!dryRun && usersToUpdate.length > 0) {
      await batch.commit();
    }

    return createSuccessResponse({
      organizationId,
      usersProcessed: usersToUpdate.length,
      dryRun,
      users: usersToUpdate.map(u => ({
        id: u.id,
        email: u.email,
        lastActiveSet: u.fallbackTimestamp
      }))
    }, `Migration ${dryRun ? 'simulation' : 'completed'} for ${usersToUpdate.length} users`);

  } catch (error) {
    return handleError(error, 'migrateUserLastActive');
  }
});

/**
 * Update lastActive for a specific user
 */
export const updateUserLastActive = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { userId, timestamp } = data;

    if (!userId) {
      return createErrorResponse('User ID is required');
    }

    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now()
    };

    if (timestamp) {
      updateData.lastActive = admin.firestore.Timestamp.fromDate(new Date(timestamp));
    } else {
      updateData.lastActive = admin.firestore.Timestamp.now();
    }

    await admin.firestore().collection('users').doc(userId).update(updateData);

    return createSuccessResponse({
      userId,
      lastActive: updateData.lastActive
    }, 'User lastActive updated successfully');

  } catch (error) {
    return handleError(error, 'updateUserLastActive');
  }
});

/**
 * Get users without lastActive timestamps
 */
export const getUsersWithoutLastActive = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { organizationId } = data;

    if (!organizationId) {
      return createErrorResponse('Organization ID is required');
    }

    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('organizationId', '==', organizationId)
      .get();

    const usersWithoutLastActive = [];

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      
      if (!userData.lastActive) {
        usersWithoutLastActive.push({
          id: doc.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          lastLoginAt: userData.lastLoginAt,
          updatedAt: userData.updatedAt,
          createdAt: userData.createdAt
        });
      }
    });

    return createSuccessResponse({
      organizationId,
      count: usersWithoutLastActive.length,
      users: usersWithoutLastActive
    }, `Found ${usersWithoutLastActive.length} users without lastActive timestamps`);

  } catch (error) {
    return handleError(error, 'getUsersWithoutLastActive');
  }
});
