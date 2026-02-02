/**
 * Request Guest Approval
 * Create approval request and send notifications
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface RequestGuestApprovalData {
    projectId: string;
    organizationId: string;
    guestInfo: {
        name?: string;
        description?: string;
        email?: string;
        phone?: string;
        company?: string;
        purpose?: string;
        photoURL?: string;
    };
    requestedBy: {
        guardId: string;
        guardName: string;
    };
    requestedFrom: {
        teamMemberId: string;
        teamMemberName: string;
        contactMethod: 'call' | 'message' | 'email';
    };
    timeoutMinutes?: number;
}

// Firebase Callable function
export const requestGuestApproval = onCall(
    {
        region: 'us-central1',
        memory: '512MiB',
        timeoutSeconds: 30,
        invoker: 'public',
        cors: true,
    },
    async (request) => {
        try {
            const data = request.data as RequestGuestApprovalData;

            // Validate required fields
            if (!data.projectId) {
                throw new Error('projectId is required');
            }
            if (!data.organizationId) {
                throw new Error('organizationId is required');
            }
            if (!data.requestedBy?.guardId || !data.requestedBy?.guardName) {
                throw new Error('requestedBy guardId and guardName are required');
            }
            if (!data.requestedFrom?.teamMemberId || !data.requestedFrom?.teamMemberName) {
                throw new Error('requestedFrom teamMemberId and teamMemberName are required');
            }

            const now = admin.firestore.Timestamp.now();
            const nowISO = now.toDate().toISOString();

            // Create approval request document
            const approvalRequest = {
                projectId: data.projectId,
                organizationId: data.organizationId,
                guestInfo: data.guestInfo,
                requestedBy: data.requestedBy,
                requestedFrom: data.requestedFrom,
                status: 'pending',
                createdAt: nowISO,
                timeoutMinutes: data.timeoutMinutes || 15,
            };

            const docRef = await db.collection('guest_approval_requests').add(approvalRequest);

            // TODO: Send Firebase Cloud Messaging notification
            // TODO: Send email notification (optional)
            // TODO: Create message session for team member

            return createSuccessResponse({
                success: true,
                requestId: docRef.id,
            }, 'Approval request created successfully');
        } catch (error) {
            return handleError(error, 'requestGuestApproval');
        }
    }
);

// HTTP function
export const requestGuestApprovalHttp = onRequest(
    {
        region: 'us-central1',
        memory: '512MiB',
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
            const data = req.body as RequestGuestApprovalData;

            // Validate required fields
            if (!data.projectId) {
                res.status(400).json(createErrorResponse('projectId is required'));
                return;
            }
            if (!data.organizationId) {
                res.status(400).json(createErrorResponse('organizationId is required'));
                return;
            }
            if (!data.requestedBy?.guardId || !data.requestedBy?.guardName) {
                res.status(400).json(createErrorResponse('requestedBy guardId and guardName are required'));
                return;
            }
            if (!data.requestedFrom?.teamMemberId || !data.requestedFrom?.teamMemberName) {
                res.status(400).json(createErrorResponse('requestedFrom teamMemberId and teamMemberName are required'));
                return;
            }

            const now = admin.firestore.Timestamp.now();
            const nowISO = now.toDate().toISOString();

            // Create approval request document
            const approvalRequest = {
                projectId: data.projectId,
                organizationId: data.organizationId,
                guestInfo: data.guestInfo,
                requestedBy: data.requestedBy,
                requestedFrom: data.requestedFrom,
                status: 'pending',
                createdAt: nowISO,
                timeoutMinutes: data.timeoutMinutes || 15,
            };

            const docRef = await db.collection('guest_approval_requests').add(approvalRequest);

            // TODO: Send Firebase Cloud Messaging notification
            // TODO: Send email notification (optional)
            // TODO: Create message session for team member

            res.status(201).json(createSuccessResponse({
                success: true,
                requestId: docRef.id,
            }, 'Approval request created successfully'));
        } catch (error) {
            res.status(500).json(handleError(error, 'requestGuestApprovalHttp'));
        }
    }
);
