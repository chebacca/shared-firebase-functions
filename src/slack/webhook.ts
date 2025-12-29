/**
 * Slack Webhook Handler
 * 
 * Receives events from Slack and processes them
 * Handles message events, reactions, mentions for automation triggers
 */

import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as crypto from 'crypto';
import { getSlackConfig } from './config';
import { Timestamp } from 'firebase-admin/firestore';
import { getSlackClient } from './api';

/**
 * Verify Slack request signature
 */
function verifySlackSignature(requestBody: string, signature: string, timestamp: string, signingSecret: string): boolean {
  if (!signingSecret) {
    console.warn('⚠️ [SlackWebhook] No signing secret configured');
    return false;
  }

  // Create signature base string
  const sigBaseString = `v0:${timestamp}:${requestBody}`;
  
  // Create HMAC
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBaseString);
  const expectedSignature = 'v0=' + hmac.digest('hex');

  // Timing-safe comparison
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Slack webhook events
 */
export const slackWebhookHandler = onRequest(
  {
    region: 'us-central1',
    cors: true,
    timeoutSeconds: 30,
  },
  async (request, response) => {
    try {
      // Slack sends POST requests for events
      if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
      }

      const payload = request.body;
      
      // Extract team ID to find organization
      const teamId = payload.team_id || payload.event?.team;
      
      if (!teamId) {
        console.warn('⚠️ [SlackWebhook] No team ID in event');
        response.status(400).send('Bad request');
        return;
      }

      // Find organization by Slack team ID
      const connectionQuery = await db.collectionGroup('slackConnections')
        .where('teamId', '==', teamId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (connectionQuery.empty) {
        console.warn(`⚠️ [SlackWebhook] No active connection found for team: ${teamId}`);
        response.status(404).send('Connection not found');
        return;
      }

      const connectionData = connectionQuery.docs[0].data();
      const organizationId = connectionData.organizationId;

      // Get Slack configuration for signature verification
      const config = await getSlackConfig(organizationId);

      const signature = request.get('x-slack-signature');
      const timestamp = request.get('x-slack-request-timestamp');
      const requestBody = JSON.stringify(request.body);

      // Verify signature
      if (!signature || !timestamp) {
        console.warn('⚠️ [SlackWebhook] Missing signature or timestamp');
        response.status(401).send('Unauthorized');
        return;
      }

      // Check timestamp to prevent replay attacks
      const eventTime = parseInt(timestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - eventTime) > 300) {
        console.warn('⚠️ [SlackWebhook] Request timestamp too old');
        response.status(401).send('Unauthorized');
        return;
      }

      if (!verifySlackSignature(requestBody, signature, timestamp, config.signingSecret)) {
        console.warn('⚠️ [SlackWebhook] Invalid signature');
        response.status(401).send('Unauthorized');
        return;
      }

      // Handle URL verification challenge
      if (payload.type === 'url_verification') {
        console.log('✅ [SlackWebhook] URL verification challenge received');
        response.status(200).json({
          challenge: payload.challenge,
        });
        return;
      }

      // Handle events
      if (payload.type === 'event_callback') {
        const event = payload.event;
        
        console.log(`📥 [SlackWebhook] Received event: ${event.type}`);

        // Process different event types
        switch (event.type) {
          case 'message':
            await handleMessageEvent(event, payload);
            break;
          
          case 'reaction_added':
          case 'reaction_removed':
            await handleReactionEvent(event, payload);
            break;
          
          case 'user_typing':
            await handleTypingEvent(event, payload);
            break;
          
          case 'app_mention':
            await handleAppMentionEvent(event, payload);
            break;
          
          default:
            console.log(`ℹ️ [SlackWebhook] Unhandled event type: ${event.type}`);
        }
      }

      response.status(200).send('OK');

    } catch (error) {
      console.error('❌ [SlackWebhook] Error processing webhook:', error);
      response.status(500).send('Internal server error');
    }
  }
);

/**
 * Handle message events
 */
async function handleMessageEvent(event: any, payload: any): Promise<void> {
  try {
    const { channel, user, text, ts, thread_ts } = event;

    // Find connection by team_id
    const teamId = payload.team_id;
    
    if (!teamId) {
      console.warn('⚠️ [SlackWebhook] No team_id in payload');
      return;
    }

    // Find organization connections with this team
    const connectionsSnapshot = await db
      .collectionGroup('slackConnections')
      .where('teamId', '==', teamId)
      .where('isActive', '==', true)
      .get();

    if (connectionsSnapshot.empty) {
      console.warn(`⚠️ [SlackWebhook] No active connection found for team ${teamId}`);
      return;
    }

    // Process for each connection
    for (const connectionDoc of connectionsSnapshot.docs) {
      const connectionData = connectionDoc.data();
      const orgId = connectionData.organizationId;

      // Store message in Firestore for real-time subscriptions
      // Filter out system messages to only store actual conversation
      const systemSubtypes = [
        'channel_join',
        'channel_leave',
        'channel_topic',
        'channel_purpose',
        'channel_name',
        'channel_archive',
        'channel_unarchive',
        'pinned_item',
        'unpinned_item',
      ];
      
      // Only store messages that are actual conversation (no subtype or meaningful bot messages)
      const shouldStore = !event.subtype || 
                         (event.subtype === 'bot_message' && text && text.trim().length > 0) ||
                         (event.subtype === 'thread_broadcast' && text);
      
      if (shouldStore && !systemSubtypes.includes(event.subtype || '')) {
        try {
          // Update user presence (user is active)
          if (user && !event.subtype) {
            // Only update presence for actual user messages, not bot messages
            try {
              const userPresenceRef = db
                .collection('organizations')
                .doc(orgId)
                .collection('slackUsers')
                .doc(user);
              
              await userPresenceRef.set({
                userId: user,
                status: 'active',
                lastSeen: Timestamp.now(),
                updatedAt: Timestamp.now(),
              }, { merge: true });
            } catch (presenceError) {
              // Don't fail message processing if presence update fails
              console.warn('⚠️ [SlackWebhook] Failed to update user presence:', presenceError);
            }
          }
          
          const messageRef = db
            .collection('organizations')
            .doc(orgId)
            .collection('slackChannels')
            .doc(channel)
            .collection('messages')
            .doc(ts); // Use Slack timestamp as document ID for uniqueness

          await messageRef.set({
            ts,
            channel,
            user,
            text,
            thread_ts: thread_ts || null,
            type: 'message',
            subtype: event.subtype || null,
            client_msg_id: event.client_msg_id || null,
            event_ts: event.event_ts || ts,
            createdAt: Timestamp.fromMillis(parseFloat(ts) * 1000),
            updatedAt: Timestamp.now(),
          }, { merge: true });

          console.log(`📝 [SlackWebhook] Stored message ${ts} in Firestore for channel ${channel}`);

          // Create notifications for mentioned users or DM recipients
          await createSlackNotifications(orgId, channel, user, text, ts);

        } catch (storageError) {
          console.error('❌ [SlackWebhook] Error storing message in Firestore:', storageError);
          // Don't fail the whole event processing
        }
      }

      // Check for automation triggers
      await checkAutomationTriggers({
        organizationId: orgId,
        connectionId: connectionDoc.id,
        channelId: channel,
        userId: user,
        text,
        timestamp: ts,
        threadTs: thread_ts,
        eventType: 'message',
      });
    }

    console.log('✅ [SlackWebhook] Processed message event');

  } catch (error) {
    console.error('❌ [SlackWebhook] Error handling message event:', error);
  }
}

/**
 * Handle reaction events
 */
async function handleReactionEvent(event: any, payload: any): Promise<void> {
  try {
    const { reaction, item, user } = event;
    const { type, channel, ts } = item;

    console.log(`👍 [SlackWebhook] Reaction ${reaction} ${event.type === 'reaction_added' ? 'added' : 'removed'} by ${user}`);

    // Find connection by team_id
    const teamId = payload.team_id;
    
    if (!teamId || !channel || !ts) {
      console.warn('⚠️ [SlackWebhook] Missing team_id, channel, or timestamp in reaction event');
      return;
    }

    // Find organization connections with this team
    const connectionsSnapshot = await db
      .collectionGroup('slackConnections')
      .where('teamId', '==', teamId)
      .where('isActive', '==', true)
      .get();

    if (connectionsSnapshot.empty) {
      console.warn(`⚠️ [SlackWebhook] No active connection found for team ${teamId}`);
      return;
    }

    // Process for each connection (should only be one, but handle multiple)
    for (const connectionDoc of connectionsSnapshot.docs) {
      const connectionData = connectionDoc.data();
      const orgId = connectionData.organizationId;
      const connectionId = connectionDoc.id;

      try {
        // Get Slack client
        const client = await getSlackClient(connectionId, orgId);

        // Fetch the message to get updated reactions
        const messageResult = await client.conversations.history({
          channel: channel,
          latest: ts,
          inclusive: true,
          limit: 1,
        });

        if (!messageResult.ok || !messageResult.messages || messageResult.messages.length === 0) {
          console.warn('⚠️ [SlackWebhook] Could not fetch message for reaction update');
          continue;
        }

        const slackMessage = messageResult.messages[0];

        // Update Firestore message document with reactions
        const messageRef = db
          .collection('organizations')
          .doc(orgId)
          .collection('slackChannels')
          .doc(channel)
          .collection('messages')
          .doc(ts);

        await messageRef.update({
          reactions: slackMessage.reactions || [],
          updatedAt: Timestamp.now(),
        });

        console.log(`✅ [SlackWebhook] Updated message ${ts} with reactions`);

      } catch (error) {
        console.error(`❌ [SlackWebhook] Error updating reaction for connection ${connectionId}:`, error);
        // Continue processing other connections
      }
    }

  } catch (error) {
    console.error('❌ [SlackWebhook] Error handling reaction event:', error);
  }
}

/**
 * Handle typing indicator events
 */
async function handleTypingEvent(event: any, payload: any): Promise<void> {
  try {
    const { channel, user } = event;
    const teamId = payload.team_id;

    if (!channel || !user) {
      return;
    }

    // Find connections
    const connectionsSnapshot = await db
      .collectionGroup('slackConnections')
      .where('teamId', '==', teamId)
      .where('isActive', '==', true)
      .get();

    if (connectionsSnapshot.empty) {
      return;
    }

    // Store typing state in Firestore for real-time subscriptions
    for (const connectionDoc of connectionsSnapshot.docs) {
      const connectionData = connectionDoc.data();
      const orgId = connectionData.organizationId;

      const typingRef = db
        .collection('organizations')
        .doc(orgId)
        .collection('slackChannels')
        .doc(channel)
        .collection('typing')
        .doc(user);

      // Set typing indicator with expiration (3 seconds)
      await typingRef.set({
        userId: user,
        timestamp: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + 3000), // 3 seconds
      });

      // Auto-delete after 3 seconds
      setTimeout(async () => {
        try {
          await typingRef.delete();
        } catch (error) {
          // Ignore errors - typing indicator may have already been cleared
        }
      }, 3000);
    }

    console.log(`✅ [SlackWebhook] Processed typing event for user ${user} in channel ${channel}`);

  } catch (error) {
    console.error('❌ [SlackWebhook] Error handling typing event:', error);
  }
}

/**
 * Create notifications for Slack messages (mentions and DMs)
 */
async function createSlackNotifications(
  organizationId: string,
  channelId: string,
  senderId: string,
  messageText: string,
  messageTs: string
): Promise<void> {
  try {
    // Get channel info to determine if it's a DM
    const channelDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('slackChannels')
      .doc(channelId)
      .get();

    if (!channelDoc.exists) return;

    const channelData = channelDoc.data();
    if (!channelData) return;
    const isDM = channelData.isDM || false;
    const channelName = channelData.channelName || channelId;

    // Extract mentions from message text
    const mentionRegex = /<@([A-Z0-9]+)>/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(messageText)) !== null) {
      mentions.push(match[1]);
    }

    // Get sender info
    const senderDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('slackUsers')
      .doc(senderId)
      .get();
    
    const senderData = senderDoc.exists ? senderDoc.data() : null;
    const senderName = senderData
      ? senderData.name || senderData.realName || 'Unknown User'
      : 'Unknown User';

    const batch = db.batch();
    const recipients = new Set<string>();

    // For DMs, notify the other participant
    if (isDM && channelData && channelData.userId) {
      // Find the recipient (not the sender)
      const recipientId = channelData.userId !== senderId 
        ? channelData.userId 
        : null;
      
      if (recipientId) {
        // Map Slack user ID to Firebase user ID
        // Try to find user in slackUsers collection
        const slackUserDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('slackUsers')
          .doc(recipientId)
          .get();

        if (slackUserDoc.exists) {
          const slackUserData = slackUserDoc.data();
          // Try to find Firebase user by email or Slack user ID mapping
          const firebaseUserId = await findFirebaseUserIdBySlackId(organizationId, recipientId);
          if (firebaseUserId) {
            recipients.add(firebaseUserId);
          }
        }
      }
    }

    // For mentions, notify mentioned users
    for (const mentionedUserId of mentions) {
      const firebaseUserId = await findFirebaseUserIdBySlackId(organizationId, mentionedUserId);
      if (firebaseUserId) {
        recipients.add(firebaseUserId);
      }
    }

    // Create notifications
    recipients.forEach(userId => {
      if (userId !== senderId) {
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
          userId,
          organizationId,
          type: 'slack',
          title: isDM 
            ? `New DM from ${senderName}`
            : `${senderName} mentioned you in #${channelName}`,
          message: messageText.substring(0, 100) + (messageText.length > 100 ? '...' : ''),
          data: {
            channelId,
            channelName,
            senderId,
            senderName,
            messageText,
            messageTs,
            isDM,
          },
          read: false,
          createdAt: Timestamp.now(),
        });
      }
    });

    if (recipients.size > 0) {
      await batch.commit();
      console.log(`✅ [SlackWebhook] Created ${recipients.size} Slack notification(s)`);
    }
  } catch (error) {
    console.warn('⚠️ [SlackWebhook] Failed to create Slack notifications:', error);
    // Don't fail message processing if notification creation fails
  }
}

/**
 * Find Firebase user ID by Slack user ID
 */
async function findFirebaseUserIdBySlackId(organizationId: string, slackUserId: string): Promise<string | null> {
  try {
    // Try to find mapping in slackUsers collection
    const slackUserDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('slackUsers')
      .doc(slackUserId)
      .get();

    if (slackUserDoc.exists) {
      const slackUserData = slackUserDoc.data();
      // Try to find Firebase user by email
      if (slackUserData && slackUserData.email) {
        const contactsQuery = await db
          .collection('clipShowContacts')
          .where('organizationId', '==', organizationId)
          .where('email', '==', slackUserData.email)
          .limit(1)
          .get();

        if (!contactsQuery.empty) {
          return contactsQuery.docs[0].id;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn('⚠️ [SlackWebhook] Error finding Firebase user ID:', error);
    return null;
  }
}

/**
 * Handle app mention events
 */
async function handleAppMentionEvent(event: any, payload: any): Promise<void> {
  try {
    const { channel, user, text, ts } = event;
    const teamId = payload.team_id;

    // Find connections
    const connectionsSnapshot = await db
      .collectionGroup('slackConnections')
      .where('teamId', '==', teamId)
      .where('isActive', '==', true)
      .get();

    if (connectionsSnapshot.empty) {
      return;
    }

    // Process mentions for automation triggers
    for (const connectionDoc of connectionsSnapshot.docs) {
      const connectionData = connectionDoc.data();

      await checkAutomationTriggers({
        organizationId: connectionData.organizationId,
        connectionId: connectionDoc.id,
        channelId: channel,
        userId: user,
        text,
        timestamp: ts,
        eventType: 'mention',
      });
    }

    console.log('✅ [SlackWebhook] Processed app mention event');

  } catch (error) {
    console.error('❌ [SlackWebhook] Error handling mention event:', error);
  }
}

/**
 * Check and trigger automations based on Slack events
 */
async function checkAutomationTriggers(params: {
  organizationId: string;
  connectionId: string;
  channelId: string;
  userId: string;
  text: string;
  timestamp: string;
  threadTs?: string;
  eventType: string;
}): Promise<void> {
  try {
    const { organizationId, channelId, text } = params;

    // Get automation rules that trigger on Slack events
    const rulesSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('automationRules')
      .where('triggers.some.trigger.type', '==', 'slack')
      .get();

    for (const ruleDoc of rulesSnapshot.docs) {
      const ruleData = ruleDoc.data();
      const triggers = ruleData.triggers || [];

      // Check each trigger
      for (const trigger of triggers) {
        if (trigger.trigger?.type === 'slack') {
          // Check if this event matches the trigger
          const triggerChannelId = trigger.trigger.channelId;
          
          // Channel match
          if (triggerChannelId && triggerChannelId !== channelId) {
            continue;
          }

          // Pattern match (if configured)
          const pattern = trigger.trigger.pattern;
          if (pattern) {
            const regex = new RegExp(pattern);
            if (!regex.test(text)) {
              continue;
            }
          }

          // Trigger the automation
          console.log(`🤖 [SlackWebhook] Triggering automation rule: ${ruleDoc.id}`);
          
          // TODO: Call automation executor
          // This would integrate with the existing automation system
        }
      }
    }

  } catch (error) {
    console.error('❌ [SlackWebhook] Error checking automation triggers:', error);
  }
}

