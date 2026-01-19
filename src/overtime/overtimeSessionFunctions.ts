/**
 * 🔥 OVERTIME SESSION FUNCTIONS
 * Firebase Functions for managing overtime sessions and tracking
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import * as admin from 'firebase-admin';
import type { OvertimeSession, OvertimeRequest } from 'shared-firebase-types';

const db = getFirestore();
const messaging = getMessaging();

/**
 * Start Overtime Session
 * Called when employee clocks in with approved OT
 */
export const startOvertimeSession = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { organizationId, overtimeRequestId, timecardEntryId } = data;

      if (!organizationId || !overtimeRequestId || !timecardEntryId) {
        throw new Error('Missing required fields: organizationId, overtimeRequestId, timecardEntryId');
      }

      // 1. Validate approved overtime request exists
      const otRequestDoc = await db.collection('overtimeRequests').doc(overtimeRequestId).get();
      if (!otRequestDoc.exists) {
        throw new Error('Overtime request not found');
      }

      const otRequest = otRequestDoc.data() as OvertimeRequest;
      if (otRequest.status !== 'APPROVED') {
        throw new Error('Overtime request must be approved to start session');
      }

      if (otRequest.organizationId !== organizationId) {
        throw new Error('Organization mismatch');
      }

      if (otRequest.employeeId !== auth.uid) {
        throw new Error('User does not match overtime request employee');
      }

      // Check if there's already an active session for this request
      const existingSessionQuery = await db
        .collection('overtimeSessions')
        .where('overtimeRequestId', '==', overtimeRequestId)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      if (!existingSessionQuery.empty) {
        throw new Error('Active overtime session already exists for this request');
      }

      // 2. Check daily max hours not exceeded
      const today = new Date().toISOString().split('T')[0];
      const todaySessionsQuery = await db
        .collection('overtimeSessions')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', auth.uid)
        .where('status', 'in', ['ACTIVE', 'COMPLETED'])
        .get();

      // Get organization settings for daily max
      const settingsDoc = await db
        .collection('overtimeSettings')
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();

      const dailyMaxHours = settingsDoc.empty
        ? 12 // Default
        : settingsDoc.docs[0].data().dailyMaxOvertimeHours || 12;

      // Calculate total hours used today
      let totalHoursToday = 0;
      todaySessionsQuery.docs.forEach(doc => {
        const session = doc.data();
        if (session.sessionStartTime) {
          const startDate = session.sessionStartTime.toDate?.() || new Date(session.sessionStartTime);
          if (startDate.toISOString().split('T')[0] === today) {
            totalHoursToday += session.hoursUsed || 0;
          }
        }
      });

      const approvedHours = otRequest.approvedHours || otRequest.estimatedHours || 0;
      if (totalHoursToday + approvedHours > dailyMaxHours) {
        throw new Error(`Daily overtime limit (${dailyMaxHours}h) would be exceeded`);
      }

      // 3. Get user info
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();
      const userName = userData?.displayName || userData?.name || userData?.email || 'Unknown';

      // 4. Create overtime session document
      const now = Timestamp.now();
      const sessionData: Omit<OvertimeSession, 'id'> = {
        organizationId,
        overtimeRequestId,
        userId: auth.uid,
        userName,
        managerId: otRequest.managerId,
        timecardEntryId,
        sessionStartTime: now as any,
        approvedHours: approvedHours,
        hoursUsed: 0,
        hoursRemaining: approvedHours,
        status: 'ACTIVE',
        dailyMaxHours,
        sessionMaxHours: approvedHours,
        gracePeriodMinutes: settingsDoc.empty ? 30 : (settingsDoc.docs[0].data().gracePeriodMinutes || 30),
        flaggedForReview: false,
        createdAt: now as any,
        updatedAt: now as any
      };

      const sessionRef = await db.collection('overtimeSessions').add(sessionData);
      const sessionId = sessionRef.id;

      // 5. Link to timecard entry
      await db.collection('timecard_entries').doc(timecardEntryId).update({
        isOvertimeSession: true,
        overtimeSessionId: sessionId,
        overtimeRequestId,
        overtimeStatus: 'ACTIVE'
      });

      // 6. Update overtime request with activeSessionId
      await db.collection('overtimeRequests').doc(overtimeRequestId).update({
        isActive: true,
        activeSessionId: sessionId,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ [OvertimeSession] Started session: ${sessionId}`);
      return createSuccessResponse(
        { sessionId, ...sessionData },
        'Overtime session started successfully'
      );
    } catch (error: any) {
      console.error('❌ [OvertimeSession] Error starting session:', error);
      return createErrorResponse(error.message || 'Failed to start overtime session');
    }
  }
);

/**
 * Update Overtime Session Hours
 * Real-time calculation of hours used
 */
export const updateOvertimeSessionHours = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { sessionId } = data;

      if (!sessionId) {
        throw new Error('Missing sessionId');
      }

      // Get session
      const sessionDoc = await db.collection('overtimeSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        throw new Error('Overtime session not found');
      }

      const session = sessionDoc.data() as OvertimeSession;
      if (session.userId !== auth.uid && session.managerId !== auth.uid) {
        throw new Error('Unauthorized to update this session');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Session is not active');
      }

      // Calculate hours worked so far
      const sessionStart = session.sessionStartTime;
      const startTime = (sessionStart && typeof (sessionStart as any).toDate === 'function')
        ? (sessionStart as any).toDate()
        : new Date(sessionStart as any);
      const now = new Date();
      const elapsedMs = now.getTime() - startTime.getTime();
      const hoursUsed = elapsedMs / (1000 * 60 * 60);
      const hoursRemaining = Math.max(0, session.approvedHours - hoursUsed);
      const percentUsed = (hoursUsed / session.approvedHours) * 100;

      // Update session
      const updateData: any = {
        hoursUsed: parseFloat(hoursUsed.toFixed(2)),
        hoursRemaining: parseFloat(hoursRemaining.toFixed(2)),
        updatedAt: FieldValue.serverTimestamp()
      };

      // Check if approaching limit (90%)
      if (percentUsed >= 90 && !session.managerNotifiedAt) {
        await sendManagerReminder(session);
        updateData.managerNotifiedAt = FieldValue.serverTimestamp();
      }

      // Check if 15 min before limit
      if (hoursRemaining <= 0.25 && !session.autoClockOutWarningAt) {
        await sendAutoClockOutWarning(session);
        updateData.autoClockOutWarningAt = FieldValue.serverTimestamp();
      }

      await sessionDoc.ref.update(updateData);

      console.log(`✅ [OvertimeSession] Updated hours for session: ${sessionId}`);
      return createSuccessResponse(
        {
          sessionId,
          hoursUsed: updateData.hoursUsed,
          hoursRemaining: updateData.hoursRemaining,
          percentUsed: parseFloat(percentUsed.toFixed(1))
        },
        'Session hours updated'
      );
    } catch (error: any) {
      console.error('❌ [OvertimeSession] Error updating hours:', error);
      return createErrorResponse(error.message || 'Failed to update session hours');
    }
  }
);

/**
 * End Overtime Session
 * Called when employee clocks out
 */
export const endOvertimeSession = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { sessionId } = data;

      if (!sessionId) {
        throw new Error('Missing sessionId');
      }

      // Get session
      const sessionDoc = await db.collection('overtimeSessions').doc(sessionId).get();
      if (!sessionDoc.exists) {
        throw new Error('Overtime session not found');
      }

      const session = sessionDoc.data() as OvertimeSession;
      if (session.userId !== auth.uid) {
        throw new Error('Unauthorized to end this session');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Session is not active');
      }

      // 1. Calculate final hours
      const sessionStart = session.sessionStartTime;
      const startTime = (sessionStart && typeof (sessionStart as any).toDate === 'function')
        ? (sessionStart as any).toDate()
        : new Date(sessionStart as any);
      const now = new Date();
      const elapsedMs = now.getTime() - startTime.getTime();
      const finalHoursUsed = elapsedMs / (1000 * 60 * 60);
      const exceededBy = Math.max(0, finalHoursUsed - session.approvedHours);

      // 2. Update session status to COMPLETED
      const updateData: any = {
        status: 'COMPLETED',
        sessionEndTime: Timestamp.now(),
        hoursUsed: parseFloat(finalHoursUsed.toFixed(2)),
        hoursRemaining: Math.max(0, session.approvedHours - finalHoursUsed),
        updatedAt: FieldValue.serverTimestamp()
      };

      // 3. Check if flagging needed (exceeded limit)
      if (exceededBy > 0) {
        updateData.flaggedForReview = true;
        updateData.exceededBy = parseFloat(exceededBy.toFixed(2));
      }

      await sessionDoc.ref.update(updateData);

      // 4. Update overtime request hours used/remaining
      const otRequestDoc = await db.collection('overtimeRequests').doc(session.overtimeRequestId).get();
      if (otRequestDoc.exists) {
        const otRequest = otRequestDoc.data() as OvertimeRequest;
        const currentHoursUsed = (otRequest.hoursUsed || 0) + finalHoursUsed;
        const currentHoursRemaining = Math.max(0, (otRequest.approvedHours || 0) - currentHoursUsed);

        await otRequestDoc.ref.update({
          hoursUsed: parseFloat(currentHoursUsed.toFixed(2)),
          hoursRemaining: parseFloat(currentHoursRemaining.toFixed(2)),
          isActive: false,
          activeSessionId: null,
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      // 5. Clear activeSessionId
      // (Already done above)

      // 6. Update timecard entry
      await db.collection('timecard_entries').doc(session.timecardEntryId).update({
        overtimeStatus: exceededBy > 0 ? 'EXCEEDED' : 'COMPLETED',
        overtimeHoursWorked: parseFloat(finalHoursUsed.toFixed(2))
      });

      console.log(`✅ [OvertimeSession] Ended session: ${sessionId}`);
      return createSuccessResponse(
        {
          sessionId,
          finalHoursUsed: updateData.hoursUsed,
          exceededBy: updateData.exceededBy || 0,
          flaggedForReview: updateData.flaggedForReview
        },
        'Overtime session ended successfully'
      );
    } catch (error: any) {
      console.error('❌ [OvertimeSession] Error ending session:', error);
      return createErrorResponse(error.message || 'Failed to end overtime session');
    }
  }
);

/**
 * Get Active Overtime Sessions for User
 */
export const getActiveOvertimeSession = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { organizationId, userId } = data;
      const targetUserId = userId || auth.uid;

      if (!organizationId) {
        throw new Error('Missing organizationId');
      }

      // Query active sessions for user
      const sessionQuery = await db
        .collection('overtimeSessions')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', targetUserId)
        .where('status', '==', 'ACTIVE')
        .limit(1)
        .get();

      if (sessionQuery.empty) {
        return createSuccessResponse(null, 'No active overtime session');
      }

      const sessionDoc = sessionQuery.docs[0];
      const session = sessionDoc.data() as OvertimeSession;

      // Calculate real-time hours
      const sessionStart = session.sessionStartTime;
      const startTime = (sessionStart && typeof (sessionStart as any).toDate === 'function')
        ? (sessionStart as any).toDate()
        : new Date(sessionStart as any);
      const now = new Date();
      const elapsedMs = now.getTime() - startTime.getTime();
      const hoursUsed = elapsedMs / (1000 * 60 * 60);
      const hoursRemaining = Math.max(0, session.approvedHours - hoursUsed);
      const percentUsed = (hoursUsed / session.approvedHours) * 100;

      const sessionWithCalculatedHours = {
        ...session,
        id: sessionDoc.id,
        hoursUsed: parseFloat(hoursUsed.toFixed(2)),
        hoursRemaining: parseFloat(hoursRemaining.toFixed(2)),
        percentUsed: parseFloat(percentUsed.toFixed(1))
      };

      return createSuccessResponse(
        sessionWithCalculatedHours,
        'Active overtime session found'
      );
    } catch (error: any) {
      console.error('❌ [OvertimeSession] Error getting active session:', error);
      return createErrorResponse(error.message || 'Failed to get active overtime session');
    }
  }
);

/**
 * Helper: Send Manager Reminder
 */
async function sendManagerReminder(session: OvertimeSession): Promise<void> {
  try {
    // Send notification to manager
    await db.collection('notifications').add({
      userId: session.managerId,
      organizationId: session.organizationId,
      category: 'overtime_alert',
      type: 'overtime_limit_approaching',
      title: 'Direct Report Approaching Overtime Limit',
      message: `${session.userName} is approaching their overtime limit. Please check in to ensure proper clock out.`,
      data: {
        overtimeSessionId: session.id,
        userId: session.userId,
        hoursUsed: session.hoursUsed,
        hoursRemaining: session.hoursRemaining
      },
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // Send push notification
    const tokensSnapshot = await db
      .collection('users')
      .doc(session.managerId)
      .collection('fcmTokens')
      .where('isActive', '==', true)
      .get();

    if (!tokensSnapshot.empty) {
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      await messaging.sendEachForMulticast({
        notification: {
          title: 'OT Limit Approaching',
          body: `${session.userName} nearing overtime limit`
        },
        data: {
          type: 'overtime_alert',
          overtimeSessionId: session.id
        },
        tokens
      });
    }
  } catch (error) {
    console.error('Error sending manager reminder:', error);
  }
}

/**
 * Helper: Send Auto Clock-Out Warning
 */
async function sendAutoClockOutWarning(session: OvertimeSession): Promise<void> {
  try {
    // Warn employee they will be auto-clocked out soon
    await db.collection('notifications').add({
      userId: session.userId,
      organizationId: session.organizationId,
      category: 'overtime_alert',
      type: 'auto_clockout_warning',
      title: 'Overtime Limit Almost Reached',
      message: 'You will be automatically clocked out in 15 minutes. Please finish up and clock out manually.',
      data: {
        overtimeSessionId: session.id,
        minutesRemaining: 15
      },
      read: false,
      priority: 'HIGH',
      createdAt: FieldValue.serverTimestamp()
    });

    // Send push notification
    const tokensSnapshot = await db
      .collection('users')
      .doc(session.userId)
      .collection('fcmTokens')
      .where('isActive', '==', true)
      .get();

    if (!tokensSnapshot.empty) {
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      await messaging.sendEachForMulticast({
        notification: {
          title: '⚠️ Auto Clock-Out in 15 Min',
          body: 'Your overtime limit is almost reached'
        },
        data: {
          type: 'overtime_alert',
          overtimeSessionId: session.id
        },
        tokens
      });
    }
  } catch (error) {
    console.error('Error sending auto clock-out warning:', error);
  }
}
