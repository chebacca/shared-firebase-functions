/**
 * 🔥 AUTO CLOCK-OUT SCHEDULER
 * Scheduled function to check active overtime sessions and auto clock-out when limits are exceeded
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as admin from 'firebase-admin';
import type { OvertimeSession } from 'shared-firebase-types';

const db = getFirestore();
const messaging = getMessaging();

/**
 * Check Active Overtime Sessions Every 5 Minutes
 * Auto clock-out sessions that exceed limit + grace period
 */
export const checkOvertimeSessions = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    timeZone: 'America/Los_Angeles',
  },
  async (event) => {
    const now = Timestamp.now();

    try {
      console.log(`⏰ [OvertimeScheduler] Checking active overtime sessions at ${now.toDate().toISOString()}`);

      // 1. Query all ACTIVE overtime sessions
      const activeSessions = await db
        .collection('overtimeSessions')
        .where('status', '==', 'ACTIVE')
        .get();

      console.log(`📊 [OvertimeScheduler] Found ${activeSessions.size} active session(s)`);

      for (const sessionDoc of activeSessions.docs) {
        try {
          const session = sessionDoc.data() as OvertimeSession;
          const sessionStart = session.sessionStartTime;
          const startTime = (sessionStart && typeof (sessionStart as any).toDate === 'function')
            ? (sessionStart as any).toDate()
            : new Date(sessionStart as any);

          const elapsedMs = now.toMillis() - startTime.getTime();
          const elapsedHours = elapsedMs / (1000 * 60 * 60);

          const approvedHours = session.approvedHours;
          const graceHours = (session.gracePeriodMinutes || 30) / 60;
          const maxHours = approvedHours + graceHours;

          // Send warning at 90% of approved hours
          if (elapsedHours >= approvedHours * 0.9 && !session.managerNotifiedAt) {
            console.log(`📢 [OvertimeScheduler] Sending manager reminder for session ${sessionDoc.id}`);
            await sendManagerReminder(session);
            await sessionDoc.ref.update({
              managerNotifiedAt: FieldValue.serverTimestamp()
            });
          }

          // Send auto clock-out warning 15 min before limit
          if (elapsedHours >= (approvedHours - 0.25) && !session.autoClockOutWarningAt) {
            console.log(`⚠️ [OvertimeScheduler] Sending auto clock-out warning for session ${sessionDoc.id}`);
            await sendAutoClockOutWarning(session);
            await sessionDoc.ref.update({
              autoClockOutWarningAt: FieldValue.serverTimestamp()
            });
          }

          // Auto clock-out if exceeded limit + grace period
          if (elapsedHours >= maxHours) {
            console.log(`🛑 [OvertimeScheduler] Auto clocking out session ${sessionDoc.id} (exceeded limit)`);
            await autoClockOutUser(session, sessionDoc.id);
          }
        } catch (sessionError: any) {
          console.error(`❌ [OvertimeScheduler] Error processing session ${sessionDoc.id}:`, sessionError);
          // Continue with next session
        }
      }

      console.log(`✅ [OvertimeScheduler] Completed check at ${now.toDate().toISOString()}`);
    } catch (error: any) {
      console.error('❌ [OvertimeScheduler] Error checking sessions:', error);
      throw error;
    }
  }
);

/**
 * Send Manager Reminder
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
 * Send Auto Clock-Out Warning
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

/**
 * Auto Clock-Out User
 */
async function autoClockOutUser(session: OvertimeSession, sessionId: string): Promise<void> {
  try {
    // 1. Find active timecard entry
    const timecardQuery = await db
      .collection('timecard_entries')
      .where('userId', '==', session.userId)
      .where('organizationId', '==', session.organizationId)
      .where('clockOutTime', '==', null)
      .orderBy('clockInTime', 'desc')
      .limit(1)
      .get();

    if (!timecardQuery.empty) {
      const timecardDoc = timecardQuery.docs[0];
      const now = Timestamp.now();

      // Calculate final hours
      const clockInTime = timecardDoc.data().clockInTime?.toDate?.() || new Date(timecardDoc.data().clockInTime);
      const clockOutTime = now.toDate();
      const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      // Update timecard entry
      await timecardDoc.ref.update({
        clockOutTime: now,
        totalHours: parseFloat(totalHours.toFixed(2)),
        overtimeStatus: 'AUTO_CLOCKED_OUT',
        autoClockOut: true,
        autoClockOutReason: 'Overtime limit exceeded',
        updatedAt: now
      });

      // Update teamMembers.isTimecardClockedIn
      const teamMemberRef = db.collection('teamMembers').doc(session.userId);
      await teamMemberRef.update({
        isTimecardClockedIn: false,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 2. Update session status
    const finalHoursUsed = session.hoursUsed || 0;
    const exceededBy = Math.max(0, finalHoursUsed - session.approvedHours);

    await db.collection('overtimeSessions').doc(sessionId).update({
      status: 'AUTO_CLOCKED_OUT',
      sessionEndTime: FieldValue.serverTimestamp(),
      flaggedForReview: true,
      exceededBy: parseFloat(exceededBy.toFixed(2)),
      hoursUsed: parseFloat(finalHoursUsed.toFixed(2)),
      hoursRemaining: Math.max(0, session.approvedHours - finalHoursUsed),
      updatedAt: FieldValue.serverTimestamp()
    });

    // 3. Update overtime request
    const otRequestDoc = await db.collection('overtimeRequests').doc(session.overtimeRequestId).get();
    if (otRequestDoc.exists) {
      const otRequest = otRequestDoc.data();
      const currentHoursUsed = (otRequest?.hoursUsed || 0) + finalHoursUsed;
      const currentHoursRemaining = Math.max(0, (otRequest?.approvedHours || 0) - currentHoursUsed);

      await otRequestDoc.ref.update({
        hoursUsed: parseFloat(currentHoursUsed.toFixed(2)),
        hoursRemaining: parseFloat(currentHoursRemaining.toFixed(2)),
        isActive: false,
        activeSessionId: null,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    // 4. Notify employee
    await db.collection('notifications').add({
      userId: session.userId,
      organizationId: session.organizationId,
      category: 'overtime_alert',
      type: 'auto_clocked_out',
      title: 'You Have Been Automatically Clocked Out',
      message: 'Your overtime limit has been reached. If you need additional overtime, please submit a new request.',
      data: { overtimeSessionId: sessionId },
      read: false,
      priority: 'HIGH',
      createdAt: FieldValue.serverTimestamp()
    });

    // Send push notification to employee
    const employeeTokensSnapshot = await db
      .collection('users')
      .doc(session.userId)
      .collection('fcmTokens')
      .where('isActive', '==', true)
      .get();

    if (!employeeTokensSnapshot.empty) {
      const tokens = employeeTokensSnapshot.docs.map(doc => doc.data().token);
      await messaging.sendEachForMulticast({
        notification: {
          title: 'Auto Clocked Out',
          body: 'Your overtime limit has been reached'
        },
        data: {
          type: 'overtime_alert',
          overtimeSessionId: sessionId
        },
        tokens
      });
    }

    // 5. Notify manager
    await db.collection('notifications').add({
      userId: session.managerId,
      organizationId: session.organizationId,
      category: 'overtime_alert',
      type: 'employee_auto_clocked_out',
      title: 'Employee Auto-Clocked Out',
      message: `${session.userName} was automatically clocked out after reaching overtime limit. Please review.`,
      data: {
        overtimeSessionId: sessionId,
        userId: session.userId,
        requiresReview: true
      },
      read: false,
      createdAt: FieldValue.serverTimestamp()
    });

    // Send push notification to manager
    const managerTokensSnapshot = await db
      .collection('users')
      .doc(session.managerId)
      .collection('fcmTokens')
      .where('isActive', '==', true)
      .get();

    if (!managerTokensSnapshot.empty) {
      const tokens = managerTokensSnapshot.docs.map(doc => doc.data().token);
      await messaging.sendEachForMulticast({
        notification: {
          title: 'Employee Auto-Clocked Out',
          body: `${session.userName} reached overtime limit`
        },
        data: {
          type: 'overtime_alert',
          overtimeSessionId: sessionId
        },
        tokens
      });
    }

    console.log(`✅ [OvertimeScheduler] Auto clocked out user ${session.userId} for session ${sessionId}`);
  } catch (error: any) {
    console.error(`❌ [OvertimeScheduler] Error auto clocking out user:`, error);
    throw error;
  }
}
