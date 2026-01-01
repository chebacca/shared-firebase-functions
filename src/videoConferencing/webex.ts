/**
 * Webex Video Conferencing Functions
 * 
 * Functions to create, schedule, and manage Webex meetings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, getUserOrganizationId, isAdminUser } from '../shared/utils';
import { getWebexConfig } from '../webex/config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from '../webex/secrets';
import axios from 'axios';
import * as crypto from 'crypto';

// CORS allowed origins for video conferencing functions
const CORS_ORIGINS = [
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
];

/**
 * Decrypt token (reuse from webex/oauth pattern)
 */
function decryptToken(encryptedData: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const algorithm = 'aes-256-gcm';
  const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get authenticated Webex access token for organization
 */
async function getAuthenticatedWebexToken(organizationId: string): Promise<string> {
  // Get organization's Webex connection
  const connectionsSnapshot = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('webexConnections')
    .where('type', '==', 'organization')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (connectionsSnapshot.empty) {
    throw new HttpsError('failed-precondition', 'No active Webex connection found for organization');
  }

  const connection = connectionsSnapshot.docs[0].data();

  // Check if token is expired
  const now = Date.now();
  const expiresAt = connection.tokenExpiresAt?.toMillis() || 0;

  let accessToken = decryptToken(connection.accessToken);

  // Refresh token if expired or about to expire (within 5 minutes)
  if (expiresAt < now + (5 * 60 * 1000)) {
    if (connection.refreshToken) {
      try {
        const config = await getWebexConfig(organizationId);
        const refreshToken = decryptToken(connection.refreshToken);

        const tokenResponse = await axios.post('https://webexapis.com/v1/access_token', {
          grant_type: 'refresh_token',
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
        }, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        const { access_token, expires_in } = tokenResponse.data;
        accessToken = access_token;

        // Encrypt new token properly
        const algorithm = 'aes-256-gcm';
        const key = crypto.createHash('sha256').update(getEncryptionKey(), 'utf8').digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(access_token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        const encryptedAccessToken = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

        // Also update refresh token if provided
        let encryptedRefreshToken = connection.refreshToken;
        if (tokenResponse.data.refresh_token) {
          const refreshIv = crypto.randomBytes(16);
          const refreshCipher = crypto.createCipheriv(algorithm, key, refreshIv);
          let refreshEncrypted = refreshCipher.update(tokenResponse.data.refresh_token, 'utf8', 'hex');
          refreshEncrypted += refreshCipher.final('hex');
          const refreshAuthTag = refreshCipher.getAuthTag();
          encryptedRefreshToken = `${refreshIv.toString('hex')}:${refreshAuthTag.toString('hex')}:${refreshEncrypted}`;
        }

        // Update connection with new token
        const updateData: any = {
          accessToken: encryptedAccessToken,
          tokenExpiresAt: Timestamp.fromMillis(Date.now() + (expires_in * 1000)),
        };
        if (encryptedRefreshToken !== connection.refreshToken) {
          updateData.refreshToken = encryptedRefreshToken;
        }
        await connectionsSnapshot.docs[0].ref.update(updateData);
      } catch (error) {
        console.warn('⚠️ [Webex] Token refresh failed, using existing token');
      }
    }
  }

  return accessToken;
}

/**
 * Create instant Webex meeting
 */
export const createWebexMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, title, participants } = request.data as {
        organizationId: string;
        title?: string;
        participants?: string[];
      };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      // Get authenticated token
      const accessToken = await getAuthenticatedWebexToken(organizationId);

      // Create Webex meeting
      const meetingResponse = await axios.post(
        'https://webexapis.com/v1/meetings',
        {
          title: title || 'Instant Meeting',
          start: new Date().toISOString(),
          end: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour default
          invitees: participants || [],
          enableJoinBeforeHost: true,
          autoRecord: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const meetingData = meetingResponse.data;

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'webex',
          title: meetingData.title || title || 'Instant Meeting',
          meetingUrl: meetingData.webLink || meetingData.joinUrl,
          joinUrl: meetingData.joinUrl || meetingData.webLink,
          startTime: meetingData.start ? Timestamp.fromDate(new Date(meetingData.start)) : Timestamp.now(),
          endTime: meetingData.end ? Timestamp.fromDate(new Date(meetingData.end)) : null,
          participants: participants || [],
          webexMeetingId: meetingData.id,
          organizationId: organizationId, // Added for consistency
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'active',
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.title,
          meetingUrl: meetingData.webLink || meetingData.joinUrl,
          joinUrl: meetingData.joinUrl || meetingData.webLink,
          webexMeetingId: meetingData.id,
          startTime: meetingData.start,
          endTime: meetingData.end,
        },
      };

    } catch (error: any) {
      console.error('❌ [Webex] Error creating meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new HttpsError('internal', `Failed to create Webex meeting: ${errorMessage}`);
    }
  }
);

/**
 * Schedule Webex meeting
 */
export const scheduleWebexMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for public access via callable SDK
    cors: CORS_ORIGINS, // Use explicit origins array for stability
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, title, startTime, endTime, participants, description } = request.data as {
        organizationId: string;
        title: string;
        startTime: string; // ISO string
        endTime?: string; // ISO string
        participants?: string[];
        description?: string;
      };

      if (!organizationId || !title || !startTime) {
        throw new HttpsError('invalid-argument', 'Organization ID, title, and start time are required');
      }

      const auth = request.auth;
      if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const userId = auth.uid;
      const userEmail = auth.token.email || '';

      // Verify user belongs to the organization
      const userOrganizationId = await getUserOrganizationId(userId, userEmail);
      if (!userOrganizationId) {
        throw new HttpsError('permission-denied', 'User is not associated with any organization');
      }

      // Verify user belongs to the requested organization
      if (userOrganizationId !== organizationId) {
        // Check if user is a member of the organization via teamMembers collection
        const teamMemberQuery = await db
          .collection('teamMembers')
          .where('userId', '==', userId)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();

        if (teamMemberQuery.empty) {
          // Also check users collection for the organization
          const userDoc = await db.collection('users').doc(userId).get();
          const userData = userDoc.data();

          if (userData?.organizationId !== organizationId) {
            throw new HttpsError(
              'permission-denied',
              'User does not have access to this organization'
            );
          }
        }
      }

      // Optional: Check if user is admin (for logging/auditing purposes)
      let isAdmin = false;
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          isAdmin = isAdminUser(userData || {});
        }
      } catch (error) {
        console.warn('Could not check admin status:', error);
        // Continue even if admin check fails - regular members can schedule meetings
      }

      if (isAdmin) {
        console.log(`✅ [scheduleWebexMeeting] Admin user ${userId} scheduling meeting for org ${organizationId}`);
      } else {
        console.log(`✅ [scheduleWebexMeeting] User ${userId} scheduling meeting for org ${organizationId}`);
      }

      // Get authenticated token
      const accessToken = await getAuthenticatedWebexToken(organizationId);

      // Calculate end time if not provided (default 1 hour)
      const endTimeValue = endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

      // Create Webex meeting
      const meetingResponse = await axios.post(
        'https://webexapis.com/v1/meetings',
        {
          title,
          agenda: description || '',
          start: startTime,
          end: endTimeValue,
          invitees: participants || [],
          enableJoinBeforeHost: true,
          autoRecord: false,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const meetingData = meetingResponse.data;

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'webex',
          title: meetingData.title || title,
          meetingUrl: meetingData.webLink || meetingData.joinUrl,
          joinUrl: meetingData.joinUrl || meetingData.webLink,
          startTime: Timestamp.fromDate(new Date(startTime)),
          endTime: Timestamp.fromDate(new Date(endTimeValue)),
          participants: participants || [],
          webexMeetingId: meetingData.id,
          organizationId: organizationId, // Added for consistency
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'scheduled',
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.title,
          meetingUrl: meetingData.webLink || meetingData.joinUrl,
          joinUrl: meetingData.joinUrl || meetingData.webLink,
          webexMeetingId: meetingData.id,
          startTime: meetingData.start,
          endTime: meetingData.end,
        },
      };

    } catch (error: any) {
      console.error('❌ [Webex] Error scheduling meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new HttpsError('internal', `Failed to schedule Webex meeting: ${errorMessage}`);
    }
  }
);

/**
 * Update Webex meeting
 */
export const updateWebexMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId, title, startTime, endTime, participants } = request.data as {
        organizationId: string;
        meetingId: string;
        title?: string;
        startTime?: string;
        endTime?: string;
        participants?: string[];
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;
      const webexMeetingId = meetingData.webexMeetingId;

      if (!webexMeetingId) {
        throw new HttpsError('failed-precondition', 'Meeting does not have a Webex meeting ID');
      }

      // Get authenticated token
      const accessToken = await getAuthenticatedWebexToken(organizationId);

      // Update Webex meeting
      const updateData: any = {};
      if (title) updateData.title = title;
      if (startTime) updateData.start = startTime;
      if (endTime) updateData.end = endTime;
      if (participants) updateData.invitees = participants;

      await axios.put(
        `https://webexapis.com/v1/meetings/${webexMeetingId}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Update Firestore
      const updateFields: any = {};
      if (title) updateFields.title = title;
      if (startTime) updateFields.startTime = Timestamp.fromDate(new Date(startTime));
      if (endTime) updateFields.endTime = Timestamp.fromDate(new Date(endTime));
      if (participants) updateFields.participants = participants;

      await meetingDoc.ref.update(updateFields);

      return {
        success: true,
        message: 'Meeting updated successfully',
      };

    } catch (error: any) {
      console.error('❌ [Webex] Error updating meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new HttpsError('internal', `Failed to update Webex meeting: ${errorMessage}`);
    }
  }
);

/**
 * Cancel Webex meeting
 */
export const cancelWebexMeeting = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId } = request.data as {
        organizationId: string;
        meetingId: string;
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;
      const webexMeetingId = meetingData.webexMeetingId;

      // Delete Webex meeting if exists
      if (webexMeetingId) {
        try {
          const accessToken = await getAuthenticatedWebexToken(organizationId);
          await axios.delete(
            `https://webexapis.com/v1/meetings/${webexMeetingId}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            }
          );
        } catch (error) {
          console.warn('⚠️ [Webex] Could not delete Webex meeting:', error);
        }
      }

      // Update meeting status
      await meetingDoc.ref.update({
        status: 'cancelled',
        cancelledAt: Timestamp.now(),
      });

      return {
        success: true,
        message: 'Meeting cancelled successfully',
      };

    } catch (error: any) {
      console.error('❌ [Webex] Error cancelling meeting:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new HttpsError('internal', `Failed to cancel Webex meeting: ${errorMessage}`);
    }
  }
);

/**
 * Get Webex meeting details
 */
export const getWebexMeetingDetails = onCall(
  {
    region: 'us-central1',
    invoker: 'public',  // Required for CORS preflight requests
    cors: CORS_ORIGINS,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId, meetingId } = request.data as {
        organizationId: string;
        meetingId: string;
      };

      if (!organizationId || !meetingId) {
        throw new HttpsError('invalid-argument', 'Organization ID and meeting ID are required');
      }

      // Get meeting from Firestore
      const meetingDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .doc(meetingId)
        .get();

      if (!meetingDoc.exists) {
        throw new HttpsError('not-found', 'Meeting not found');
      }

      const meetingData = meetingDoc.data()!;

      return {
        success: true,
        meeting: {
          id: meetingDoc.id,
          ...meetingData,
          startTime: meetingData.startTime?.toDate()?.toISOString(),
          endTime: meetingData.endTime?.toDate()?.toISOString(),
          createdAt: meetingData.createdAt?.toDate()?.toISOString(),
        },
      };

    } catch (error: any) {
      console.error('❌ [Webex] Error getting meeting details:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError('internal', `Failed to get meeting details: ${error.message || 'Unknown error'}`);
    }
  }
);

