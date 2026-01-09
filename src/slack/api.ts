/**
 * Slack API Proxy Functions
 * 
 * Firebase Functions to proxy Slack API calls
 * Handles all Slack Web API operations securely
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { WebClient } from '@slack/web-api';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from './secrets';
import { decryptToken } from '../integrations/unified-oauth/encryption';



/**
 * Get Slack Web Client for a connection
 */
export async function getSlackClient(connectionId: string, organizationId: string): Promise<WebClient> {
  console.log(`🔍 [SlackAPI] Getting Slack client for connection: ${connectionId}, org: ${organizationId}`);

  const connectionDoc = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('slackConnections')
    .doc(connectionId)
    .get();

  if (!connectionDoc.exists) {
    console.error('❌ [SlackAPI] Connection not found:', { connectionId, organizationId });
    throw new HttpsError('not-found', 'Connection not found');
  }

  const connectionData = connectionDoc.data()!;

  if (!connectionData.isActive) {
    console.error('❌ [SlackAPI] Connection is not active:', { connectionId, organizationId, isActive: connectionData.isActive });
    throw new HttpsError('failed-precondition', 'Connection is not active');
  }

  if (!connectionData.accessToken) {
    console.error('❌ [SlackAPI] Connection missing access token:', {
      connectionId,
      organizationId,
      hasAccessToken: !!connectionData.accessToken,
      connectionDataKeys: Object.keys(connectionData),
    });
    throw new HttpsError('invalid-argument', 'Connection missing access token');
  }

  // Log token format for debugging (without exposing the actual token)
  const tokenPreview = typeof connectionData.accessToken === 'string'
    ? `${connectionData.accessToken.substring(0, 20)}...`
    : 'not-a-string';
  const tokenParts = typeof connectionData.accessToken === 'string'
    ? connectionData.accessToken.split(':').length
    : 0;

  console.log(`🔍 [SlackAPI] Token format check:`, {
    tokenType: typeof connectionData.accessToken,
    tokenLength: typeof connectionData.accessToken === 'string' ? connectionData.accessToken.length : 0,
    tokenParts,
    tokenPreview,
    isValidFormat: tokenParts === 3,
  });

  try {
    const accessToken = decryptToken(connectionData.accessToken);

    if (!accessToken || accessToken.trim().length === 0) {
      console.error('❌ [SlackAPI] Decrypted token is empty:', { connectionId, organizationId });
      throw new Error('Decrypted token is empty');
    }

    // Validate token looks like a Slack token (starts with xoxb- or xoxp-)
    if (!accessToken.startsWith('xoxb-') && !accessToken.startsWith('xoxp-') && !accessToken.startsWith('xoxa-')) {
      console.warn('⚠️ [SlackAPI] Decrypted token does not look like a Slack token:', {
        tokenPrefix: accessToken.substring(0, 10),
        connectionId,
      });
      // Still try to use it, as some token formats might be valid
    }

    console.log(`✅ [SlackAPI] Successfully decrypted token for connection: ${connectionId}`);
    return new WebClient(accessToken);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = {
      connectionId,
      organizationId,
      errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      hasAccessToken: !!connectionData.accessToken,
      accessTokenType: typeof connectionData.accessToken,
    };

    console.error('❌ [SlackAPI] Failed to get Slack client:', errorDetails);

    // Provide more specific error messages based on the error type
    if (errorMessage.includes('Token authentication failed') ||
      errorMessage.includes('corrupted or encrypted with a different key')) {
      throw new HttpsError('failed-precondition', 'Slack connection token is invalid or corrupted. The token may have been encrypted with a different encryption key. Please disconnect and re-connect your Slack workspace to refresh the connection.');
    } else if (errorMessage.includes('Invalid key length')) {
      throw new HttpsError('failed-precondition', 'Slack integration encryption key is misconfigured. ENCRYPTION_KEY secret may be invalid or not set. Please verify the secret is configured correctly and redeploy functions.');
    } else if (errorMessage.includes('Encryption key')) {
      throw new HttpsError('failed-precondition', 'Slack integration encryption is misconfigured. Please contact support.');
    } else if (errorMessage.includes('Invalid token format')) {
      throw new HttpsError('internal', 'Slack connection token is corrupted. Please re-connect your Slack workspace.');
    } else if (errorMessage.includes('Decrypted token')) {
      throw new HttpsError('internal', 'Slack connection token is invalid. Please re-connect your Slack workspace.');
    } else {
      throw new HttpsError('internal', `Failed to authenticate with Slack: ${errorMessage}. Please re-connect your Slack workspace.`);
    }
  }
}

/**
 * Get workspace information
 */
export const slackGetWorkspaceInfo = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId } = request.data as {
        connectionId: string;
        organizationId: string;
      };

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.team.info();

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      return {
        success: true,
        workspace: {
          id: result.team!.id,
          name: result.team!.name,
          domain: result.team!.domain,
        },
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting workspace info:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get workspace info');
    }
  }
);

/**
 * List all channels for a workspace
 */
export const slackListChannels = onCall(
  {
    region: 'us-central1',
    cors: true, // Allow all origins for development, production origins handled by Firebase
    secrets: [encryptionKey],
  },
  async (request) => {
    let connectionId: string | undefined;
    let organizationId: string | undefined;

    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const data = request.data as {
        connectionId: string;
        organizationId: string;
        types?: string; // Comma-separated: public_channel,private_channel,im,mpim
      };

      connectionId = data.connectionId;
      organizationId = data.organizationId;
      const { types } = data;

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const channelTypes = types || 'public_channel,private_channel,im'; // Include DMs by default

      // Get channels
      const channelsResult = await client.conversations.list({
        types: channelTypes,
        exclude_archived: true,
        limit: 1000,
      });

      if (!channelsResult.ok || !channelsResult.channels) {
        throw new HttpsError('internal', `Slack API error: ${channelsResult.error}`);
      }

      // Start with channels from first call
      let allChannels = [...channelsResult.channels];

      // Only fetch IM channels separately if they weren't already included in the first call
      // Check if 'im' is NOT in the channelTypes to avoid duplicate fetching
      if (!channelTypes.includes('im')) {
        // If IM wasn't requested in the first call, fetch it separately if types includes 'im'
        if (types && types.includes('im')) {
          const imResult = await client.conversations.list({
            types: 'im',
            limit: 1000,
          });

          if (imResult.ok && imResult.channels) {
            allChannels = [...allChannels, ...imResult.channels];
          }
        }
      }

      // Store channel info in Firestore for quick access
      // Firestore batch limit is 500 operations, so we need to split into chunks
      const BATCH_SIZE = 500;

      // Filter out channels without IDs before processing
      const validChannels = allChannels.filter(channel => {
        if (!channel.id) {
          console.warn(`⚠️ [SlackAPI] Skipping channel without ID:`, channel);
          return false;
        }
        return true;
      });

      if (validChannels.length > 0) {
        for (let i = 0; i < validChannels.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const chunk = validChannels.slice(i, i + BATCH_SIZE);
          let batchOperationCount = 0;

          for (const channel of chunk) {
            const channelRef = db
              .collection('organizations')
              .doc(organizationId)
              .collection('slackChannels')
              .doc(channel.id!);

            // Determine if this is a DM (IM channel)
            const isDM = channel.is_im === true;

            // Build channel data object, only including userId for DMs (Firestore doesn't allow undefined)
            const channelData: any = {
              connectionId,
              channelId: channel.id,
              channelName: channel.name || '',
              isPrivate: channel.is_private || false,
              isDM: isDM || false,
              isArchived: channel.is_archived || false,
              memberCount: channel.num_members || (isDM ? 2 : 0),
              purpose: channel.purpose?.value || null,
              topic: channel.topic?.value || null,
              lastSyncedAt: Timestamp.now(),
              isMuted: false,
              notificationsEnabled: true,
            };

            // Only include userId for DMs (omit for non-DM channels to avoid undefined)
            if (isDM && channel.user) {
              channelData.userId = channel.user;
            }

            batch.set(channelRef, channelData, { merge: true });

            batchOperationCount++;
          }

          // Only commit if batch has operations
          if (batchOperationCount > 0) {
            await batch.commit();
            console.log(`✅ [SlackAPI] Committed batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batchOperationCount} channels`);
          }
        }
      }

      console.log(`✅ [SlackAPI] Listed ${validChannels.length} valid channels for connection ${connectionId}`);

      return {
        success: true,
        channels: validChannels.map(channel => ({
          id: channel.id!,
          name: channel.name || '',
          isPrivate: channel.is_private || false,
          isArchived: channel.is_archived || false,
          memberCount: channel.num_members || 0,
          purpose: channel.purpose?.value || null,
          topic: channel.topic?.value || null,
        })),
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error listing channels:', error);

      // Provide more specific error messages
      if (error instanceof HttpsError) {
        // Re-throw HttpsErrors as-is (they already have proper error codes and messages)
        throw error;
      }

      // Check if error is from getSlackClient or decryptToken
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log the full error for debugging
      console.error('Error details:', {
        errorMessage,
        errorStack,
        connectionId,
        organizationId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });

      // Provide more specific error messages based on error content
      if (errorMessage.includes('Token authentication failed') ||
        errorMessage.includes('corrupted or encrypted with a different key')) {
        throw new HttpsError('failed-precondition', 'Slack connection token is invalid or corrupted. Please disconnect and re-connect your Slack workspace to refresh the connection.');
      } else if (errorMessage.includes('Connection not found')) {
        throw new HttpsError('not-found', 'Slack connection not found. Please reconnect your Slack workspace.');
      } else if (errorMessage.includes('Connection is not active')) {
        throw new HttpsError('failed-precondition', 'Slack connection is not active. Please reconnect your Slack workspace.');
      } else if (errorMessage.includes('missing access token') || errorMessage.includes('Connection missing access token')) {
        throw new HttpsError('failed-precondition', 'Slack connection is missing access token. Please reconnect your Slack workspace.');
      } else if (errorMessage.includes('Encryption key') || errorMessage.includes('ENCRYPTION_KEY')) {
        throw new HttpsError('failed-precondition', 'Slack integration encryption is misconfigured. Please contact support.');
      } else if (errorMessage.includes('Slack API error')) {
        // Extract the actual Slack API error if available
        const slackErrorMatch = errorMessage.match(/Slack API error: (.+)/);
        if (slackErrorMatch) {
          throw new HttpsError('internal', `Slack API error: ${slackErrorMatch[1]}. Please try again or reconnect your workspace.`);
        }
        throw new HttpsError('internal', 'Slack API returned an error. Please try again or reconnect your workspace.');
      } else {
        // Generic fallback with more context
        throw new HttpsError('internal', `Failed to list channels: ${errorMessage}. Please try again or reconnect your Slack workspace.`);
      }
    }
  }
);

/**
 * Open or create a Direct Message conversation
 */
export const slackOpenDM = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, userId } = request.data as {
        connectionId: string;
        organizationId: string;
        userId: string;
      };

      if (!connectionId || !organizationId || !userId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Open or create DM conversation
      const result = await client.conversations.open({
        users: userId,
      });

      if (!result.ok || !result.channel) {
        throw new HttpsError('internal', `Slack API error: ${result.error || 'Failed to open DM'}`);
      }

      const dmChannel = result.channel;

      // Store DM channel info in Firestore
      const channelRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackChannels')
        .doc(dmChannel.id!);

      await channelRef.set({
        connectionId,
        channelId: dmChannel.id!,
        channelName: dmChannel.id!.startsWith('D') ? `DM-${userId}` : (dmChannel as any).name || `DM-${userId}`,
        isPrivate: true,
        isDM: true,
        userId: userId, // Store the user ID for the DM
        isArchived: false,
        memberCount: 2, // DM has 2 members
        lastSyncedAt: Timestamp.now(),
        isMuted: false,
        notificationsEnabled: true,
      }, { merge: true });

      console.log(`✅ [SlackAPI] Opened DM with user ${userId}, channel: ${dmChannel.id!}`);

      return {
        success: true,
        channel: {
          id: dmChannel.id!,
          name: dmChannel.id!.startsWith('D') ? `DM-${userId}` : (dmChannel as any).name || `DM-${userId}`,
          isDM: true,
          userId: userId,
        },
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error opening DM:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to open DM');
    }
  }
);

/**
 * Get channel message history
 */
export const slackGetChannelHistory = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, limit = 100, oldest, latest } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        limit?: number;
        oldest?: string;
        latest?: string;
      };

      if (!connectionId || !organizationId || !channelId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      console.log(`🔍 [SlackAPI] Getting channel history for channel: ${channelId}, connection: ${connectionId}`);

      const client = await getSlackClient(connectionId, organizationId);

      try {
        const result = await client.conversations.history({
          channel: channelId,
          limit,
          oldest,
          latest,
          // Include files and attachments in the response
          include_all_metadata: true,
        });

        if (!result.ok) {
          const errorCode = result.error || 'unknown_error';
          const errorMsg = result.response_metadata?.messages?.[0] || result.error || 'Unknown Slack API error';

          // Handle specific Slack error codes
          if (errorCode === 'not_in_channel' || errorCode === 'channel_not_found') {
            // Log as warning for expected "not_in_channel" errors
            console.warn('⚠️ [SlackAPI] Bot not in channel:', {
              errorCode,
              channelId,
              connectionId,
              organizationId,
            });
            throw new HttpsError(
              'failed-precondition',
              `Bot is not in channel ${channelId}. The Slack app needs to be added to the channel to read message history.`
            );
          } else if (errorCode === 'not_authed' || errorCode === 'invalid_auth') {
            console.error('❌ [SlackAPI] Slack API returned error:', {
              errorCode,
              errorMsg,
              channelId,
              connectionId,
              organizationId,
            });
            throw new HttpsError(
              'unauthenticated',
              'Slack authentication failed. Please re-connect your Slack workspace.'
            );
          } else if (errorCode === 'account_inactive') {
            console.error('❌ [SlackAPI] Slack API returned error:', {
              errorCode,
              errorMsg,
              channelId,
              connectionId,
              organizationId,
            });
            throw new HttpsError(
              'failed-precondition',
              'Slack workspace account is inactive. Please check your Slack workspace status.'
            );
          } else if (errorCode === 'token_revoked') {
            console.error('❌ [SlackAPI] Slack API returned error:', {
              errorCode,
              errorMsg,
              channelId,
              connectionId,
              organizationId,
            });
            throw new HttpsError(
              'unauthenticated',
              'Slack token has been revoked. Please re-connect your Slack workspace.'
            );
          } else {
            console.error('❌ [SlackAPI] Slack API returned error:', {
              errorCode,
              errorMsg,
              channelId,
              connectionId,
              organizationId,
            });
            throw new HttpsError(
              'internal',
              `Slack API error (${errorCode}): ${errorMsg}`
            );
          }
        }

        if (!result.messages) {
          console.warn('⚠️ [SlackAPI] No messages returned for channel:', { channelId });
          return {
            success: true,
            messages: [],
            hasMore: false,
            oldest: undefined,
            latest: undefined,
          };
        }

        // Filter out system messages (join events, integrations, etc.) to show only actual conversation
        const systemMessageSubtypes = [
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

        const conversationMessages = result.messages.filter((msg: any) => {
          // Include messages without a subtype (regular user messages)
          if (!msg.subtype) return true;

          // Include bot messages and messages with text content
          if (msg.subtype === 'bot_message' && msg.text) return true;

          // Include thread replies
          if (msg.subtype === 'thread_broadcast') return true;

          // Exclude system messages
          if (systemMessageSubtypes.includes(msg.subtype)) return false;

          // Include other subtypes if they have meaningful text content
          return msg.text && msg.text.trim().length > 0;
        });

        console.log(`✅ [SlackAPI] Retrieved ${result.messages.length} messages from channel ${channelId} (${conversationMessages.length} conversation messages after filtering)`);

        return {
          success: true,
          messages: conversationMessages,
          hasMore: !!result.has_more,
          oldest: result.has_more ? result.messages[0]?.ts : undefined,
          latest: result.messages[result.messages.length - 1]?.ts,
        };
      } catch (apiError: any) {
        // Re-throw HttpsError as-is
        if (apiError instanceof HttpsError) {
          throw apiError;
        }

        // Handle WebClient errors (e.g., network errors, rate limits, Slack API errors)
        const errorMessage = apiError?.message || String(apiError);
        const errorCode = apiError?.code || apiError?.data?.error || 'unknown_error';

        // Extract error from Slack SDK error response if available
        // Slack SDK wraps errors like: "An API error occurred: not_in_channel (slack_webapi_platform_error)"
        const slackErrorCode = apiError?.data?.error ||
          apiError?.data?.error_code ||
          (errorMessage.match(/not_in_channel|channel_not_found|not_authed|invalid_auth|token_revoked/i)?.[0]?.toLowerCase()) ||
          (errorMessage.match(/\((\w+)\)/)?.[1]); // Extract error code from parentheses

        console.error('❌ [SlackAPI] Error calling conversations.history:', {
          errorMessage,
          errorCode,
          slackErrorCode,
          errorType: apiError?.constructor?.name,
          channelId,
          connectionId,
          organizationId,
          data: apiError?.data,
          fullError: apiError,
          stack: apiError?.stack,
        });

        // Handle specific Slack error codes from SDK exceptions
        // Check both the extracted code and the error message for common patterns
        const hasNotInChannel = slackErrorCode === 'not_in_channel' ||
          errorMessage.includes('not_in_channel') ||
          errorMessage.includes('not in channel');
        const hasChannelNotFound = slackErrorCode === 'channel_not_found' ||
          errorMessage.includes('channel_not_found') ||
          errorMessage.includes('channel not found');
        const hasAuthError = slackErrorCode === 'not_authed' ||
          slackErrorCode === 'invalid_auth' ||
          errorMessage.includes('not_authed') ||
          errorMessage.includes('invalid_auth');
        const hasTokenRevoked = slackErrorCode === 'token_revoked' ||
          errorMessage.includes('token_revoked');

        if (hasNotInChannel) {
          throw new HttpsError(
            'failed-precondition',
            `Bot is not in channel ${channelId}. Please add the Slack app to this channel to read messages. To add: Open Slack → Go to the channel → Click channel name → Integrations → Add apps → Search for your app.`
          );
        } else if (hasChannelNotFound) {
          throw new HttpsError(
            'failed-precondition',
            `Channel ${channelId} not found. The channel may have been deleted or you don't have access to it.`
          );
        } else if (hasAuthError) {
          throw new HttpsError(
            'unauthenticated',
            'Slack authentication failed. Please re-connect your Slack workspace.'
          );
        } else if (hasTokenRevoked) {
          throw new HttpsError(
            'unauthenticated',
            'Slack token has been revoked. Please re-connect your Slack workspace.'
          );
        } else if (errorCode === 'ratelimited' || errorMessage.includes('rate_limit')) {
          const retryAfter = apiError?.data?.retryAfter || 60;
          throw new HttpsError(
            'resource-exhausted',
            `Slack API rate limit exceeded. Please try again in ${retryAfter} seconds.`
          );
        }

        // Re-throw with more context
        throw new HttpsError(
          'internal',
          `Failed to get channel history: ${errorMessage}${slackErrorCode ? ` (${slackErrorCode})` : ''}`
        );
      }

    } catch (error) {
      // Re-throw HttpsError as-is
      if (error instanceof HttpsError) {
        throw error;
      }

      // Log unexpected errors
      console.error('❌ [SlackAPI] Unexpected error getting channel history:', {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new HttpsError(
        'internal',
        `Failed to get channel history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
);

/**
 * Send message to Slack channel
 */
export const slackSendMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, text, threadTs, blocks } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        text: string;
        threadTs?: string;
        blocks?: any[];
      };

      if (!connectionId || !organizationId || !channelId || !text) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.chat.postMessage({
        channel: channelId,
        text,
        thread_ts: threadTs,
        blocks,
        unfurl_links: true,
        unfurl_media: true,
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Sent message to channel ${channelId}`);

      return {
        success: true,
        message: result.message,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error sending message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to send message');
    }
  }
);

/**
 * Add reaction to a message
 */
export const slackAddReaction = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, timestamp, name } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        timestamp: string;
        name: string;
      };

      if (!connectionId || !organizationId || !channelId || !timestamp || !name) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Slack API expects emoji name without colons (e.g., "+1" not ":+1:")
      const emojiName = name.startsWith(':') && name.endsWith(':')
        ? name.slice(1, -1)
        : name;

      console.log(`[SlackAPI] Adding reaction: ${emojiName} to channel ${channelId}, timestamp ${timestamp}`);

      const result = await client.reactions.add({
        channel: channelId,
        timestamp,
        name: emojiName,
      });

      if (!result.ok) {
        console.error(`[SlackAPI] Slack API error: ${result.error}`);
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Added reaction ${emojiName} to message`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error adding reaction:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to add reaction');
    }
  }
);

/**
 * Get thread replies
 */
export const slackGetThreadReplies = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, threadTs } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        threadTs: string;
      };

      if (!connectionId || !organizationId || !channelId || !threadTs) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      if (!result.ok || !result.messages) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Retrieved ${result.messages.length} thread replies`);

      return {
        success: true,
        replies: result.messages.slice(1), // Skip first message (parent)
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting thread replies:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get thread replies');
    }
  }
);

/**
 * Upload file to Slack channel
 */
export const slackUploadFile = onCall(
  {
    region: 'us-central1',
    cors: true,
    maxInstances: 10,
    timeoutSeconds: 60,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, fileBase64, filename, title, filetype } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        fileBase64: string;
        filename: string;
        title?: string;
        filetype?: string;
      };

      if (!connectionId || !organizationId || !channelId || !fileBase64 || !filename) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const fileBuffer = Buffer.from(fileBase64, 'base64');

      const result = await client.files.uploadV2({
        channel_id: channelId,
        file: fileBuffer,
        filename,
        title: title || filename,
        filetype: filetype || 'auto',
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Uploaded file ${filename} to channel ${channelId}`);

      return {
        success: true,
        file: result,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error uploading file:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to upload file');
    }
  }
);

/**
 * Get workspace users list
 */
export const slackGetUsers = onCall(
  {
    region: 'us-central1',
    cors: [
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4006',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4010',
      'http://localhost:5173',
      'https://backbone-client.web.app',
      'https://backbone-logic.web.app',
      'https://backbone-callsheet-standalone.web.app',
      'https://clipshowpro.web.app'
    ],
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId } = request.data as {
        connectionId: string;
        organizationId: string;
      };

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.users.list({
        limit: 1000,
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      // Map Slack users to our format
      const users = (result.members || []).map((member: any) => ({
        id: member.id,
        name: member.name,
        realName: member.real_name || member.name,
        displayName: member.profile?.display_name || member.real_name || member.name,
        email: member.profile?.email,
        image24: member.profile?.image_24,
        image32: member.profile?.image_32,
        image48: member.profile?.image_48,
        image72: member.profile?.image_72,
        image192: member.profile?.image_192,
        image512: member.profile?.image_512,
        isBot: member.is_bot || false,
        isAppUser: member.is_app_user || false,
      }));

      console.log(`✅ [SlackAPI] Retrieved ${users.length} users`);

      return {
        success: true,
        users,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting users:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get users');
    }
  }
);

/**
 * Update a message in Slack
 */
export const slackUpdateMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, messageTs, text, blocks } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        messageTs: string;
        text: string;
        blocks?: any[];
      };

      if (!connectionId || !organizationId || !channelId || !messageTs || !text) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text,
        blocks,
      });

      if (!result.ok) {
        const errorCode = result.error || 'unknown_error';
        if (errorCode === 'message_not_found') {
          throw new HttpsError('not-found', 'Message not found');
        } else if (errorCode === 'edit_window_closed') {
          throw new HttpsError('failed-precondition', 'Message edit window has closed');
        } else if (errorCode === 'cant_update_message') {
          throw new HttpsError('permission-denied', 'You do not have permission to edit this message');
        }
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Updated message ${messageTs} in channel ${channelId}`);

      return {
        success: true,
        message: result.message,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error updating message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to update message');
    }
  }
);

/**
 * Delete a message in Slack
 */
export const slackDeleteMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, messageTs } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        messageTs: string;
      };

      if (!connectionId || !organizationId || !channelId || !messageTs) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.chat.delete({
        channel: channelId,
        ts: messageTs,
      });

      if (!result.ok) {
        const errorCode = result.error || 'unknown_error';
        if (errorCode === 'message_not_found') {
          throw new HttpsError('not-found', 'Message not found');
        } else if (errorCode === 'cant_delete_message') {
          throw new HttpsError('permission-denied', 'You do not have permission to delete this message');
        }
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Deleted message ${messageTs} from channel ${channelId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error deleting message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to delete message');
    }
  }
);

/**
 * Pin a message in Slack channel
 */
export const slackPinMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, messageTs } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        messageTs: string;
      };

      if (!connectionId || !organizationId || !channelId || !messageTs) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.pins.add({
        channel: channelId,
        timestamp: messageTs,
      });

      if (!result.ok) {
        const errorCode = result.error || 'unknown_error';
        if (errorCode === 'message_not_found') {
          throw new HttpsError('not-found', 'Message not found');
        } else if (errorCode === 'already_pinned') {
          throw new HttpsError('already-exists', 'Message is already pinned');
        } else if (errorCode === 'cant_pin_message') {
          throw new HttpsError('permission-denied', 'You do not have permission to pin messages in this channel');
        }
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Pinned message ${messageTs} in channel ${channelId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error pinning message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to pin message');
    }
  }
);

/**
 * Unpin a message from Slack channel
 */
export const slackUnpinMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, messageTs } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        messageTs: string;
      };

      if (!connectionId || !organizationId || !channelId || !messageTs) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.pins.remove({
        channel: channelId,
        timestamp: messageTs,
      });

      if (!result.ok) {
        const errorCode = result.error || 'unknown_error';
        if (errorCode === 'message_not_found') {
          throw new HttpsError('not-found', 'Message not found');
        } else if (errorCode === 'not_pinned') {
          throw new HttpsError('failed-precondition', 'Message is not pinned');
        }
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Unpinned message ${messageTs} from channel ${channelId}`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error unpinning message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to unpin message');
    }
  }
);

/**
 * Get channel information including details, members, and pinned messages
 */
export const slackGetChannelInfo = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
      };

      if (!connectionId || !organizationId || !channelId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Get channel info
      const channelInfoResult = await client.conversations.info({
        channel: channelId,
      });

      if (!channelInfoResult.ok || !channelInfoResult.channel) {
        throw new HttpsError('internal', `Slack API error: ${channelInfoResult.error}`);
      }

      const channel = channelInfoResult.channel;

      // Get channel members
      let members: string[] = [];
      try {
        const membersResult = await client.conversations.members({
          channel: channelId,
        });

        if (membersResult.ok && membersResult.members) {
          members = membersResult.members;
        }
      } catch (error) {
        console.warn('⚠️ [SlackAPI] Could not fetch channel members:', error);
        // Continue without members if we can't fetch them
      }

      // Get pinned messages
      let pinnedItems: any[] = [];
      try {
        const pinsResult = await client.pins.list({
          channel: channelId,
        });

        if (pinsResult.ok && pinsResult.items) {
          pinnedItems = pinsResult.items;
        }
      } catch (error) {
        console.warn('⚠️ [SlackAPI] Could not fetch pinned messages:', error);
        // Continue without pinned items if we can't fetch them
      }

      console.log(`✅ [SlackAPI] Retrieved channel info for ${channelId}: ${members.length} members, ${pinnedItems.length} pinned items`);

      return {
        success: true,
        channel: {
          id: channel.id,
          name: channel.name,
          topic: channel.topic?.value || '',
          purpose: channel.purpose?.value || '',
          isPrivate: channel.is_private || false,
          isArchived: channel.is_archived || false,
          memberCount: channel.num_members || members.length,
          created: channel.created,
        },
        members,
        pinnedItems,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting channel info:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get channel info');
    }
  }
);

/**
 * Search messages in Slack
 */
export const slackSearchMessages = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, query, channelId, sort, count } = request.data as {
        connectionId: string;
        organizationId: string;
        query: string;
        channelId?: string;
        sort?: 'score' | 'timestamp';
        count?: number;
      };

      if (!connectionId || !organizationId || !query) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Build search query
      let searchQuery = query;
      if (channelId) {
        searchQuery = `in:${channelId} ${query}`;
      }

      const result = await client.search.messages({
        query: searchQuery,
        sort: sort || 'score',
        count: count || 20,
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Search results: ${result.messages?.total || 0} total, ${result.messages?.matches?.length || 0} matches`);

      return {
        success: true,
        messages: result.messages?.matches || [],
        total: result.messages?.total || 0,
        query: result.query || query,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error searching messages:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to search messages');
    }
  }
);

/**
 * Remove reaction from a message
 */
export const slackRemoveReaction = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, timestamp, name } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        timestamp: string;
        name: string;
      };

      if (!connectionId || !organizationId || !channelId || !timestamp || !name) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Slack API expects emoji name without colons (e.g., "+1" not ":+1:")
      const emojiName = name.startsWith(':') && name.endsWith(':')
        ? name.slice(1, -1)
        : name;

      console.log(`[SlackAPI] Removing reaction: ${emojiName} from channel ${channelId}, timestamp ${timestamp}`);

      const result = await client.reactions.remove({
        channel: channelId,
        timestamp,
        name: emojiName,
      });

      if (!result.ok) {
        console.error(`[SlackAPI] Slack API error: ${result.error}`);
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Removed reaction ${emojiName} from message`);

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error removing reaction:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to remove reaction');
    }
  }
);

/**
 * Send typing indicator to Slack channel
 */
export const slackSetTyping = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
      };

      if (!connectionId || !organizationId || !channelId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      // Set typing indicator using conversations.mark with typing parameter
      // Note: Slack SDK doesn't have a direct setTyping method, so we use conversations.mark
      // However, typing indicators are typically handled via RTM or Events API
      // For now, we'll skip this as it's not a standard API endpoint
      // The typing indicator should be handled via webhooks instead

      return {
        success: true,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error setting typing indicator:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to set typing indicator');
    }
  }
);

/**
 * Get user presence/status
 */
export const slackGetUserPresence = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, userId } = request.data as {
        connectionId: string;
        organizationId: string;
        userId: string;
      };

      if (!connectionId || !organizationId || !userId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.users.getPresence({
        user: userId,
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Retrieved user presence for ${userId}: ${result.presence}`);

      return {
        success: true,
        presence: result.presence, // 'active', 'away', 'auto'
        online: result.presence === 'active',
        autoAway: result.presence === 'auto',
        manualAway: result.presence === 'away',
        connectionCount: result.connection_count || 0,
        lastActivity: result.last_activity || null,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting user presence:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get user presence');
    }
  }
);

/**
 * Get file information
 */
export const slackGetFileInfo = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, fileId } = request.data as {
        connectionId: string;
        organizationId: string;
        fileId: string;
      };

      if (!connectionId || !organizationId || !fileId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.files.info({
        file: fileId,
      });

      if (!result.ok || !result.file) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Retrieved file info for ${fileId}`);

      return {
        success: true,
        file: result.file,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting file info:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get file info');
    }
  }
);

/**
 * Get file list for a channel
 */
export const slackGetFileList = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, count, page } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId?: string;
        count?: number;
        page?: number;
      };

      if (!connectionId || !organizationId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.files.list({
        channel: channelId,
        count: count || 100,
        page: page || 1,
      });

      if (!result.ok) {
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Retrieved ${result.files?.length || 0} files`);

      return {
        success: true,
        files: result.files || [],
        paging: result.paging || null,
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting file list:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get file list');
    }
  }
);

/**
 * Schedule a message to be sent later
 */
export const slackScheduleMessage = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, text, scheduledTime, blocks } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        text: string;
        scheduledTime: number; // Unix timestamp in milliseconds
        blocks?: any[];
      };

      if (!connectionId || !organizationId || !channelId || !text || !scheduledTime) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      // Validate scheduled time is in the future
      if (scheduledTime <= Date.now()) {
        throw new HttpsError('invalid-argument', 'Scheduled time must be in the future');
      }

      const db = admin.firestore();

      // Store scheduled message in Firestore
      const scheduledMessageRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackScheduledMessages')
        .doc();

      await scheduledMessageRef.set({
        connectionId,
        organizationId,
        channelId,
        text,
        blocks: blocks || [],
        scheduledTime: Timestamp.fromMillis(scheduledTime),
        createdAt: FieldValue.serverTimestamp(),
        status: 'pending',
      });

      console.log(`✅ [SlackAPI] Scheduled message for ${new Date(scheduledTime).toISOString()}`);

      return {
        success: true,
        scheduledMessageId: scheduledMessageRef.id,
        scheduledTime: new Date(scheduledTime).toISOString(),
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error scheduling message:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to schedule message');
    }
  }
);

/**
 * Set a reminder for a message
 */
export const slackSetReminder = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId, messageTs, reminderTime, userId } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
        messageTs: string;
        reminderTime: number; // Unix timestamp in milliseconds
        userId: string;
      };

      if (!connectionId || !organizationId || !channelId || !messageTs || !reminderTime || !userId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      // Validate reminder time is in the future
      if (reminderTime <= Date.now()) {
        throw new HttpsError('invalid-argument', 'Reminder time must be in the future');
      }

      const db = admin.firestore();

      // Store reminder in Firestore
      const reminderRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('slackReminders')
        .doc();

      await reminderRef.set({
        connectionId,
        organizationId,
        channelId,
        messageTs,
        userId,
        reminderTime: Timestamp.fromMillis(reminderTime),
        createdAt: FieldValue.serverTimestamp(),
        status: 'pending',
      });

      console.log(`✅ [SlackAPI] Set reminder for ${new Date(reminderTime).toISOString()}`);

      return {
        success: true,
        reminderId: reminderRef.id,
        reminderTime: new Date(reminderTime).toISOString(),
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error setting reminder:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to set reminder');
    }
  }
);

/**
 * Get pinned messages for a Slack channel
 */
export const slackGetPinnedMessages = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { connectionId, organizationId, channelId } = request.data as {
        connectionId: string;
        organizationId: string;
        channelId: string;
      };

      if (!connectionId || !organizationId || !channelId) {
        throw new HttpsError('invalid-argument', 'Missing required parameters');
      }

      const client = await getSlackClient(connectionId, organizationId);

      const result = await client.pins.list({
        channel: channelId,
      });

      if (!result.ok) {
        const errorCode = result.error || 'unknown_error';
        if (errorCode === 'channel_not_found') {
          throw new HttpsError('not-found', 'Channel not found');
        }
        throw new HttpsError('internal', `Slack API error: ${result.error}`);
      }

      console.log(`✅ [SlackAPI] Retrieved ${result.items?.length || 0} pinned items for channel ${channelId}`);

      return {
        success: true,
        pinnedItems: result.items || [],
      };

    } catch (error) {
      console.error('❌ [SlackAPI] Error getting pinned messages:', error);
      throw error instanceof HttpsError ? error : new HttpsError('internal', 'Failed to get pinned messages');
    }
  }
);

