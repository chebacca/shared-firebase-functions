/**
 * Manual Check-In/Out Function
 * Manual check-in/out without QR codes (for guests without credentials)
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';
import {
    updateLocationStatus,
    logLocationActivity,
    getLocationStatus,
    WrappedStatus
} from '../location/locationStatusService';

const db = getFirestore();

interface ManualCheckInOutRequest {
    guestId: string;
    method: 'badge' | 'photo';
    action: 'check_in' | 'check_out';
    guardId: string;
    guardName: string;
    wrappedStatus?: WrappedStatus;
    notes?: string;
}

// Firebase Callable function
export const manualCheckInOut = onCall(
    {
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: true,
    },
    async (request) => {
        try {
            const data = request.data as ManualCheckInOutRequest;

            if (!data.guestId) {
                throw new Error('guestId is required');
            }
            if (!data.method) {
                throw new Error('method is required');
            }
            if (!data.action) {
                throw new Error('action is required');
            }
            if (!data.guardId || !data.guardName) {
                throw new Error('guardId and guardName are required');
            }

            // Get guest profile
            const guestRef = db.collection('guest_profiles').doc(data.guestId);
            const guestSnap = await guestRef.get();

            if (!guestSnap.exists) {
                throw new Error('Guest profile not found');
            }

            const guestData = guestSnap.data();
            if (!guestData) {
                throw new Error('Guest data not found');
            }

            const organizationId = guestData.organizationId;
            if (!organizationId) {
                throw new Error('Guest organization not found');
            }

            // Get or create teamMembers entry for guest
            let userId = guestData.claimedByUserId;
            if (!userId) {
                // Create a teamMembers entry for this guest if they don't have one
                const teamMemberRef = await db.collection('teamMembers').add({
                    userId: data.guestId, // Use guest ID as userId
                    email: guestData.email || '',
                    name: guestData.name,
                    organizationId: organizationId,
                    isGuest: true,
                    guestProfileId: data.guestId,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });
                userId = teamMemberRef.id;
                // Update guest profile with claimedByUserId
                await guestRef.update({ claimedByUserId: userId });
            }

            // Get current location state
            const currentState = await getLocationStatus(userId);
            const isCurrentlyScannedIn = currentState?.isQrScannedIn || false;

            // Validate action
            if (data.action === 'check_in' && isCurrentlyScannedIn) {
                throw new Error('Guest is already checked in');
            }
            if (data.action === 'check_out' && !isCurrentlyScannedIn) {
                throw new Error('Guest is not checked in');
            }

            if (data.action === 'check_in') {
                // Check-in
                const updatedState = await updateLocationStatus(
                    userId,
                    organizationId,
                    'manual_checkin'
                );

                await logLocationActivity(
                    userId,
                    organizationId,
                    'manual_checkin',
                    updatedState.currentLocationStatus
                );

                // Create visitor log entry
                await db.collection('visitor_logs').add({
                    visitorId: userId,
                    guestId: data.guestId,
                    projectId: guestData.projectId,
                    organizationId: organizationId,
                    checkInTime: admin.firestore.Timestamp.now(),
                    checkInMethod: data.method,
                    guardId: data.guardId,
                    guardName: data.guardName,
                    notes: data.notes || null,
                    isProvisionalGuest: guestData.isProvisional || false,
                    temporaryBadgeNumber: guestData.temporaryBadgeNumber || null,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });

                return createSuccessResponse({
                    success: true,
                    action: 'check_in',
                    status: updatedState.currentLocationStatus,
                }, 'Guest checked in successfully');
            } else {
                // Check-out
                if (!data.wrappedStatus) {
                    throw new Error('wrappedStatus is required for check-out');
                }

                const updatedState = await updateLocationStatus(
                    userId,
                    organizationId,
                    'manual_checkout',
                    data.wrappedStatus
                );

                await logLocationActivity(
                    userId,
                    organizationId,
                    'manual_checkout',
                    updatedState.currentLocationStatus
                );

                // Update visitor log entry
                const visitorLogsQuery = await db.collection('visitor_logs')
                    .where('visitorId', '==', userId)
                    .where('guestId', '==', data.guestId)
                    .where('checkOutTime', '==', null)
                    .orderBy('checkInTime', 'desc')
                    .limit(1)
                    .get();

                if (!visitorLogsQuery.empty) {
                    const logDoc = visitorLogsQuery.docs[0];
                    await logDoc.ref.update({
                        checkOutTime: admin.firestore.Timestamp.now(),
                        checkOutMethod: data.method,
                        wrappedStatus: data.wrappedStatus,
                        notes: data.notes || logDoc.data().notes || null,
                        updatedAt: admin.firestore.Timestamp.now(),
                    });
                }

                return createSuccessResponse({
                    success: true,
                    action: 'check_out',
                    status: updatedState.currentLocationStatus,
                }, 'Guest checked out successfully');
            }
        } catch (error) {
            return handleError(error, 'manualCheckInOut');
        }
    }
);

// HTTP function
export const manualCheckInOutHttp = onRequest(
    {
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: false,
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
            const data = req.body as ManualCheckInOutRequest;

            if (!data.guestId) {
                res.status(400).json(createErrorResponse('guestId is required'));
                return;
            }
            if (!data.method) {
                res.status(400).json(createErrorResponse('method is required'));
                return;
            }
            if (!data.action) {
                res.status(400).json(createErrorResponse('action is required'));
                return;
            }
            if (!data.guardId || !data.guardName) {
                res.status(400).json(createErrorResponse('guardId and guardName are required'));
                return;
            }

            // Get guest profile
            const guestRef = db.collection('guest_profiles').doc(data.guestId);
            const guestSnap = await guestRef.get();

            if (!guestSnap.exists) {
                res.status(404).json(createErrorResponse('Guest profile not found'));
                return;
            }

            const guestData = guestSnap.data();
            if (!guestData) {
                res.status(404).json(createErrorResponse('Guest data not found'));
                return;
            }

            const organizationId = guestData.organizationId;
            if (!organizationId) {
                res.status(400).json(createErrorResponse('Guest organization not found'));
                return;
            }

            // Get or create teamMembers entry for guest
            let userId = guestData.claimedByUserId;
            if (!userId) {
                const teamMemberRef = await db.collection('teamMembers').add({
                    userId: data.guestId,
                    email: guestData.email || '',
                    name: guestData.name,
                    organizationId: organizationId,
                    isGuest: true,
                    guestProfileId: data.guestId,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });
                userId = teamMemberRef.id;
                await guestRef.update({ claimedByUserId: userId });
            }

            // Get current location state
            const currentState = await getLocationStatus(userId);
            const isCurrentlyScannedIn = currentState?.isQrScannedIn || false;

            // Validate action
            if (data.action === 'check_in' && isCurrentlyScannedIn) {
                res.status(400).json(createErrorResponse('Guest is already checked in'));
                return;
            }
            if (data.action === 'check_out' && !isCurrentlyScannedIn) {
                res.status(400).json(createErrorResponse('Guest is not checked in'));
                return;
            }

            if (data.action === 'check_in') {
                // Check-in
                const updatedState = await updateLocationStatus(
                    userId,
                    organizationId,
                    'manual_checkin'
                );

                await logLocationActivity(
                    userId,
                    organizationId,
                    'manual_checkin',
                    updatedState.currentLocationStatus
                );

                // Create visitor log entry
                await db.collection('visitor_logs').add({
                    visitorId: userId,
                    guestId: data.guestId,
                    projectId: guestData.projectId,
                    organizationId: organizationId,
                    checkInTime: admin.firestore.Timestamp.now(),
                    checkInMethod: data.method,
                    guardId: data.guardId,
                    guardName: data.guardName,
                    notes: data.notes || null,
                    isProvisionalGuest: guestData.isProvisional || false,
                    temporaryBadgeNumber: guestData.temporaryBadgeNumber || null,
                    createdAt: admin.firestore.Timestamp.now(),
                    updatedAt: admin.firestore.Timestamp.now(),
                });

                res.status(200).json(createSuccessResponse({
                    success: true,
                    action: 'check_in',
                    status: updatedState.currentLocationStatus,
                }, 'Guest checked in successfully'));
            } else {
                // Check-out
                if (!data.wrappedStatus) {
                    res.status(400).json(createErrorResponse('wrappedStatus is required for check-out'));
                    return;
                }

                const updatedState = await updateLocationStatus(
                    userId,
                    organizationId,
                    'manual_checkout',
                    data.wrappedStatus
                );

                await logLocationActivity(
                    userId,
                    organizationId,
                    'manual_checkout',
                    updatedState.currentLocationStatus
                );

                // Update visitor log entry
                const visitorLogsQuery = await db.collection('visitor_logs')
                    .where('visitorId', '==', userId)
                    .where('guestId', '==', data.guestId)
                    .where('checkOutTime', '==', null)
                    .orderBy('checkInTime', 'desc')
                    .limit(1)
                    .get();

                if (!visitorLogsQuery.empty) {
                    const logDoc = visitorLogsQuery.docs[0];
                    await logDoc.ref.update({
                        checkOutTime: admin.firestore.Timestamp.now(),
                        checkOutMethod: data.method,
                        wrappedStatus: data.wrappedStatus,
                        notes: data.notes || logDoc.data().notes || null,
                        updatedAt: admin.firestore.Timestamp.now(),
                    });
                }

                res.status(200).json(createSuccessResponse({
                    success: true,
                    action: 'check_out',
                    status: updatedState.currentLocationStatus,
                }, 'Guest checked out successfully'));
            }
        } catch (error) {
            res.status(500).json(handleError(error, 'manualCheckInOutHttp'));
        }
    }
);
