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
    // Look back 7 days to find any active session (handles overnight/long shifts)
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 7);
    lookbackDate.setHours(0, 0, 0, 0);
    const lookbackTimestamp = admin.firestore.Timestamp.fromDate(lookbackDate);

    // Find active timecard entries (no clockOutTime) within the last 7 days
    const timecardQuery = await db.collection('timecard_entries')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('date', '>=', lookbackTimestamp)
      .get();

    // Check if there are any active entries (no clockOutTime AND no timeOut)
    const hasActiveEntry = timecardQuery.docs.some(doc => {
      const data = doc.data();
      return !data.clockOutTime && !data.timeOut;
    });

    if (hasActiveEntry) {
      console.log(`⏰ [QR SCAN] User ${userId} is already clocked in (found active entry in last 7 days), skipping timecard creation`);
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

/**
 * Helper function to clock out a user from their active timecard entry
 * Returns true if timecard was clocked out, false if user was not clocked in
 */
async function clockOutTimecardEntry(
  userId: string,
  organizationId: string,
  wrappedStatus: WrappedStatus
): Promise<boolean> {
  try {
    const now = admin.firestore.Timestamp.now();

    // Look back 7 days to find any active session (handles overnight/long shifts)
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 7);
    lookbackDate.setHours(0, 0, 0, 0);
    const lookbackTimestamp = admin.firestore.Timestamp.fromDate(lookbackDate);

    console.log(`🔍 [QR SCAN] Looking for active timecard entries for user ${userId}, org ${organizationId}, lookback: ${lookbackTimestamp.toDate().toISOString()}`);

    // Find active timecard entries (no clockOutTime)
    const timecardQuery = await db.collection('timecard_entries')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .where('date', '>=', lookbackTimestamp)
      .get();

    console.log(`🔍 [QR SCAN] Found ${timecardQuery.docs.length} timecard entries in last 7 days`);

    // Find the first active entry (no clockOutTime AND no timeOut)
    const activeEntry = timecardQuery.docs.find(doc => {
      const data = doc.data();
      const isActive = !data.clockOutTime && !data.timeOut;
      if (isActive) {
        console.log(`✅ [QR SCAN] Found active entry: ${doc.id}, clockInTime: ${data.clockInTime?.toDate?.()?.toISOString() || 'N/A'}`);
      }
      return isActive;
    });

    if (!activeEntry) {
      console.log(`⏰ [QR SCAN] User ${userId} is not clocked in (checked ${timecardQuery.docs.length} entries), skipping timecard clock-out`);
      // Log details of entries found for debugging
      if (timecardQuery.docs.length > 0) {
        timecardQuery.docs.forEach((doc, idx) => {
          const data = doc.data();
          console.log(`  Entry ${idx + 1}: ${doc.id}, date: ${data.date?.toDate?.()?.toISOString() || 'N/A'}, clockOutTime: ${data.clockOutTime ? data.clockOutTime.toDate().toISOString() : 'null'}, timeOut: ${data.timeOut ? data.timeOut.toDate().toISOString() : 'null'}`);
        });
      }
      return false;
    }

    const entryRef = activeEntry.ref;
    const entryData = activeEntry.data();

    // Calculate total hours
    const clockInTime = entryData.clockInTime?.toDate?.() || new Date(entryData.clockInTime);
    const clockOutTime = now.toDate();
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    // Check if there are more open entries (multiple clock in/out sessions)
    const hasMoreOpenEntries = timecardQuery.docs.some(doc => {
      if (doc.id === activeEntry.id) return false;
      const data = doc.data();
      return !data.clockOutTime && !data.timeOut;
    });

    // Update the active entry with clockOutTime
    await entryRef.update({
      clockOutTime: now,
      timeOut: now, // Backward compatibility
      totalHours: totalHours,
      regularHours: totalHours, // Simplified - could calculate overtime based on rules
      status: 'PENDING',
      updatedAt: now
    });

    console.log(`✅ [QR SCAN] Clocked out timecard entry for user ${userId}, totalHours: ${totalHours.toFixed(2)}, hasMoreOpenEntries: ${hasMoreOpenEntries}`);

    // Update location status with timecard clock-out
    // Only set isTimecardClockedIn to false if this is the final clock out (no more open entries)
    if (!hasMoreOpenEntries) {
      // This is the final clock out, update location status to mark as not clocked in
      await updateLocationStatus(
        userId,
        organizationId,
        'timecard_clockout',
        wrappedStatus
      );
    } else {
      // There are more open entries, just update wrappedStatus without changing isTimecardClockedIn
      // We'll update the location status separately to preserve isTimecardClockedIn = true
      const currentState = await getLocationStatus(userId);
      if (currentState) {
        // Update only wrappedStatus and location status, keeping isTimecardClockedIn = true
        const newLocationStatus = calculateLocationStatus(
          currentState.isQrScannedIn || false,
          true, // Keep isTimecardClockedIn as true since there are more open entries
          wrappedStatus
        );
        
        // Update both users and teamMembers collections
        const userRef = db.collection('users').doc(userId);
        const teamMemberRef = db.collection('teamMembers').doc(userId);
        
        // Ensure wrappedStatus is never undefined - use null instead
        const wrappedStatusValue: WrappedStatus | null = (wrappedStatus !== undefined && wrappedStatus !== null) ? wrappedStatus : null;
        
        const updateData: any = {
          wrappedStatus: wrappedStatusValue,
          currentLocationStatus: newLocationStatus || null,
          lastLocationUpdate: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Final safety check: remove any undefined values
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            console.warn(`[clockOutTimecardEntry] Removing undefined value for key: ${key}`);
            delete updateData[key];
          }
        });
        
        await Promise.all([
          userRef.set(updateData, { merge: true }),
          teamMemberRef.set(updateData, { merge: true })
        ]);
      }
    }

    // Log location activity
    await logLocationActivity(
      userId,
      organizationId,
      'timecard_clockout',
      wrappedStatus === 'wrapped' ? 'wrapped' : 'another_location',
      wrappedStatus
    );

    return true;
  } catch (error: any) {
    console.error('❌ [QR SCAN] Error clocking out timecard entry:', error);
    // Don't throw - allow QR checkout to succeed even if timecard clock-out fails
    return false;
  }
}

// Firebase Callable function
export const qrScanCheckInOut = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
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
        
        // If user is checking out for the day (wrapped), also clock them out of timecard
        let timecardClockedOut = false;
        if (wrappedStatus === 'wrapped') {
          try {
            timecardClockedOut = await clockOutTimecardEntry(userId, organizationId, wrappedStatus as WrappedStatus);
            if (timecardClockedOut) {
              console.log(`✅ [QR SCAN] User ${userId} clocked out of timecard during QR checkout`);
            }
          } catch (timecardError: any) {
            console.error('⚠️ [QR SCAN] Error clocking out timecard during QR checkout, but continuing with QR checkout:', timecardError);
            // Don't fail the entire operation if timecard clock-out fails
          }
        }

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
          wrappedStatus,
          timecardClockedOut
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
    memory: '512MiB',
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
        
        // If user is checking out for the day (wrapped), also clock them out of timecard
        let timecardClockedOut = false;
        if (wrappedStatus === 'wrapped') {
          try {
            timecardClockedOut = await clockOutTimecardEntry(userId, organizationId, wrappedStatus as WrappedStatus);
            if (timecardClockedOut) {
              console.log(`✅ [QR SCAN HTTP] User ${userId} clocked out of timecard during QR checkout`);
            }
          } catch (timecardError: any) {
            console.error('⚠️ [QR SCAN HTTP] Error clocking out timecard during QR checkout, but continuing with QR checkout:', timecardError);
            // Don't fail the entire operation if timecard clock-out fails
          }
        }

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
          wrappedStatus,
          timecardClockedOut
        }, 'Successfully checked out'));
      }
    } catch (error: any) {
      console.error('[QR SCAN HTTP] Error:', error);
      res.status(500).json(handleError(error, 'qrScanCheckInOutHttp'));
    }
  }
);

