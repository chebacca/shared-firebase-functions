import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Simple utility functions inline
const createSuccessResponse = (data: any, message = 'Success') => ({ success: true, data, message });
const createErrorResponse = (message: string) => ({ success: false, error: message });
const handleError = (error: any, functionName: string) => ({ success: false, error: error.message || 'Unknown error' });

/**
 * Update user's last active timestamp
 * This function should be called whenever a user performs an action in the application
 */
export const updateUserActivity = functions.https.onCall(async (data: any, context: any) => {
  try {
    const userId = context.auth?.uid;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    const { action, resource, metadata } = data;

    // Update the user's lastActive timestamp
    await admin.firestore().collection('users').doc(userId).update({
      lastActive: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });

    // Log the activity for analytics
    if (action && resource) {
      await admin.firestore().collection('activityLogs').add({
        userId,
        action,
        resource,
        metadata: metadata || {},
        timestamp: admin.firestore.Timestamp.now(),
        createdAt: admin.firestore.Timestamp.now()
      });
    }

    return createSuccessResponse({
      lastActive: admin.firestore.Timestamp.now()
    }, 'User activity updated successfully');

  } catch (error) {
    return handleError(error, 'updateUserActivity');
  }
});

/**
 * Batch update last active for multiple users
 * Useful for bulk operations or system maintenance
 */
export const batchUpdateUserActivity = functions.https.onCall(async (data: any, context: any) => {
  try {
    const { userIds, action } = data;

    if (!userIds || !Array.isArray(userIds)) {
      return createErrorResponse('User IDs array is required');
    }

    const batch = admin.firestore().batch();
    const timestamp = admin.firestore.Timestamp.now();

    for (const userId of userIds) {
      const userRef = admin.firestore().collection('users').doc(userId);
      batch.update(userRef, {
        lastActive: timestamp,
        updatedAt: timestamp
      });
    }

    await batch.commit();

    return createSuccessResponse({
      updatedCount: userIds.length,
      timestamp
    }, `Updated activity for ${userIds.length} users`);

  } catch (error) {
    return handleError(error, 'batchUpdateUserActivity');
  }
});

/**
 * Get user activity statistics
 */
export const getUserActivityStats = functions.https.onCall(async (data: any, context: any) => {
  try {
    const userId = context.auth?.uid;

    if (!userId) {
      return createErrorResponse('User not authenticated');
    }

    const { organizationId, timeRange = '30d' } = data;

    // Calculate time range
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get user's last active timestamp
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();

    // Get activity logs for the time range
    const activityLogsQuery = admin.firestore()
      .collection('activityLogs')
      .where('userId', '==', userId)
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .orderBy('timestamp', 'desc')
      .limit(100);

    const activityLogsSnapshot = await activityLogsQuery.get();
    const activityLogs = activityLogsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // Calculate statistics
    const totalActivities = activityLogs.length;
    const uniqueActions = [...new Set(activityLogs.map((log: any) => log.action))].length;
    const uniqueResources = [...new Set(activityLogs.map((log: any) => log.resource))].length;

    // Group activities by day
    const activitiesByDay = activityLogs.reduce((acc, log: any) => {
      const day = log.timestamp.toDate().toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return createSuccessResponse({
      lastActive: userData?.lastActive,
      timeRange,
      totalActivities,
      uniqueActions,
      uniqueResources,
      activitiesByDay,
      recentActivities: activityLogs.slice(0, 10)
    }, 'Activity statistics retrieved successfully');

  } catch (error) {
    return handleError(error, 'getUserActivityStats');
  }
});
