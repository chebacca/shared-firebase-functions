/**
 * QR Code Scan Check-In/Out Function
 * 
 * Handles QR code scan check-in and check-out for users
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';
import {
  updateLocationStatus,
  logLocationActivity,
  getLocationStatus,
  calculateLocationStatus,
  getLocationStatusDisplay,
  WrappedStatus
} from './locationStatusService';

const db = getFirestore();

/**
 * Helper function to create a timecard entry for a user
 * Returns true if timecard was created, false if user was already clocked in
 */
async function createTimecardEntry(
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    // Check if user is already clocked in
    const timecardQuery = await db.collection('timecard_entries')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('clockOutTime', '==', null)
      .limit(1)
      .get();

    if (!timecardQuery.empty) {
      console.log(`⏰ [QR SCAN] User ${userId} is already clocked in, skipping timecard creation`);
      return false;
    }

    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    const now = admin.firestore.Timestamp.now();

    // Create date timestamp for query (start of day in UTC)
    const [year, month, day] = today.split('-').map(Number);
    const dateTimestamp = admin.firestore.Timestamp.fromDate(new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)));

    // Create timecard entry
    const timecardData: any = {
      userId,
      organizationId,
      date: dateTimestamp,
      clockInTime: now,
      clockOutTime: null,
      location: '',
      department: '',
      role: '',
      hourlyRate: 0,
      notes: '',
      projectId: null,
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

    await db.collection('timecard_entries').add(timecardData);
    console.log(`✅ [QR SCAN] Created timecard entry for user ${userId}`);

    // Update location status with timecard clock-in
    await updateLocationStatus(
      userId,
      organizationId,
      'timecard_clockin'
    );

    // Log location activity
    await logLocationActivity(
      userId,
      organizationId,
      'timecard_clockin',
      'on_prem' // Location status will be calculated by updateLocationStatus
    );

    return true;
  } catch (error: any) {
    console.error('❌ [QR SCAN] Error creating timecard entry:', error);
    throw error;
  }
}

// Firebase Callable function
export const qrScanCheckInOut = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
    cors: true
  },
  async (request) => {
    try {
      const { checkInUUID, wrappedStatus, triggerTimecardClockIn } = request.data;

      if (!checkInUUID) {
        throw new Error('checkInUUID is required');
      }

      console.log(`📱 [QR SCAN] Processing QR scan for checkInUUID: ${checkInUUID}`);

      // Find user by checkInUUID - Check teamMembers FIRST (Location Tracking reads from here)
      const teamMembersQuery = await db.collection('teamMembers')
        .where('checkInUUID', '==', checkInUUID)
        .limit(1)
        .get();

      let userId: string;
      let organizationId: string;
      let foundInTeamMembers = false;

      if (!teamMembersQuery.empty) {
        // Found in teamMembers (preferred for mobile app - Location Tracking reads from here)
        const userDoc = teamMembersQuery.docs[0];
        const userData = userDoc.data();
        userId = userData.userId || userDoc.id;
        organizationId = userData.organizationId;
        foundInTeamMembers = true;
        console.log(`✅ [QR SCAN] Found user in teamMembers: ${userId}, org: ${organizationId}`);
      } else {
        // Fallback to users collection
        const usersQuery = await db.collection('users')
          .where('checkInUUID', '==', checkInUUID)
          .limit(1)
          .get();

        if (usersQuery.empty) {
          throw new Error('User not found with provided checkInUUID');
        }

        const userDoc = usersQuery.docs[0];
        const userData = userDoc.data();
        userId = userDoc.id;
        organizationId = userData.organizationId;
        console.log(`✅ [QR SCAN] Found user in users collection: ${userId}, org: ${organizationId}`);
      }

      if (!organizationId) {
        throw new Error('User organization not found');
      }

      // Get current location state
      const currentState = await getLocationStatus(userId);
      const isCurrentlyScannedIn = currentState?.isQrScannedIn || false;

      // Determine if this is check-in or check-out
      const isCheckIn = !isCurrentlyScannedIn;

      if (isCheckIn) {
        // Check-in
        console.log(`✅ [QR SCAN] Checking in user: ${userId} (found in ${foundInTeamMembers ? 'teamMembers' : 'users'})`);
        
        // Update location status with QR check-in (will update both users and teamMembers)
        const updatedState = await updateLocationStatus(
          userId,
          organizationId,
          'qr_checkin'
        );

        await logLocationActivity(
          userId,
          organizationId,
          'qr_checkin',
          updatedState.currentLocationStatus
        );

        // If triggerTimecardClockIn is true, also create a timecard entry
        let timecardCreated = false;
        if (triggerTimecardClockIn === true) {
          try {
            timecardCreated = await createTimecardEntry(userId, organizationId);
          } catch (timecardError: any) {
            console.error('⚠️ [QR SCAN] Error creating timecard entry, but QR check-in succeeded:', timecardError);
            // Don't fail the entire operation if timecard creation fails
          }
        }

        return createSuccessResponse({
          success: true,
          action: 'checkin',
          status: getLocationStatusDisplay(updatedState.currentLocationStatus),
          locationStatus: updatedState.currentLocationStatus,
          timecardCreated
        }, 'Successfully checked in');
      } else {
        // Check-out - wrappedStatus is required
        if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
          throw new Error('wrappedStatus is required for check-out and must be "wrapped" or "another_location"');
        }

        console.log(`🚪 [QR SCAN] Checking out user: ${userId} (found in ${foundInTeamMembers ? 'teamMembers' : 'users'}), wrappedStatus: ${wrappedStatus}`);
        const updatedState = await updateLocationStatus(
          userId,
          organizationId,
          'qr_checkout',
          wrappedStatus as WrappedStatus
        );

        await logLocationActivity(
          userId,
          organizationId,
          'qr_checkout',
          updatedState.currentLocationStatus,
          wrappedStatus as WrappedStatus
        );

        return createSuccessResponse({
          success: true,
          action: 'checkout',
          status: getLocationStatusDisplay(updatedState.currentLocationStatus),
          locationStatus: updatedState.currentLocationStatus,
          wrappedStatus
        }, 'Successfully checked out');
      }
    } catch (error: any) {
      console.error('[QR SCAN] Error:', error);
      return handleError(error, 'qrScanCheckInOut');
    }
  }
);

// HTTP function
export const qrScanCheckInOutHttp = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    invoker: 'public',
    cors: false
  },
  async (req, res) => {
    // Handle OPTIONS preflight request
    if (req.method === 'OPTIONS') {
      setCorsHeaders(req, res);
      res.status(204).send('');
      return;
    }

    // Set CORS headers for all responses
    setCorsHeaders(req, res);

    try {
      const { checkInUUID, wrappedStatus, triggerTimecardClockIn } = req.body;

      if (!checkInUUID) {
        res.status(400).json(createErrorResponse('checkInUUID is required'));
        return;
      }

      console.log(`📱 [QR SCAN HTTP] Processing QR scan for checkInUUID: ${checkInUUID}`);

      // Find user by checkInUUID - Check teamMembers FIRST (Location Tracking reads from here)
      const teamMembersQuery = await db.collection('teamMembers')
        .where('checkInUUID', '==', checkInUUID)
        .limit(1)
        .get();

      let userId: string;
      let organizationId: string;
      let foundInTeamMembers = false;

      if (!teamMembersQuery.empty) {
        // Found in teamMembers (preferred for mobile app - Location Tracking reads from here)
        const userDoc = teamMembersQuery.docs[0];
        const userData = userDoc.data();
        userId = userData.userId || userDoc.id;
        organizationId = userData.organizationId;
        foundInTeamMembers = true;
        console.log(`✅ [QR SCAN HTTP] Found user in teamMembers: ${userId}, org: ${organizationId}`);
      } else {
        // Fallback to users collection
        const usersQuery = await db.collection('users')
          .where('checkInUUID', '==', checkInUUID)
          .limit(1)
          .get();

        if (usersQuery.empty) {
          res.status(404).json(createErrorResponse('User not found with provided checkInUUID'));
          return;
        }

        const userDoc = usersQuery.docs[0];
        const userData = userDoc.data();
        userId = userDoc.id;
        organizationId = userData.organizationId;
        console.log(`✅ [QR SCAN HTTP] Found user in users collection: ${userId}, org: ${organizationId}`);
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('User organization not found'));
        return;
      }

      // Get current location state
      const currentState = await getLocationStatus(userId);
      const isCurrentlyScannedIn = currentState?.isQrScannedIn || false;

      // Determine if this is check-in or check-out
      const isCheckIn = !isCurrentlyScannedIn;

      if (isCheckIn) {
        // Check-in
        console.log(`✅ [QR SCAN HTTP] Checking in user: ${userId} (found in ${foundInTeamMembers ? 'teamMembers' : 'users'})`);
        
        // Update location status with QR check-in (will update both users and teamMembers)
        const updatedState = await updateLocationStatus(
          userId,
          organizationId,
          'qr_checkin'
        );

        await logLocationActivity(
          userId,
          organizationId,
          'qr_checkin',
          updatedState.currentLocationStatus
        );

        // If triggerTimecardClockIn is true, also create a timecard entry
        let timecardCreated = false;
        if (triggerTimecardClockIn === true) {
          try {
            timecardCreated = await createTimecardEntry(userId, organizationId);
          } catch (timecardError: any) {
            console.error('⚠️ [QR SCAN HTTP] Error creating timecard entry, but QR check-in succeeded:', timecardError);
            // Don't fail the entire operation if timecard creation fails
          }
        }

        res.status(200).json(createSuccessResponse({
          success: true,
          action: 'checkin',
          status: getLocationStatusDisplay(updatedState.currentLocationStatus),
          locationStatus: updatedState.currentLocationStatus,
          timecardCreated
        }, 'Successfully checked in'));
      } else {
        // Check-out - wrappedStatus is required
        if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
          res.status(400).json(createErrorResponse('wrappedStatus is required for check-out and must be "wrapped" or "another_location"'));
          return;
        }

        console.log(`🚪 [QR SCAN HTTP] Checking out user: ${userId} (found in ${foundInTeamMembers ? 'teamMembers' : 'users'}), wrappedStatus: ${wrappedStatus}`);
        const updatedState = await updateLocationStatus(
          userId,
          organizationId,
          'qr_checkout',
          wrappedStatus as WrappedStatus
        );

        await logLocationActivity(
          userId,
          organizationId,
          'qr_checkout',
          updatedState.currentLocationStatus,
          wrappedStatus as WrappedStatus
        );

        res.status(200).json(createSuccessResponse({
          success: true,
          action: 'checkout',
          status: getLocationStatusDisplay(updatedState.currentLocationStatus),
          locationStatus: updatedState.currentLocationStatus,
          wrappedStatus
        }, 'Successfully checked out'));
      }
    } catch (error: any) {
      console.error('[QR SCAN HTTP] Error:', error);
      res.status(500).json(handleError(error, 'qrScanCheckInOutHttp'));
    }
  }
);

