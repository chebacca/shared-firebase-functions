/**
 * Create Guest Profile from Security Desk
 * Creates guest profile with proper validation and UUID generation (supports provisional profiles)
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface CreateGuestProfileRequest {
    name: string;
    email?: string;
    phoneNumber?: string;
    organizationId: string;
    projectId: string;
    arrivalContactId?: string;
    visibleContactIds?: string[];
    photoURL?: string;
    company?: string;
    purpose?: string;
    isProvisional?: boolean;
    temporaryBadgeNumber?: string;
    description?: string;
    createdByGuardId: string;
    approvalRequestId?: string;
}

// Firebase Callable function
export const createGuestProfileFromSecurityDesk = onCall(
    {
        region: 'us-central1',
        memory: '256MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: true,
    },
    async (request) => {
        try {
            const data = request.data as CreateGuestProfileRequest;

            // Validate required fields
            if (!data.name && !data.description) {
                throw new Error('Either name or description is required');
            }
            if (!data.organizationId) {
                throw new Error('organizationId is required');
            }
            if (!data.projectId) {
                throw new Error('projectId is required');
            }
            if (!data.createdByGuardId) {
                throw new Error('createdByGuardId is required');
            }

            // Provisional guests require photo
            if (data.isProvisional && !data.photoURL) {
                throw new Error('Photo is required for provisional guests');
            }

            const now = admin.firestore.Timestamp.now();
            const nowISO = now.toDate().toISOString();

            // Generate checkInUUID only if email is provided
            let checkInUUID: string | undefined;
            if (data.email && !data.isProvisional) {
                checkInUUID = randomUUID();
            }

            // Create guest profile document
            const guestProfile: any = {
                name: data.name || data.description || 'Unknown Guest',
                email: data.email || '',
                organizationId: data.organizationId,
                projectId: data.projectId,
                status: 'active',
                arrivalContactId: data.arrivalContactId || null,
                visibleContactIds: data.visibleContactIds || [],
                allowQrCheckIn: !data.isProvisional && !!data.email,
                showCallSheet: !data.isProvisional,
                photoURL: data.photoURL || '',
                createdAt: now,
                updatedAt: now,
                createdBy: data.createdByGuardId,
                createdFromSecurityDesk: true,
                createdByGuardId: data.createdByGuardId,
            };

            // Add provisional-specific fields
            if (data.isProvisional) {
                guestProfile.isProvisional = true;
                guestProfile.identificationMethod = data.photoURL ? 'photo' : 'badge';
                guestProfile.temporaryBadgeNumber = data.temporaryBadgeNumber || '';
                guestProfile.description = data.description;
                guestProfile.canGenerateQR = false;
            } else {
                guestProfile.canGenerateQR = !!data.email;
            }

            // Add optional fields
            if (data.company) guestProfile.company = data.company;
            if (data.purpose) guestProfile.purpose = data.purpose;
            if (data.phoneNumber) guestProfile.phoneNumber = data.phoneNumber;
            if (data.approvalRequestId) guestProfile.approvalRequestId = data.approvalRequestId;

            // Create guest profile
            const docRef = await db.collection('guest_profiles').add(guestProfile);

            // If email provided and not provisional, create teamMembers entry with checkInUUID
            if (checkInUUID && data.email) {
                try {
                    await db.collection('teamMembers').add({
                        userId: docRef.id, // Use guest profile ID as userId
                        email: data.email,
                        name: guestProfile.name,
                        organizationId: data.organizationId,
                        checkInUUID: checkInUUID,
                        isGuest: true,
                        guestProfileId: docRef.id,
                        createdAt: now,
                        updatedAt: now,
                    });
                } catch (error) {
                    console.error('Error creating teamMembers entry:', error);
                    // Don't fail the entire operation if teamMembers creation fails
                }
            }

            return createSuccessResponse({
                success: true,
                guestId: docRef.id,
                checkInUUID: checkInUUID || null,
                isProvisional: data.isProvisional || false,
            }, 'Guest profile created successfully');
        } catch (error) {
            return handleError(error, 'createGuestProfileFromSecurityDesk');
        }
    }
);

// HTTP function
export const createGuestProfileFromSecurityDeskHttp = onRequest(
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
            const data = req.body as CreateGuestProfileRequest;

            // Validate required fields
            if (!data.name && !data.description) {
                res.status(400).json(createErrorResponse('Either name or description is required'));
                return;
            }
            if (!data.organizationId) {
                res.status(400).json(createErrorResponse('organizationId is required'));
                return;
            }
            if (!data.projectId) {
                res.status(400).json(createErrorResponse('projectId is required'));
                return;
            }
            if (!data.createdByGuardId) {
                res.status(400).json(createErrorResponse('createdByGuardId is required'));
                return;
            }

            // Provisional guests require photo
            if (data.isProvisional && !data.photoURL) {
                res.status(400).json(createErrorResponse('Photo is required for provisional guests'));
                return;
            }

            const now = admin.firestore.Timestamp.now();

            // Generate checkInUUID only if email is provided
            let checkInUUID: string | undefined;
            if (data.email && !data.isProvisional) {
                checkInUUID = randomUUID();
            }

            // Create guest profile document
            const guestProfile: any = {
                name: data.name || data.description || 'Unknown Guest',
                email: data.email || '',
                organizationId: data.organizationId,
                projectId: data.projectId,
                status: 'active',
                arrivalContactId: data.arrivalContactId || null,
                visibleContactIds: data.visibleContactIds || [],
                allowQrCheckIn: !data.isProvisional && !!data.email,
                showCallSheet: !data.isProvisional,
                photoURL: data.photoURL || '',
                createdAt: now,
                updatedAt: now,
                createdBy: data.createdByGuardId,
                createdFromSecurityDesk: true,
                createdByGuardId: data.createdByGuardId,
            };

            // Add provisional-specific fields
            if (data.isProvisional) {
                guestProfile.isProvisional = true;
                guestProfile.identificationMethod = data.photoURL ? 'photo' : 'badge';
                guestProfile.temporaryBadgeNumber = data.temporaryBadgeNumber || '';
                guestProfile.description = data.description;
                guestProfile.canGenerateQR = false;
            } else {
                guestProfile.canGenerateQR = !!data.email;
            }

            // Add optional fields
            if (data.company) guestProfile.company = data.company;
            if (data.purpose) guestProfile.purpose = data.purpose;
            if (data.phoneNumber) guestProfile.phoneNumber = data.phoneNumber;
            if (data.approvalRequestId) guestProfile.approvalRequestId = data.approvalRequestId;

            // Create guest profile
            const docRef = await db.collection('guest_profiles').add(guestProfile);

            // If email provided and not provisional, create teamMembers entry with checkInUUID
            if (checkInUUID && data.email) {
                try {
                    await db.collection('teamMembers').add({
                        userId: docRef.id,
                        email: data.email,
                        name: guestProfile.name,
                        organizationId: data.organizationId,
                        checkInUUID: checkInUUID,
                        isGuest: true,
                        guestProfileId: docRef.id,
                        createdAt: now,
                        updatedAt: now,
                    });
                } catch (error) {
                    console.error('Error creating teamMembers entry:', error);
                }
            }

            res.status(201).json(createSuccessResponse({
                success: true,
                guestId: docRef.id,
                checkInUUID: checkInUUID || null,
                isProvisional: data.isProvisional || false,
            }, 'Guest profile created successfully'));
        } catch (error) {
            res.status(500).json(handleError(error, 'createGuestProfileFromSecurityDeskHttp'));
        }
    }
);
