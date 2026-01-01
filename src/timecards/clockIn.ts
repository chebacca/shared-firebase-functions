/**
 * Clock In Function
 * 
 * Clocks in a user for the current day
 * Callable version - HTTP version exists in API routes
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, handleError } from '../shared/utils';
import {
  updateLocationStatus,
  logLocationActivity
} from '../location/locationStatusService';

const db = getFirestore();

export const clockIn = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { date, location, department, role, hourlyRate, notes, projectId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      if (!userOrgId) {
        throw new HttpsError('permission-denied', 'User must belong to an organization');
      }

      console.log(`⏰ [CLOCK IN] User ${userId} clocking in for organization ${userOrgId}`);

      // Get today's date if not provided
      const today = date || new Date().toISOString().split('T')[0];
      const now = admin.firestore.Timestamp.now();

      // Create date timestamp for query (start of day in UTC)
      const [year, month, day] = today.split('-').map(Number);
      const dateTimestamp = admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)));

      // Check if user is already clocked in (any active session)
      const timecardQuery = await db.collection('timecard_entries')
        .where('userId', '==', userId)
        .where('organizationId', '==', userOrgId)
        .where('clockOutTime', '==', null)
        .limit(1)
        .get();

      if (!timecardQuery.empty) {
        throw new HttpsError('failed-precondition', 'You are already clocked in');
      }

      // Create timecard entry
      const timecardData: any = {
        userId,
        organizationId: userOrgId,
        date: dateTimestamp,
        clockInTime: now,
        clockOutTime: null,
        location: location || '',
        department: department || '',
        role: role || '',
        hourlyRate: hourlyRate || 0,
        notes: notes || '',
        projectId: projectId || null,
        status: 'ACTIVE',
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        mealBreakTaken: false,
        mealPenalty: false,
        createdAt: now,
        updatedAt: now
      };

      const timecardRef = await db.collection('timecard_entries').add(timecardData);
      const timecardDoc = await timecardRef.get();

      // Update location status
      const updatedState = await updateLocationStatus(
        userId,
        userOrgId,
        'timecard_clockin'
      );

      // Log location activity
      await logLocationActivity(
        userId,
        userOrgId,
        'timecard_clockin',
        updatedState.currentLocationStatus
      );

      const timecard = { id: timecardDoc.id, ...timecardDoc.data() } as any;

      console.log(`✅ [CLOCK IN] User ${userId} clocked in successfully`);

      return createSuccessResponse({
        id: timecard.id,
        userId: timecard.userId,
        date: today,
        clockInTime: timecard.clockInTime?.toDate?.()?.toISOString() || now.toDate().toISOString(),
        clockOutTime: null,
        location: timecard.location,
        notes: timecard.notes,
        projectId: timecard.projectId,
        organizationId: timecard.organizationId,
        status: timecard.status,
        totalHours: timecard.totalHours || 0,
        locationStatus: updatedState.currentLocationStatus
      }, 'Successfully clocked in');

    } catch (error: any) {
      console.error('❌ [CLOCK IN] Error:', error);

      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      return handleError(error, 'clockIn');
    }
  }
);

