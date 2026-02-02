/**
 * 🔥 OVERTIME REQUEST FUNCTIONS
 * Firebase Functions for managing overtime requests and approval workflow
 */

// CORS: true allows preflight from any origin (localhost, Hub iframe, deployed apps).
// Callable functions validate auth server-side, so origin restriction is optional.
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, messaging } from '../shared/utils';
import { createSuccessResponse, createErrorResponse } from '../shared/utils';
import * as admin from 'firebase-admin';
import type { OvertimeRequest, OvertimeRequestType, OvertimeRequestStatus, OvertimeResponse } from 'shared-firebase-types';

/**
 * Create a new overtime request
 */
export const createOvertimeRequest = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const {
        organizationId,
        projectId,
        requestType,
        recipientId,
        recipientName,
        managerId,
        employeeId,
        reason,
        estimatedHours,
        requestedDate
      } = data;

      if (!organizationId || !requestType || !recipientId || !managerId || !employeeId || !reason) {
        throw new Error('Missing required fields');
      }

      // Get requester info
      const requesterDoc = await db.collection('users').doc(auth.uid).get();
      const requesterData = requesterDoc.data();
      const requesterName = requesterData?.displayName || requesterData?.name || requesterData?.email || 'Unknown';

      // Create overtime request
      const overtimeRequest: Omit<OvertimeRequest, 'id'> = {
        organizationId,
        projectId,
        requestType,
        requesterId: auth.uid,
        requesterName,
        recipientId,
        recipientName: recipientName || 'Unknown',
        managerId,
        employeeId,
        reason,
        estimatedHours,
        requestedDate,
        status: 'PENDING' as OvertimeRequestStatus,
        createdAt: FieldValue.serverTimestamp() as any,
        updatedAt: FieldValue.serverTimestamp() as any
      };

      const docRef = await db.collection('overtimeRequests').add(overtimeRequest);
      const requestId = docRef.id;

      // Create notification for recipient
      await db.collection('notifications').add({
        userId: recipientId,
        organizationId,
        category: 'overtime_request',
        type: requestType === 'MANAGER_INQUIRY' ? 'overtime_inquiry' : 'overtime_request',
        title: requestType === 'MANAGER_INQUIRY'
          ? 'Overtime Inquiry from Manager'
          : 'Overtime Request',
        message: requestType === 'MANAGER_INQUIRY'
          ? `${requesterName} is asking if you need overtime`
          : `${requesterName} has requested overtime: ${reason}`,
        data: {
          overtimeRequestId: requestId,
          requestType,
          requesterId: auth.uid,
          requesterName
        },
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });

      // Send push notification
      try {
        const tokensSnapshot = await db
          .collection('users')
          .doc(recipientId)
          .collection('fcmTokens')
          .where('isActive', '==', true)
          .get();

        if (!tokensSnapshot.empty) {
          const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
          await messaging.sendEachForMulticast({
            notification: {
              title: requestType === 'MANAGER_INQUIRY'
                ? 'Overtime Inquiry'
                : 'Overtime Request',
              body: requestType === 'MANAGER_INQUIRY'
                ? `${requesterName} is asking if you need overtime`
                : `${requesterName} has requested overtime`
            },
            data: {
              type: 'overtime_request',
              overtimeRequestId: requestId,
              requestType
            },
            tokens
          });
        }
      } catch (notifError) {
        console.warn('Failed to send push notification:', notifError);
      }

      console.log(`✅ [OvertimeRequest] Created request: ${requestId}`);
      return createSuccessResponse({ requestId }, 'Overtime request created successfully');
    } catch (error: any) {
      console.error('❌ [OvertimeRequest] Error creating request:', error);
      return createErrorResponse(error.message || 'Failed to create overtime request');
    }
  }
);

/**
 * Respond to an overtime request (handler logic shared by callable and HTTP)
 */
async function respondToOvertimeRequestHandler(
  data: { requestId: string; response: string; responseReason?: string },
  authUid: string
) {
  const { requestId, response, responseReason } = data;
  if (!requestId || !response) {
    throw new Error('Missing required fields: requestId, response');
  }
  const requestRef = db.collection('overtimeRequests').doc(requestId);
  const requestDoc = await requestRef.get();
  if (!requestDoc.exists) {
    throw new Error('Overtime request not found');
  }
  const requestData = requestDoc.data() as OvertimeRequest;
  if (requestData.recipientId !== authUid) {
    throw new Error('Unauthorized: You are not the recipient of this request');
  }
  if (requestData.status !== 'PENDING') {
    throw new Error('Request has already been responded to');
  }
  await requestRef.update({
    response,
    responseReason,
    status: 'RESPONDED' as OvertimeRequestStatus,
    respondedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });
  await db.collection('notifications').add({
    userId: requestData.requesterId,
    organizationId: requestData.organizationId,
    category: 'overtime_request',
    type: 'overtime_response',
    title: 'Overtime Request Response',
    message: `${requestData.recipientName} has ${response === 'ACCEPTED' ? 'accepted' : 'declined'} your overtime request`,
    data: { overtimeRequestId: requestId, response },
    read: false,
    createdAt: FieldValue.serverTimestamp()
  });
  console.log(`✅ [OvertimeRequest] Response recorded: ${requestId}`);
  return createSuccessResponse({ requestId, response }, 'Response recorded successfully');
}

/**
 * Respond to an overtime request (callable)
 */
export const respondToOvertimeRequest = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB',
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) throw new Error('Unauthorized');
      return await respondToOvertimeRequestHandler(data, auth.uid);
    } catch (error: any) {
      console.error('❌ [OvertimeRequest] Error responding to request:', error);
      return createErrorResponse(error.message || 'Failed to respond to overtime request');
    }
  }
);

/**
 * Respond to overtime request (HTTP with explicit CORS) - use when callable CORS fails (e.g. localhost).
 * Same logic as respondToOvertimeRequest; client can call this URL with Authorization header and JSON body.
 * invoker: 'public' required so OPTIONS preflight (no auth) reaches this handler; POST still requires Bearer token.
 */
export const respondToOvertimeRequestHttp = onRequest(
  {
    region: 'us-central1',
    cors: true,
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 30
  },
  async (req, res) => {
    // CORS: allow request origin (localhost, Hub, deployed apps) so preflight and response succeed
    const origin = req.get('Origin');
    const allowOrigin = origin || '*';
    res.set('Access-Control-Allow-Origin', allowOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json(createErrorResponse('Method not allowed'));
      return;
    }
    try {
      const authHeader = req.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized'));
        return;
      }
      const token = authHeader.slice(7);
      const decoded = await admin.auth().verifyIdToken(token);
      const uid = decoded.uid;
      const body = req.body?.data ?? req.body;
      const { requestId, response, responseReason } = body || {};
      const result = await respondToOvertimeRequestHandler(
        { requestId, response, responseReason },
        uid
      );
      res.status(200).json(result);
    } catch (error: any) {
      console.error('❌ [OvertimeRequest HTTP] Error:', error);
      res.status(400).json(createErrorResponse(error.message || 'Failed to respond to overtime request'));
    }
  }
);

/**
 * Certify overtime request (Manager action)
 */
export const certifyOvertimeRequest = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { requestId, certificationNotes } = data;

      if (!requestId) {
        throw new Error('Missing required field: requestId');
      }

      const requestRef = db.collection('overtimeRequests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new Error('Overtime request not found');
      }

      const requestData = requestDoc.data() as OvertimeRequest;

      // Verify user is the manager
      if (requestData.managerId !== auth.uid) {
        throw new Error('Unauthorized: You are not the manager for this request');
      }

      if (requestData.status !== 'RESPONDED' || requestData.response !== 'ACCEPTED') {
        throw new Error('Request must be responded to and accepted before certification');
      }

      // Get manager info
      const managerDoc = await db.collection('users').doc(auth.uid).get();
      const managerData = managerDoc.data();
      const managerName = managerData?.displayName || managerData?.name || managerData?.email || 'Manager';

      // Update request to certified status
      await requestRef.update({
        certifiedBy: auth.uid,
        certifiedAt: FieldValue.serverTimestamp(),
        certificationNotes,
        status: 'CERTIFIED' as OvertimeRequestStatus,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Find exec/accounting users to notify
      const execRoles = ['EXECUTIVE_PRODUCER', 'PRODUCER', 'ACCOUNTING', 'ADMIN', 'OWNER'];
      const execUsersSnapshot = await db
        .collection('users')
        .where('organizationId', '==', requestData.organizationId)
        .get();

      const execUserIds: string[] = [];
      execUsersSnapshot.forEach(doc => {
        const userData = doc.data();
        const role = userData.role || userData.dashboardRole || '';
        if (execRoles.includes(role.toUpperCase())) {
          execUserIds.push(doc.id);
        }
      });

      // Notify exec/accounting users
      const batch = db.batch();
      execUserIds.forEach(userId => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId,
          organizationId: requestData.organizationId,
          category: 'overtime_request',
          type: 'overtime_pending_approval',
          title: 'Overtime Request Pending Approval',
          message: `Overtime request from ${requestData.employeeId === requestData.requesterId ? requestData.requesterName : requestData.employeeId} has been certified and requires approval`,
          data: {
            overtimeRequestId: requestId,
            managerId: auth.uid,
            managerName
          },
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();

      // Notify employee
      await db.collection('notifications').add({
        userId: requestData.employeeId,
        organizationId: requestData.organizationId,
        category: 'overtime_request',
        type: 'overtime_certified',
        title: 'Overtime Request Certified',
        message: `Your overtime request has been certified by ${managerName} and is pending executive approval`,
        data: {
          overtimeRequestId: requestId
        },
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ [OvertimeRequest] Certified: ${requestId}`);
      return createSuccessResponse({ requestId }, 'Overtime request certified successfully');
    } catch (error: any) {
      console.error('❌ [OvertimeRequest] Error certifying request:', error);
      return createErrorResponse(error.message || 'Failed to certify overtime request');
    }
  }
);

/**
 * Approve overtime request (Exec/Accounting action)
 */
export const approveOvertimeRequest = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { requestId, execNotes } = data;

      if (!requestId) {
        throw new Error('Missing required field: requestId');
      }

      // Verify user has exec/accounting role
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();
      const role = userData?.role || userData?.dashboardRole || '';
      const execRoles = ['EXECUTIVE_PRODUCER', 'PRODUCER', 'ACCOUNTING', 'ADMIN', 'OWNER'];

      if (!execRoles.includes(role.toUpperCase())) {
        throw new Error('Unauthorized: Only executives and accounting can approve overtime requests');
      }

      const requestRef = db.collection('overtimeRequests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new Error('Overtime request not found');
      }

      const requestData = requestDoc.data() as OvertimeRequest;

      if (requestData.status !== 'CERTIFIED' && requestData.status !== 'PENDING_EXEC_APPROVAL') {
        throw new Error('Request must be certified before approval');
      }

      const approverName = userData?.displayName || userData?.name || userData?.email || 'Approver';

      // Set approvedHours from estimatedHours if not already set
      const approvedHours = requestData.approvedHours || requestData.estimatedHours || 0;

      // Update request to approved
      await requestRef.update({
        execApproverId: auth.uid,
        execApprovedAt: FieldValue.serverTimestamp(),
        execNotes,
        status: 'APPROVED' as OvertimeRequestStatus,
        approvedHours: approvedHours,
        hoursRemaining: approvedHours, // Initialize remaining hours
        hoursUsed: 0, // Initialize used hours
        updatedAt: FieldValue.serverTimestamp()
      });

      // Notify all participants
      const participants = [
        requestData.employeeId,
        requestData.managerId,
        requestData.requesterId
      ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

      const batch = db.batch();
      participants.forEach(userId => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId,
          organizationId: requestData.organizationId,
          category: 'overtime_request',
          type: 'overtime_approved',
          title: 'Overtime Request Approved',
          message: `Your overtime request has been approved by ${approverName}`,
          data: {
            overtimeRequestId: requestId,
            approverId: auth.uid,
            approverName
          },
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();

      console.log(`✅ [OvertimeRequest] Approved: ${requestId}`);
      return createSuccessResponse({ requestId }, 'Overtime request approved successfully');
    } catch (error: any) {
      console.error('❌ [OvertimeRequest] Error approving request:', error);
      return createErrorResponse(error.message || 'Failed to approve overtime request');
    }
  }
);

/**
 * Reject overtime request (Exec/Accounting action)
 */
export const rejectOvertimeRequest = onCall(
  {
    region: 'us-central1',
    cors: true,
    memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
    timeoutSeconds: 30
  },
  async (request) => {
    try {
      const { data, auth } = request;
      if (!auth) {
        throw new Error('Unauthorized');
      }

      const { requestId, rejectionReason } = data;

      if (!requestId || !rejectionReason) {
        throw new Error('Missing required fields: requestId, rejectionReason');
      }

      // Verify user has exec/accounting role
      const userDoc = await db.collection('users').doc(auth.uid).get();
      const userData = userDoc.data();
      const role = userData?.role || userData?.dashboardRole || '';
      const execRoles = ['EXECUTIVE_PRODUCER', 'PRODUCER', 'ACCOUNTING', 'ADMIN', 'OWNER'];

      if (!execRoles.includes(role.toUpperCase())) {
        throw new Error('Unauthorized: Only executives and accounting can reject overtime requests');
      }

      const requestRef = db.collection('overtimeRequests').doc(requestId);
      const requestDoc = await requestRef.get();

      if (!requestDoc.exists) {
        throw new Error('Overtime request not found');
      }

      const requestData = requestDoc.data() as OvertimeRequest;

      if (requestData.status !== 'CERTIFIED' && requestData.status !== 'PENDING_EXEC_APPROVAL') {
        throw new Error('Request must be certified before rejection');
      }

      const rejectorName = userData?.displayName || userData?.name || userData?.email || 'Rejector';

      // Update request to rejected
      await requestRef.update({
        execApproverId: auth.uid,
        execApprovedAt: FieldValue.serverTimestamp(),
        rejectionReason,
        status: 'REJECTED' as OvertimeRequestStatus,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Notify all participants
      const participants = [
        requestData.employeeId,
        requestData.managerId,
        requestData.requesterId
      ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

      const batch = db.batch();
      participants.forEach(userId => {
        const notifRef = db.collection('notifications').doc();
        batch.set(notifRef, {
          userId,
          organizationId: requestData.organizationId,
          category: 'overtime_request',
          type: 'overtime_rejected',
          title: 'Overtime Request Rejected',
          message: `Your overtime request has been rejected by ${rejectorName}: ${rejectionReason}`,
          data: {
            overtimeRequestId: requestId,
            rejectorId: auth.uid,
            rejectorName,
            rejectionReason
          },
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();

      console.log(`✅ [OvertimeRequest] Rejected: ${requestId}`);
      return createSuccessResponse({ requestId }, 'Overtime request rejected');
    } catch (error: any) {
      console.error('❌ [OvertimeRequest] Error rejecting request:', error);
      return createErrorResponse(error.message || 'Failed to reject overtime request');
    }
  }
);
