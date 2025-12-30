/**
 * QR Code Scan Check-In/Out Function
 * 
 * Handles QR code scan check-in and check-out for users
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
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
      const { checkInUUID, wrappedStatus } = request.data;

      if (!checkInUUID) {
        throw new Error('checkInUUID is required');
      }

      console.log(`📱 [QR SCAN] Processing QR scan for checkInUUID: ${checkInUUID}`);

      // Find user by checkInUUID
      const usersQuery = await db.collection('users')
        .where('checkInUUID', '==', checkInUUID)
        .limit(1)
        .get();

      if (usersQuery.empty) {
        // Try teamMembers collection
        const teamMembersQuery = await db.collection('teamMembers')
          .where('checkInUUID', '==', checkInUUID)
          .limit(1)
          .get();

        if (teamMembersQuery.empty) {
          throw new Error('User not found with provided checkInUUID');
        }

        const userDoc = teamMembersQuery.docs[0];
        const userData = userDoc.data();
        const userId = userData.userId || userDoc.id;
        const organizationId = userData.organizationId;

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
          console.log(`✅ [QR SCAN] Checking in user: ${userId}`);
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

          return createSuccessResponse({
            success: true,
            action: 'checkin',
            status: getLocationStatusDisplay(updatedState.currentLocationStatus),
            locationStatus: updatedState.currentLocationStatus
          }, 'Successfully checked in');
        } else {
          // Check-out - wrappedStatus is required
          if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
            throw new Error('wrappedStatus is required for check-out and must be "wrapped" or "another_location"');
          }

          console.log(`🚪 [QR SCAN] Checking out user: ${userId}, wrappedStatus: ${wrappedStatus}`);
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
      } else {
        const userDoc = usersQuery.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        const organizationId = userData.organizationId;

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
          console.log(`✅ [QR SCAN] Checking in user: ${userId}`);
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

          return createSuccessResponse({
            success: true,
            action: 'checkin',
            status: getLocationStatusDisplay(updatedState.currentLocationStatus),
            locationStatus: updatedState.currentLocationStatus
          }, 'Successfully checked in');
        } else {
          // Check-out - wrappedStatus is required
          if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
            throw new Error('wrappedStatus is required for check-out and must be "wrapped" or "another_location"');
          }

          console.log(`🚪 [QR SCAN] Checking out user: ${userId}, wrappedStatus: ${wrappedStatus}`);
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
      const { checkInUUID, wrappedStatus } = req.body;

      if (!checkInUUID) {
        res.status(400).json(createErrorResponse('checkInUUID is required'));
        return;
      }

      console.log(`📱 [QR SCAN HTTP] Processing QR scan for checkInUUID: ${checkInUUID}`);

      // Find user by checkInUUID
      const usersQuery = await db.collection('users')
        .where('checkInUUID', '==', checkInUUID)
        .limit(1)
        .get();

      if (usersQuery.empty) {
        // Try teamMembers collection
        const teamMembersQuery = await db.collection('teamMembers')
          .where('checkInUUID', '==', checkInUUID)
          .limit(1)
          .get();

        if (teamMembersQuery.empty) {
          res.status(404).json(createErrorResponse('User not found with provided checkInUUID'));
          return;
        }

        const userDoc = teamMembersQuery.docs[0];
        const userData = userDoc.data();
        const userId = userData.userId || userDoc.id;
        const organizationId = userData.organizationId;

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
          console.log(`✅ [QR SCAN HTTP] Checking in user: ${userId}`);
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

          res.status(200).json(createSuccessResponse({
            success: true,
            action: 'checkin',
            status: getLocationStatusDisplay(updatedState.currentLocationStatus),
            locationStatus: updatedState.currentLocationStatus
          }, 'Successfully checked in'));
        } else {
          // Check-out - wrappedStatus is required
          if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
            res.status(400).json(createErrorResponse('wrappedStatus is required for check-out and must be "wrapped" or "another_location"'));
            return;
          }

          console.log(`🚪 [QR SCAN HTTP] Checking out user: ${userId}, wrappedStatus: ${wrappedStatus}`);
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
      } else {
        const userDoc = usersQuery.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        const organizationId = userData.organizationId;

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
          console.log(`✅ [QR SCAN HTTP] Checking in user: ${userId}`);
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

          res.status(200).json(createSuccessResponse({
            success: true,
            action: 'checkin',
            status: getLocationStatusDisplay(updatedState.currentLocationStatus),
            locationStatus: updatedState.currentLocationStatus
          }, 'Successfully checked in'));
        } else {
          // Check-out - wrappedStatus is required
          if (!wrappedStatus || (wrappedStatus !== 'wrapped' && wrappedStatus !== 'another_location')) {
            res.status(400).json(createErrorResponse('wrappedStatus is required for check-out and must be "wrapped" or "another_location"'));
            return;
          }

          console.log(`🚪 [QR SCAN HTTP] Checking out user: ${userId}, wrappedStatus: ${wrappedStatus}`);
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
      }
    } catch (error: any) {
      console.error('[QR SCAN HTTP] Error:', error);
      res.status(500).json(handleError(error, 'qrScanCheckInOutHttp'));
    }
  }
);

