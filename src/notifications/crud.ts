/**
 * Shared Firebase Functions for Notification System CRUD Operations
 * 
 * Provides CRUD operations for notifications with proper authentication 
 * and organization scoping. Used across all projects.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const db = getFirestore();
const auth = getAuth();

// Import unified types (if available, otherwise use local interface)
// For server-side, we'll use a compatible interface
interface Notification {
  id?: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  userId: string;
  organizationId: string;
  projectId?: string;
  sourceApp?: string;  // NEW: Which app generated this
  metadata?: {
    actionUrl?: string;
    sourceAppRoute?: string;
    [key: string]: any;
  };
  createdAt?: string;
  updatedAt?: string;
}

// Helper function to verify authentication with improved organization ID resolution
async function verifyAuth(request: any): Promise<{ uid: string; organizationId: string }> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No authorization header provided');
  }

  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await auth.verifyIdToken(token);

  // Try multiple sources for organization ID
  let organizationId = decodedToken.organizationId;

  if (!organizationId) {
    // Try user document with multiple field names
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      organizationId = userData?.organizationId ||
        userData?.organization_id ||
        userData?.orgId ||
        userData?.org_id;
    }
  }

  // If still no organization ID, try teamMembers collection
  if (!organizationId) {
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', decodedToken.uid)
      .limit(1)
      .get();

    if (!teamMemberQuery.empty) {
      const teamMemberData = teamMemberQuery.docs[0].data();
      organizationId = teamMemberData?.organizationId || teamMemberData?.organization_id;
    }
  }

  if (!organizationId) {
    throw new Error('User organization not found. Please contact support.');
  }

  return { uid: decodedToken.uid, organizationId };
}

// Get all notifications for a user
export const getNotifications = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);

    const notificationsRef = db.collection('notifications');
    const query = notificationsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .orderBy('createdAt', 'desc')
      .limit(100);

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    response.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error getting notifications:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to get notifications',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get unread notifications for a user
export const getUnreadNotifications = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);

    const notificationsRef = db.collection('notifications');
    const query = notificationsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .where('read', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(50);

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    response.json({
      success: true,
      data: notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error getting unread notifications:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to get unread notifications',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get notifications by category
export const getNotificationsByCategory = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const { category } = request.query;

    if (!category || typeof category !== 'string') {
      response.status(400).json({
        success: false,
        error: 'Category parameter is required'
      });
      return;
    }

    const notificationsRef = db.collection('notifications');
    const query = notificationsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(50);

    const snapshot = await query.get();
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    response.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error getting notifications by category:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to get notifications by category',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new notification
export const createNotification = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const notificationData: Omit<Notification, 'id'> = request.body;

    // Validate required fields
    if (!notificationData.category || !notificationData.title || !notificationData.message) {
      response.status(400).json({
        success: false,
        error: 'Missing required fields: category, title, message'
      });
      return;
    }

    // Use Firestore Timestamp for proper Firestore compatibility
    const now = Timestamp.now();
    const nowISO = now.toDate().toISOString();

    const notification: Notification = {
      ...notificationData,
      userId: uid,
      organizationId,
      read: false,
      timestamp: nowISO, // ISO string for client compatibility
      createdAt: nowISO, // Will be converted to Timestamp by Firestore
      updatedAt: nowISO, // Will be converted to Timestamp by Firestore
      // Ensure sourceApp is set (default to 'hub' if not provided)
      sourceApp: notificationData.sourceApp || 'hub'
    };

    // Convert to Firestore document format with Timestamps
    const firestoreNotification = {
      ...notification,
      createdAt: now, // Firestore Timestamp
      updatedAt: now  // Firestore Timestamp
    };

    const docRef = await db.collection('notifications').add(firestoreNotification);

    // Convert Timestamps back to ISO strings for response
    const responseData = {
      id: docRef.id,
      ...notification,
      createdAt: nowISO,
      updatedAt: nowISO
    };

    response.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to create notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a notification
export const updateNotification = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const id = request.params.id as string;
    const updateData = request.body;

    if (!id) {
      response.status(400).json({
        success: false,
        error: 'Notification ID is required'
      });
      return;
    }

    const notificationRef = db.collection('notifications').doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      response.status(404).json({
        success: false,
        error: 'Notification not found'
      });
      return;
    }

    const notificationData = notificationDoc.data();
    if (notificationData?.userId !== uid || notificationData?.organizationId !== organizationId) {
      response.status(403).json({
        success: false,
        error: 'Unauthorized to update this notification'
      });
      return;
    }

    const now = Timestamp.now();
    const nowISO = now.toDate().toISOString();

    const updatedData = {
      ...updateData,
      updatedAt: now // Firestore Timestamp
    };

    await notificationRef.update(updatedData);

    // Convert Timestamp to ISO string for response
    const responseData = {
      id,
      ...notificationData,
      ...updateData,
      updatedAt: nowISO
    };

    response.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to update notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mark notification as read
export const markNotificationAsRead = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const id = request.params.id as string;

    if (!id) {
      response.status(400).json({
        success: false,
        error: 'Notification ID is required'
      });
      return;
    }

    const notificationRef = db.collection('notifications').doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      response.status(404).json({
        success: false,
        error: 'Notification not found'
      });
      return;
    }

    const notificationData = notificationDoc.data();
    if (notificationData?.userId !== uid || notificationData?.organizationId !== organizationId) {
      response.status(403).json({
        success: false,
        error: 'Unauthorized to update this notification'
      });
      return;
    }

    const now = Timestamp.now();
    const nowISO = now.toDate().toISOString();

    await notificationRef.update({
      read: true,
      updatedAt: now // Firestore Timestamp
    });

    response.json({
      success: true,
      data: {
        id,
        ...notificationData,
        read: true,
        updatedAt: nowISO
      }
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Mark all notifications as read
export const markAllNotificationsAsRead = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);

    const notificationsRef = db.collection('notifications');
    const query = notificationsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .where('read', '==', false);

    const snapshot = await query.get();
    const batch = db.batch();

    const now = Timestamp.now();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        read: true,
        updatedAt: now // Firestore Timestamp
      });
    });

    await batch.commit();

    response.json({
      success: true,
      data: {
        updatedCount: snapshot.docs.length,
        message: `Marked ${snapshot.docs.length} notifications as read`
      }
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a notification
export const deleteNotification = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const id = request.params.id as string;

    if (!id) {
      response.status(400).json({
        success: false,
        error: 'Notification ID is required'
      });
      return;
    }

    const notificationRef = db.collection('notifications').doc(id);
    const notificationDoc = await notificationRef.get();

    if (!notificationDoc.exists) {
      response.status(404).json({
        success: false,
        error: 'Notification not found'
      });
      return;
    }

    const notificationData = notificationDoc.data();
    if (notificationData?.userId !== uid || notificationData?.organizationId !== organizationId) {
      response.status(403).json({
        success: false,
        error: 'Unauthorized to delete this notification'
      });
      return;
    }

    await notificationRef.delete();

    response.json({
      success: true,
      data: {
        id,
        message: 'Notification deleted successfully'
      }
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to delete notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear all notifications
export const clearAllNotifications = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);

    const notificationsRef = db.collection('notifications');
    const query = notificationsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId);

    const snapshot = await query.get();
    const batch = db.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    response.json({
      success: true,
      data: {
        deletedCount: snapshot.docs.length,
        message: `Deleted ${snapshot.docs.length} notifications`
      }
    });
  } catch (error) {
    console.error('Error clearing all notifications:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to clear all notifications',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get notification settings
export const getNotificationSettings = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);

    const settingsRef = db.collection('notificationSettings');
    const query = settingsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .limit(1);

    const snapshot = await query.get();

    if (snapshot.empty) {
      // Return default settings
      const defaultSettings = {
        enabled: true,
        soundEnabled: true,
        desktopEnabled: true,
        categories: {
          chat: { enabled: true, priority: 'medium' },
          session: { enabled: true, priority: 'medium' },
          workflow: { enabled: true, priority: 'medium' },
          message: { enabled: true, priority: 'medium' },
          system: { enabled: true, priority: 'low' },
          inventory: { enabled: true, priority: 'low' },
          schedule: { enabled: true, priority: 'medium' },
          timecard: { enabled: true, priority: 'medium' },
          timecard_approval: { enabled: true, priority: 'high' }
        }
      };

      response.json({
        success: true,
        data: defaultSettings
      });
      return;
    }

    const settings = snapshot.docs[0].data();
    response.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting notification settings:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to get notification settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update notification settings
export const updateNotificationSettings = onRequest(async (request, response) => {
  try {
    const { uid, organizationId } = await verifyAuth(request);
    const settingsData = request.body;

    const settingsRef = db.collection('notificationSettings');
    const query = settingsRef
      .where('userId', '==', uid)
      .where('organizationId', '==', organizationId)
      .limit(1);

    const snapshot = await query.get();

    const now = Timestamp.now();
    const nowISO = now.toDate().toISOString();

    const updatedSettings = {
      ...settingsData,
      userId: uid,
      organizationId,
      updatedAt: now // Firestore Timestamp
    };

    if (snapshot.empty) {
      // Create new settings document
      updatedSettings.createdAt = now; // Firestore Timestamp
      await settingsRef.add(updatedSettings);
    } else {
      // Update existing settings document
      const docRef = snapshot.docs[0].ref;
      await docRef.update(updatedSettings);
    }

    // Convert Timestamps to ISO strings for response
    const responseData = {
      ...updatedSettings,
      createdAt: snapshot.empty ? nowISO : (updatedSettings.createdAt?.toDate?.()?.toISOString() || nowISO),
      updatedAt: nowISO
    };

    response.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    response.status(500).json({
      success: false,
      error: 'Failed to update notification settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

