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
  metadata?: Record<string, any>;
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
    // Try to get from users collection first
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
    
    // Fallback to teamMembers collection
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
    let newWrappedStatus: WrappedStatus = wrappedStatus !== undefined ? wrappedStatus : (currentState?.wrappedStatus || null);
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
    
    const updateData: any = {
      currentLocationStatus: newLocationStatus,
      isQrScannedIn,
      isTimecardClockedIn,
      wrappedStatus: newWrappedStatus,
      lastLocationUpdate: now
    };
    
    if (activityType === 'qr_checkin' || activityType === 'qr_checkout') {
      updateData.lastQrScanTime = lastQrScanTime;
    }
    
    if (activityType === 'timecard_clockin' || activityType === 'timecard_clockout') {
      updateData.lastTimecardClockInTime = lastTimecardClockInTime;
    }
    
    if (userDoc.exists) {
      await userRef.update(updateData);
    } else {
      // Try teamMembers collection
      const teamMemberQuery = await db.collection('teamMembers')
        .where('userId', '==', userId)
        .limit(1)
        .get();
      
      if (!teamMemberQuery.empty) {
        await teamMemberQuery.docs[0].ref.update(updateData);
      } else {
        // Create new user document if it doesn't exist
        await userRef.set({
          organizationId,
          ...updateData
        }, { merge: true });
      }
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
      metadata
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

