/**
 * Google Meet Video Conferencing Functions
 * 
 * Functions to create, schedule, and manage Google Meet meetings
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { getGoogleConfig } from '../google/config';
import { Timestamp } from 'firebase-admin/firestore';
import { encryptionKey, getEncryptionKey } from '../google/secrets';
import { decryptTokens } from '../integrations/encryption';
import { google } from 'googleapis';
import * as crypto from 'crypto';

/**
 * Decrypt token (reuse from google/oauth pattern)
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
 * Get authenticated Google OAuth client for organization
 */
async function getAuthenticatedGoogleClient(organizationId: string) {
  // Prefer org-level googleConnections; fall back to cloudIntegrations/google so existing Firestore OAuth can be reused
  const connectionsSnapshot = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('googleConnections')
    .where('type', '==', 'organization')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  let connection: any | null = null;

  if (!connectionsSnapshot.empty) {
    connection = connectionsSnapshot.docs[0].data();
  } else {
    // Fallback to shared Firestore OAuth tokens (used by other apps)
    const cloudIntegrationDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('cloudIntegrations')
      .doc('google')
      .get();

    if (cloudIntegrationDoc.exists) {
      const cloudData = cloudIntegrationDoc.data() || {};
      if (cloudData.isActive !== false) {
        const encryptedTokens = (cloudData as any).tokens || (cloudData as any).encryptedTokens;
        const decrypted = encryptedTokens ? decryptTokens(encryptedTokens) : null;

        if (decrypted?.access_token || decrypted?.accessToken) {
          connection = {
            type: 'organization',
            isActive: cloudData.isActive !== false,
            accountEmail: cloudData.accountEmail,
            accountName: cloudData.accountName,
            accessToken: decrypted.access_token || decrypted.accessToken,
            refreshToken: decrypted.refresh_token || decrypted.refreshToken,
            tokenExpiresAt: cloudData.expiresAt || cloudData.tokenExpiresAt,
          };
        }
      }
    }
  }

  if (!connection) {
    throw new HttpsError('failed-precondition', 'No active Google connection found for organization');
  }

  const config = await getGoogleConfig(organizationId);

  // Decrypt tokens when stored in googleConnections (colon-delimited) or use plaintext from cloudIntegrations fallback
  const accessToken =
    typeof connection.accessToken === 'string' && connection.accessToken.includes(':')
      ? decryptToken(connection.accessToken)
      : connection.accessToken;

  const refreshToken =
    connection.refreshToken && typeof connection.refreshToken === 'string' && connection.refreshToken.includes(':')
      ? decryptToken(connection.refreshToken)
      : connection.refreshToken || null;

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Refresh token if needed
  try {
    await oauth2Client.getAccessToken();
  } catch (error) {
    console.warn('⚠️ [GoogleMeet] Token refresh failed, attempting manual refresh');
    if (refreshToken) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    }
  }

  return oauth2Client;
}

/**
 * Create instant Google Meet meeting
 */
export const createMeetMeeting = onCall(
  {
    region: 'us-central1',
    cors: true,
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

      // Get authenticated client
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Create a calendar event with Google Meet conference
      const event = {
        summary: title || 'Instant Meeting',
        start: {
          dateTime: new Date().toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour default
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomBytes(16).toString('hex'),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        attendees: participants?.map(email => ({ email })) || [],
      };

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      const meetingData = createdEvent.data;
      const meetLink = meetingData.conferenceData?.entryPoints?.[0]?.uri || meetingData.hangoutLink;

      if (!meetLink) {
        throw new HttpsError('internal', 'Failed to create meeting link');
      }

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'google-meet',
          title: meetingData.summary || title || 'Instant Meeting',
          meetingUrl: meetLink,
          joinUrl: meetLink,
          startTime: meetingData.start?.dateTime ? Timestamp.fromDate(new Date(meetingData.start.dateTime)) : Timestamp.now(),
          endTime: meetingData.end?.dateTime ? Timestamp.fromDate(new Date(meetingData.end.dateTime)) : null,
          participants: participants || [],
          calendarEventId: meetingData.id,
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'active',
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.summary,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          calendarEventId: meetingData.id,
          startTime: meetingData.start?.dateTime,
          endTime: meetingData.end?.dateTime,
        },
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error creating meeting:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to create Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Schedule Google Meet meeting
 */
export const scheduleMeetMeeting = onCall(
  {
    region: 'us-central1',
    cors: true,
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

      // Get authenticated client
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Calculate end time if not provided (default 1 hour)
      const endTimeValue = endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

      // Create calendar event with Google Meet conference
      const event = {
        summary: title,
        description: description || '',
        start: {
          dateTime: startTime,
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTimeValue,
          timeZone: 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: crypto.randomBytes(16).toString('hex'),
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        attendees: participants?.map(email => ({ email })) || [],
      };

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      const meetingData = createdEvent.data;
      const meetLink = meetingData.conferenceData?.entryPoints?.[0]?.uri || meetingData.hangoutLink;

      if (!meetLink) {
        throw new HttpsError('internal', 'Failed to create meeting link');
      }

      // Save meeting to Firestore
      const meetingRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('videoMeetings')
        .add({
          provider: 'google-meet',
          title: meetingData.summary || title,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          startTime: Timestamp.fromDate(new Date(startTime)),
          endTime: Timestamp.fromDate(new Date(endTimeValue)),
          participants: participants || [],
          calendarEventId: meetingData.id,
          createdBy: auth.uid,
          createdAt: Timestamp.now(),
          status: 'scheduled',
        });

      return {
        success: true,
        meeting: {
          id: meetingRef.id,
          title: meetingData.summary,
          meetingUrl: meetLink,
          joinUrl: meetLink,
          calendarEventId: meetingData.id,
          startTime: meetingData.start?.dateTime,
          endTime: meetingData.end?.dateTime,
        },
      };

    } catch (error: any) {
      console.error('❌ [GoogleMeet] Error scheduling meeting:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to schedule Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Update Google Meet meeting
 */
export const updateMeetMeeting = onCall(
  {
    region: 'us-central1',
    cors: true,
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
      const calendarEventId = meetingData.calendarEventId;

      if (!calendarEventId) {
        throw new HttpsError('failed-precondition', 'Meeting does not have a calendar event');
      }

      // Get authenticated client
      const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // Update calendar event
      const updateData: any = {};
      if (title) updateData.summary = title;
      if (startTime) updateData.start = { dateTime: startTime, timeZone: 'UTC' };
      if (endTime) updateData.end = { dateTime: endTime, timeZone: 'UTC' };
      if (participants) updateData.attendees = participants.map(email => ({ email }));

      await calendar.events.patch({
        calendarId: 'primary',
        eventId: calendarEventId,
        requestBody: updateData,
      });

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
      console.error('❌ [GoogleMeet] Error updating meeting:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to update Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Cancel Google Meet meeting
 */
export const cancelMeetMeeting = onCall(
  {
    region: 'us-central1',
    cors: true,
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
      const calendarEventId = meetingData.calendarEventId;

      // Delete calendar event if exists
      if (calendarEventId) {
        try {
          const oauth2Client = await getAuthenticatedGoogleClient(organizationId);
          const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: calendarEventId,
          });
        } catch (error) {
          console.warn('⚠️ [GoogleMeet] Could not delete calendar event:', error);
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
      console.error('❌ [GoogleMeet] Error cancelling meeting:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to cancel Google Meet: ${error.message || 'Unknown error'}`);
    }
  }
);

/**
 * Get Google Meet meeting details
 */
export const getMeetMeetingDetails = onCall(
  {
    region: 'us-central1',
    cors: true,
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
      console.error('❌ [GoogleMeet] Error getting meeting details:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get meeting details: ${error.message || 'Unknown error'}`);
    }
  }
);

