/**
 * 🔥 SEND TRAVEL PUSH NOTIFICATION
 * Send FCM push notifications for travel-related events
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import * as admin from 'firebase-admin';

const db = getFirestore();
const messaging = getMessaging();

interface TravelNotificationData {
  type: 'approval_request' | 'approval_confirmed' | 'booking_confirmation' | 'rejection' | 'reminder_24h' | 'reminder_receipts';
  travelRequestId: string;
  userId: string;
  title: string;
  body: string;
  actionUrl?: string;
}

/**
 * Send travel push notification
 */
export const sendTravelNotification = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { type, travelRequestId, userId, title, body, actionUrl } = request.data as TravelNotificationData;

      if (!type || !travelRequestId || !userId || !title || !body) {
        throw new Error('Missing required parameters: type, travelRequestId, userId, title, body');
      }

      console.log(`📱 [TravelNotification] Sending ${type} notification to user: ${userId}`);

      // Get user's FCM tokens
      const tokensSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .where('isActive', '==', true)
        .get();

      if (tokensSnapshot.empty) {
        console.log(`⚠️ [TravelNotification] No active FCM tokens found for user: ${userId}`);
        return createSuccessResponse(
          { sent: false, reason: 'No active tokens' },
          'No active FCM tokens found for user'
        );
      }

      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      console.log(`📱 [TravelNotification] Found ${tokens.length} active token(s) for user: ${userId}`);

      // Prepare notification payload
      const notification: admin.messaging.Notification = {
        title,
        body,
      };

      const message: admin.messaging.MulticastMessage = {
        notification,
        data: {
          type: 'travel',
          travelType: type,
          travelRequestId,
          actionUrl: actionUrl || `/travel/${travelRequestId}`,
          timestamp: new Date().toISOString(),
        },
        tokens,
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'travel_notifications',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            icon: '/icons/travel-icon.png',
            badge: '/icons/badge-icon.png',
          },
        },
      };

      // Send notifications
      const response = await messaging.sendEachForMulticast(message);

      console.log(`✅ [TravelNotification] Sent ${response.successCount} notification(s), ${response.failureCount} failed`);

      // Log notification to Firestore
      await db.collection('travel_notifications').add({
        type,
        travelRequestId,
        userId,
        title,
        body,
        actionUrl: actionUrl || `/travel/${travelRequestId}`,
        tokensSent: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: response.successCount > 0,
      });

      // Handle failed tokens (remove inactive ones)
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            // Check if token is invalid and mark as inactive
            if (resp.error?.code === 'messaging/invalid-registration-token' ||
                resp.error?.code === 'messaging/registration-token-not-registered') {
              tokensSnapshot.docs[idx].ref.update({ isActive: false });
            }
          }
        });
        console.log(`⚠️ [TravelNotification] ${failedTokens.length} token(s) failed`);
      }

      return createSuccessResponse(
        {
          sent: response.successCount > 0,
          successCount: response.successCount,
          failureCount: response.failureCount,
        },
        `Notification sent to ${response.successCount} device(s)`
      );

    } catch (error: any) {
      console.error('❌ [TravelNotification] Error sending notification:', error);
      return createErrorResponse(
        error.message || 'Failed to send travel notification',
        error.stack
      );
    }
  }
);

/**
 * Send travel reminder notification (24h before travel)
 */
export const sendTravelReminder = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '1GiB', // Bumped from 512MiB - still failing healthcheck on cold start
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { travelRequestId, userId } = request.data;

      if (!travelRequestId || !userId) {
        throw new Error('Missing required parameters: travelRequestId, userId');
      }

      // Get travel request details
      const travelRequestDoc = await db.collection('travel_requests').doc(travelRequestId).get();
      if (!travelRequestDoc.exists) {
        throw new Error('Travel request not found');
      }

      const travelRequest = travelRequestDoc.data();
      const startDate = travelRequest?.startDate?.toDate?.() || new Date(travelRequest?.startDate);

      // Build reminder body with key travel details (flight, hotel, rental)
      let body = `Your trip to ${travelRequest?.destination || 'destination'} starts tomorrow.`;
      const flights = travelRequest?.flightBookings as Array<{ airline?: string; flightNumber?: string; departureAirport?: string; arrivalAirport?: string }> | undefined;
      const lodging = travelRequest?.lodgingBookings as Array<{ hotelName?: string; checkInDate?: string }> | undefined;
      const rentals = travelRequest?.rentalCarBookings as Array<{ company?: string; confirmationNumber?: string }> | undefined;
      if (flights?.length) {
        const f = flights[0];
        body += ` Flight: ${f.airline || ''} ${f.flightNumber || ''} ${f.departureAirport || ''} → ${f.arrivalAirport || ''}.`;
      }
      if (lodging?.length) {
        body += ` Hotel: ${lodging[0].hotelName || '—'}.`;
      }
      if (rentals?.length) {
        body += ` Rental: ${rentals[0].company || '—'} (Conf: ${rentals[0].confirmationNumber || '—'}).`;
      }
      body += ' Tap to view full itinerary.';

      // Send notification using the messaging service directly
      const tokensSnapshot = await db
        .collection('users')
        .doc(userId)
        .collection('fcmTokens')
        .where('isActive', '==', true)
        .get();

      if (tokensSnapshot.empty) {
        return createSuccessResponse(
          { sent: false, reason: 'No active tokens' },
          'No active FCM tokens found for user'
        );
      }

      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      const notification: admin.messaging.Notification = {
        title: `Travel Reminder: ${travelRequest?.title || 'Upcoming Trip'}`,
        body,
      };

      const message: admin.messaging.MulticastMessage = {
        notification,
        data: {
          type: 'travel',
          travelType: 'reminder_24h',
          travelRequestId,
          actionUrl: `/travel/${travelRequestId}`,
          timestamp: new Date().toISOString(),
        },
        tokens,
        android: {
          priority: 'high' as const,
          notification: {
            channelId: 'travel_notifications',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await messaging.sendEachForMulticast(message);

      // Log notification
      await db.collection('travel_notifications').add({
        type: 'reminder_24h',
        travelRequestId,
        userId,
        title: notification.title,
        body: notification.body,
        actionUrl: `/travel/${travelRequestId}`,
        tokensSent: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        success: response.successCount > 0,
      });

      return createSuccessResponse(
        {
          sent: response.successCount > 0,
          successCount: response.successCount,
          failureCount: response.failureCount,
        },
        `Reminder sent to ${response.successCount} device(s)`
      );

    } catch (error: any) {
      console.error('❌ [TravelReminder] Error sending reminder:', error);
      return createErrorResponse(
        error.message || 'Failed to send travel reminder',
        error.stack
      );
    }
  }
);
