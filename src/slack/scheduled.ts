/**
 * Scheduled Slack Messages
 * 
 * Cloud Function scheduled trigger to send pending scheduled messages
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getSlackClient } from './api';

/**
 * Check and send scheduled messages every minute
 */
export const checkScheduledMessages = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeZone: 'America/Los_Angeles',
    memory: '512MiB', // Increased from default 256MiB - function runs out of memory during initialization
  },
  async (event) => {
    const db = getFirestore();
    const now = Timestamp.now();

    try {
      // Find all pending scheduled messages that are due
      const scheduledMessagesSnapshot = await db
        .collectionGroup('slackScheduledMessages')
        .where('status', '==', 'pending')
        .where('scheduledTime', '<=', now)
        .limit(100)
        .get();

      console.log(`📅 [ScheduledMessages] Found ${scheduledMessagesSnapshot.size} messages to send`);

      for (const doc of scheduledMessagesSnapshot.docs) {
        const messageData = doc.data();
        const { connectionId, organizationId, channelId, text, blocks } = messageData;

        try {
          // Get Slack client
          const client = await getSlackClient(connectionId, organizationId);

          // Send message
          const result = await client.chat.postMessage({
            channel: channelId,
            text,
            blocks: blocks || undefined,
          });

          if (result.ok) {
            // Mark as sent
            await doc.ref.update({
              status: 'sent',
              sentAt: FieldValue.serverTimestamp(),
              messageTs: result.ts,
            });

            console.log(`✅ [ScheduledMessages] Sent scheduled message ${doc.id} to channel ${channelId}`);
          } else {
            // Mark as failed
            await doc.ref.update({
              status: 'failed',
              error: result.error,
              failedAt: FieldValue.serverTimestamp(),
            });

            console.error(`❌ [ScheduledMessages] Failed to send scheduled message ${doc.id}: ${result.error}`);
          }
        } catch (error: any) {
          // Mark as failed
          await doc.ref.update({
            status: 'failed',
            error: error.message || String(error),
            failedAt: FieldValue.serverTimestamp(),
          });

          console.error(`❌ [ScheduledMessages] Error sending scheduled message ${doc.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ [ScheduledMessages] Error checking scheduled messages:', error);
    }
  }
);

/**
 * Check and send reminders every minute
 */
export const checkReminders = onSchedule(
  {
    schedule: 'every 1 minutes',
    region: 'us-central1',
    timeZone: 'America/Los_Angeles',
  },
  async (event) => {
    const db = getFirestore();
    const now = Timestamp.now();

    try {
      // Find all pending reminders that are due
      const remindersSnapshot = await db
        .collectionGroup('slackReminders')
        .where('status', '==', 'pending')
        .where('reminderTime', '<=', now)
        .limit(100)
        .get();

      console.log(`⏰ [Reminders] Found ${remindersSnapshot.size} reminders to send`);

      for (const doc of remindersSnapshot.docs) {
        const reminderData = doc.data();
        const { connectionId, organizationId, channelId, messageTs, userId } = reminderData;

        try {
          // Get Slack client
          const client = await getSlackClient(connectionId, organizationId);

          // Send reminder notification to user
          await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: `⏰ Reminder: You asked to be reminded about a message in <#${channelId}>.`,
            attachments: [
              {
                text: `Jump to message: <https://slack.com/archives/${channelId}/p${messageTs.replace('.', '')}|View Message>`,
                color: 'warning',
              },
            ],
          });

          // Mark as sent
          await doc.ref.update({
            status: 'sent',
            sentAt: FieldValue.serverTimestamp(),
          });

          console.log(`✅ [Reminders] Sent reminder ${doc.id} to user ${userId}`);
        } catch (error: any) {
          // Mark as failed
          await doc.ref.update({
            status: 'failed',
            error: error.message || String(error),
            failedAt: FieldValue.serverTimestamp(),
          });

          console.error(`❌ [Reminders] Error sending reminder ${doc.id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ [Reminders] Error checking reminders:', error);
    }
  }
);

