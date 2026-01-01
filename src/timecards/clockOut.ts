/**
 * Clock Out Function
 * 
 * Clocks out a user for the current day
 * Callable version - HTTP version exists in API routes
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { createSuccessResponse, handleError } from '../shared/utils';
import {
  updateLocationStatus,
  logLocationActivity,
  WrappedStatus
} from '../location/locationStatusService';

const db = getFirestore();

export const clockOut = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { wrappedStatus, notes } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }

      // wrappedStatus is required for clock out
      if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
        throw new HttpsError('invalid-argument', 'wrappedStatus must be "wrapped" or "another_location"');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      if (!userOrgId) {
        throw new HttpsError('permission-denied', 'User must belong to an organization');
      }

      console.log(`⏰ [CLOCK OUT] User ${userId} clocking out, wrappedStatus: ${wrappedStatus}`);

      const now = admin.firestore.Timestamp.now();
      const today = new Date().toISOString().split('T')[0];

      // Look back 7 days to find any active session (handles overnight/long shifts and missing fields)
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - 7);
      lookbackDate.setHours(0, 0, 0, 0);
      const lookbackTimestamp = admin.firestore.Timestamp.fromDate(lookbackDate);

      // Use existing index (Organization + User + Date) to find recent entries
      const timecardQuery = await db.collection('timecard_entries')
        .where('userId', '==', userId)
        .where('organizationId', '==', userOrgId)
        .where('date', '>=', lookbackTimestamp)
        .orderBy('date', 'desc')
        .get();

      // Find the first active entry (no clockOutTime AND no timeOut)
      // Handles legacy data where fields might be undefined instead of null
      const timecardDoc = timecardQuery.docs.find(doc => {
        const data = doc.data();
        return !data.clockOutTime && !data.timeOut;
      });

      if (!timecardDoc) {
        throw new HttpsError('failed-precondition', `You are not currently clocked in. (Debug: User=${userId?.substring(0, 5)}..., Org=${userOrgId})`);
      }
      const timecardRef = timecardDoc.ref;
      const timecardData = timecardDoc.data();

      // Calculate total hours
      const clockInTime = timecardData.clockInTime?.toDate?.() || new Date(timecardData.clockInTime);
      const clockOutTime = now.toDate();
      const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

      // Update timecard entry
      await timecardRef.update({
        clockOutTime: now,
        totalHours: totalHours,
        regularHours: totalHours, // Simplified - could calculate overtime based on rules
        status: 'PENDING',
        notes: notes || timecardData.notes || '',
        updatedAt: now
      });

      const updatedDoc = await timecardRef.get();
      const updatedTimecard = { id: updatedDoc.id, ...updatedDoc.data() } as any;

      // Update location status
      const updatedState = await updateLocationStatus(
        userId,
        userOrgId,
        'timecard_clockout',
        wrappedStatus as WrappedStatus
      );

      // Log location activity
      await logLocationActivity(
        userId,
        userOrgId,
        'timecard_clockout',
        updatedState.currentLocationStatus,
        wrappedStatus as WrappedStatus
      );

      console.log(`✅ [CLOCK OUT] User ${userId} clocked out successfully`);

      return createSuccessResponse({
        id: updatedTimecard.id,
        userId: updatedTimecard.userId,
        date: today,
        clockInTime: updatedTimecard.clockInTime?.toDate?.()?.toISOString(),
        clockOutTime: updatedTimecard.clockOutTime?.toDate?.()?.toISOString(),
        location: updatedTimecard.location,
        notes: updatedTimecard.notes,
        projectId: updatedTimecard.projectId,
        organizationId: updatedTimecard.organizationId,
        status: updatedTimecard.status,
        totalHours: updatedTimecard.totalHours || 0,
        locationStatus: updatedState.currentLocationStatus,
        wrappedStatus
      }, 'Successfully clocked out');

    } catch (error: any) {
      console.error('❌ [CLOCK OUT] Error:', error);

      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }

      return handleError(error, 'clockOut');
    }
  }
);

