/**
 * Location Status Service
 * 
 * Handles location tracking for users based on QR code scans and timecard clock in/out events
 */

import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { db } from '../shared/utils';

export type LocationStatus = 'on_prem' | 'on_location' | 'wrapped' | 'another_location' | null;
export type ActivityType = 'qr_checkin' | 'qr_checkout' | 'timecard_clockin' | 'timecard_clockout';
export type WrappedStatus = 'wrapped' | 'another_location' | null;

export interface LocationActivity {
  userId: string;
  organizationId: string;
  activityType: ActivityType;
  status: string; // Display status like "On Prem", "On Location", "Wrapped", "Another Location"
  wrappedStatus?: WrappedStatus;
  timestamp: FirebaseFirestore.Timestamp;
  metadata?: Record<string, any> | null;
}

export interface UserLocationState {
  userId: string;
  organizationId: string;
  currentLocationStatus: LocationStatus;
  isQrScannedIn: boolean;
  isTimecardClockedIn: boolean;
  wrappedStatus: WrappedStatus;
  lastQrScanTime?: FirebaseFirestore.Timestamp;
  lastTimecardClockInTime?: FirebaseFirestore.Timestamp;
  lastLocationUpdate: FirebaseFirestore.Timestamp;
}

/**
 * Calculate location status based on current state
 * Priority: wrapped > timecard > QR scan
 */
export function calculateLocationStatus(
  isQrScannedIn: boolean,
  isTimecardClockedIn: boolean,
  wrappedStatus: WrappedStatus
): LocationStatus {
  // Wrapped status takes highest priority
  if (wrappedStatus === 'wrapped') return 'wrapped';
  if (wrappedStatus === 'another_location') return 'another_location';

  // Timecard status takes priority over QR scan
  if (isTimecardClockedIn) return 'on_location';
  if (isQrScannedIn) return 'on_prem';

  return null; // Blank
}

/**
 * Get display string for location status
 */
export function getLocationStatusDisplay(status: LocationStatus): string {
  switch (status) {
    case 'on_prem':
      return 'On Prem';
    case 'on_location':
      return 'On Location';
    case 'wrapped':
      return 'Wrapped';
    case 'another_location':
      return 'Another Location';
    default:
      return '';
  }
}

/**
 * Get user's current location state
 */
export async function getLocationStatus(userId: string): Promise<UserLocationState | null> {
  try {
    // Check teamMembers collection FIRST (mobile app uses teamMembers, not users)
    // Strategy 1: Try document ID = userId
    try {
      const teamMemberRef = db.collection('teamMembers').doc(userId);
      const teamMemberDoc = await teamMemberRef.get();
      
      if (teamMemberDoc.exists) {
        const memberData = teamMemberDoc.data();
        return {
          userId,
          organizationId: memberData?.organizationId || '',
          currentLocationStatus: memberData?.currentLocationStatus || null,
          isQrScannedIn: memberData?.isQrScannedIn || false,
          isTimecardClockedIn: memberData?.isTimecardClockedIn || false,
          wrappedStatus: memberData?.wrappedStatus || null,
          lastQrScanTime: memberData?.lastQrScanTime,
          lastTimecardClockInTime: memberData?.lastTimecardClockInTime,
          lastLocationUpdate: memberData?.lastLocationUpdate || admin.firestore.FieldValue.serverTimestamp() as any
        };
      }
    } catch (docIdError) {
      console.log('[LocationStatusService] Could not find teamMember by doc ID, trying query...');
    }

    // Strategy 2: Query by userId field
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!teamMemberQuery.empty) {
      const memberData = teamMemberQuery.docs[0].data();
      return {
        userId,
        organizationId: memberData?.organizationId || '',
        currentLocationStatus: memberData?.currentLocationStatus || null,
        isQrScannedIn: memberData?.isQrScannedIn || false,
        isTimecardClockedIn: memberData?.isTimecardClockedIn || false,
        wrappedStatus: memberData?.wrappedStatus || null,
        lastQrScanTime: memberData?.lastQrScanTime,
        lastTimecardClockInTime: memberData?.lastTimecardClockInTime,
        lastLocationUpdate: memberData?.lastLocationUpdate || admin.firestore.FieldValue.serverTimestamp() as any
      };
    }

    // Fallback to users collection (for licensing website compatibility)
    const userDoc = await db.collection('users').doc(userId).get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      return {
        userId,
        organizationId: userData?.organizationId || '',
        currentLocationStatus: userData?.currentLocationStatus || null,
        isQrScannedIn: userData?.isQrScannedIn || false,
        isTimecardClockedIn: userData?.isTimecardClockedIn || false,
        wrappedStatus: userData?.wrappedStatus || null,
        lastQrScanTime: userData?.lastQrScanTime,
        lastTimecardClockInTime: userData?.lastTimecardClockInTime,
        lastLocationUpdate: userData?.lastLocationUpdate || admin.firestore.FieldValue.serverTimestamp() as any
      };
    }

    return null;
  } catch (error) {
    console.error('[LocationStatusService] Error getting location status:', error);
    throw error;
  }
}

/**
 * Update user's location status
 */
export async function updateLocationStatus(
  userId: string,
  organizationId: string,
  activityType: ActivityType,
  wrappedStatus?: WrappedStatus
): Promise<UserLocationState> {
  try {
    const now = admin.firestore.FieldValue.serverTimestamp();

    // Get current state
    const currentState = await getLocationStatus(userId);

    // Determine new state based on activity type
    let isQrScannedIn = currentState?.isQrScannedIn || false;
    let isTimecardClockedIn = currentState?.isTimecardClockedIn || false;
    // Ensure wrappedStatus is never undefined - use null instead
    let newWrappedStatus: WrappedStatus = wrappedStatus !== undefined && wrappedStatus !== null 
      ? wrappedStatus 
      : (currentState?.wrappedStatus !== undefined && currentState?.wrappedStatus !== null 
          ? currentState.wrappedStatus 
          : null);
    let lastQrScanTime = currentState?.lastQrScanTime;
    let lastTimecardClockInTime = currentState?.lastTimecardClockInTime;

    // Update state based on activity type
    switch (activityType) {
      case 'qr_checkin':
        isQrScannedIn = true;
        lastQrScanTime = now as any;
        // If re-checking in after wrapped, clear wrapped status
        if (newWrappedStatus) {
          newWrappedStatus = null;
        }
        break;
      case 'qr_checkout':
        isQrScannedIn = false;
        // wrappedStatus should be provided for checkout
        if (wrappedStatus === undefined) {
          throw new Error('wrappedStatus is required for QR checkout');
        }
        newWrappedStatus = wrappedStatus;
        break;
      case 'timecard_clockin':
        isTimecardClockedIn = true;
        lastTimecardClockInTime = now as any;
        // If re-checking in after wrapped, clear wrapped status
        if (newWrappedStatus) {
          newWrappedStatus = null;
        }
        break;
      case 'timecard_clockout':
        isTimecardClockedIn = false;
        // wrappedStatus should be provided for clockout
        if (wrappedStatus === undefined) {
          throw new Error('wrappedStatus is required for timecard clockout');
        }
        newWrappedStatus = wrappedStatus;
        break;
    }

    // Calculate new location status
    const newLocationStatus = calculateLocationStatus(
      isQrScannedIn,
      isTimecardClockedIn,
      newWrappedStatus
    );

    // Update user document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    // Ensure wrappedStatus is null instead of undefined (double-check before writing to Firestore)
    const wrappedStatusValue: WrappedStatus | null = (newWrappedStatus !== undefined && newWrappedStatus !== null) ? newWrappedStatus : null;

    // Build updateData object, ensuring no undefined values
    const updateData: any = {
      currentLocationStatus: newLocationStatus || null,
      isQrScannedIn: isQrScannedIn || false,
      isTimecardClockedIn: isTimecardClockedIn || false,
      wrappedStatus: wrappedStatusValue, // Already ensured to be null if undefined
      lastLocationUpdate: now
    };

    // Add timestamp fields, ensuring no undefined values
    if (activityType === 'qr_checkin' || activityType === 'qr_checkout') {
      updateData.lastQrScanTime = lastQrScanTime || null;
      // Also set lastQrCheckInTime/OutTime for Location Tracking page compatibility
      if (activityType === 'qr_checkin') {
        updateData.lastQrCheckInTime = lastQrScanTime || null;
        // Ensure lastQrCheckOutTime is explicitly null for check-in
        updateData.lastQrCheckOutTime = null;
      } else if (activityType === 'qr_checkout') {
        updateData.lastQrCheckOutTime = now;
        // Ensure lastQrCheckInTime is preserved or null
        updateData.lastQrCheckInTime = lastQrScanTime || null;
      }
    } else {
      // For non-QR activities, preserve existing values or set to null
      updateData.lastQrScanTime = lastQrScanTime || null;
      updateData.lastQrCheckInTime = lastQrScanTime || null;
      updateData.lastQrCheckOutTime = null;
    }

    if (activityType === 'timecard_clockin' || activityType === 'timecard_clockout') {
      updateData.lastTimecardClockInTime = lastTimecardClockInTime || null;
    } else {
      // For non-timecard activities, preserve existing value or set to null
      updateData.lastTimecardClockInTime = lastTimecardClockInTime || null;
    }
    
    // Final safety check: remove any undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        console.warn(`[LocationStatusService] Removing undefined value for key: ${key}`);
        delete updateData[key];
      }
    });

    // Update users collection
    if (userDoc.exists) {
      await userRef.update(updateData);
    } else {
      // Create new user document if it doesn't exist
      await userRef.set({
        organizationId,
        ...updateData
      }, { merge: true });
    }

    // Also update teamMembers collection (Location Tracking page reads from here)
    // Try multiple strategies to find and update the teamMember document
    let teamMemberUpdated = false;

    // Strategy 1: Try document ID directly (common pattern where doc ID = userId)
    try {
      const teamMemberDocRef = db.collection('teamMembers').doc(userId);
      const teamMemberDoc = await teamMemberDocRef.get();
      
      if (teamMemberDoc.exists) {
        const teamMemberData = teamMemberDoc.data();
        // Verify organization matches
        if (teamMemberData?.organizationId === organizationId || !teamMemberData?.organizationId) {
          await teamMemberDocRef.update(updateData);
          console.log(`✅ [LocationStatusService] Updated teamMembers (by doc ID) for userId: ${userId}`);
          teamMemberUpdated = true;
        }
      }
    } catch (docIdError: any) {
      console.log(`ℹ️ [LocationStatusService] Could not update teamMember by doc ID: ${docIdError.message}`);
    }

    // Strategy 2: Query by userId and organizationId (if not already updated)
    if (!teamMemberUpdated) {
      try {
        const teamMemberQuery = await db.collection('teamMembers')
          .where('userId', '==', userId)
          .where('organizationId', '==', organizationId)
          .limit(1)
          .get();

        if (!teamMemberQuery.empty) {
          await teamMemberQuery.docs[0].ref.update(updateData);
          console.log(`✅ [LocationStatusService] Updated teamMembers (by query) for userId: ${userId}`);
          teamMemberUpdated = true;
        }
      } catch (queryError: any) {
        console.log(`ℹ️ [LocationStatusService] Could not query teamMember: ${queryError.message}`);
      }
    }

    // Strategy 3: Try without organizationId filter (fallback)
    if (!teamMemberUpdated) {
      try {
        const teamMemberQueryFallback = await db.collection('teamMembers')
          .where('userId', '==', userId)
          .limit(1)
          .get();
        
        if (!teamMemberQueryFallback.empty) {
          await teamMemberQueryFallback.docs[0].ref.update(updateData);
          console.log(`✅ [LocationStatusService] Updated teamMembers (fallback query) for userId: ${userId}`);
          teamMemberUpdated = true;
        }
      } catch (fallbackError: any) {
        console.log(`ℹ️ [LocationStatusService] Could not query teamMember (fallback): ${fallbackError.message}`);
      }
    }

    if (!teamMemberUpdated) {
      console.warn(`⚠️ [LocationStatusService] No teamMember found/updated for userId: ${userId}, organizationId: ${organizationId}`);
    }

    // Return updated state
    return {
      userId,
      organizationId,
      currentLocationStatus: newLocationStatus,
      isQrScannedIn,
      isTimecardClockedIn,
      wrappedStatus: newWrappedStatus,
      lastQrScanTime: lastQrScanTime as any,
      lastTimecardClockInTime: lastTimecardClockInTime as any,
      lastLocationUpdate: now as any
    };
  } catch (error) {
    console.error('[LocationStatusService] Error updating location status:', error);
    throw error;
  }
}

/**
 * Log location activity to history
 */
export async function logLocationActivity(
  userId: string,
  organizationId: string,
  activityType: ActivityType,
  status: LocationStatus,
  wrappedStatus?: WrappedStatus,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const activity: Omit<LocationActivity, 'timestamp'> = {
      userId,
      organizationId,
      activityType,
      status: getLocationStatusDisplay(status),
      wrappedStatus,
      metadata: metadata || null
    };

    await db.collection('location_activity_history').add({
      ...activity,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('[LocationStatusService] Error logging location activity:', error);
    throw error;
  }
}

/**
 * Get location history for a user or organization
 */
export async function getLocationHistory(
  userId?: string,
  organizationId?: string,
  startDate?: Date,
  endDate?: Date,
  limit: number = 100
): Promise<LocationActivity[]> {
  try {
    let query: FirebaseFirestore.Query = db.collection('location_activity_history');

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (organizationId) {
      query = query.where('organizationId', '==', organizationId);
    }

    if (startDate) {
      query = query.where('timestamp', '>=', Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('timestamp', '<=', Timestamp.fromDate(endDate));
    }

    query = query.orderBy('timestamp', 'desc').limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map(doc => ({
      ...doc.data(),
      timestamp: doc.data().timestamp
    } as LocationActivity));
  } catch (error) {
    console.error('[LocationStatusService] Error getting location history:', error);
    throw error;
  }
}

