/**
 * Accounting Approval Functions
 * 
 * Firebase Functions for managing accounting approval alerts and notifications
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders, validateOrganizationAccess } from '../shared/utils';

const db = getFirestore();
const auth = getAuth();

/**
 * Get all pending accounting approval alerts for an organization
 */
export const getAccountingApprovalAlerts = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userOrgId = decodedToken.organizationId;

      if (!userOrgId) {
        res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
        return;
      }

      // Support both GET (query params) and POST (body) for callable compatibility
      const { status, managerId } = req.method === 'GET' ? req.query : (req.body?.data || req.body || {});
      const statusFilter = status ? String(status) : 'PENDING';
      const requestedManagerId = managerId ? String(managerId) : null;

      // Verify user has accounting role or admin, OR is requesting their own alerts
      const userRecord = await auth.getUser(decodedToken.uid);
      const userRole = userRecord.customClaims?.role || '';
      const isAccounting = ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN', 'OWNER'].includes(userRole.toUpperCase());
      const isRequestingOwnAlerts = requestedManagerId === decodedToken.uid;

      if (!isAccounting && !isRequestingOwnAlerts) {
        res.status(403).json(createErrorResponse('Forbidden', 'Accounting role required or must request own alerts'));
        return;
      }

      // Query alerts collection
      let alertsQuery = db.collection('accountingApprovalAlerts')
        .where('organizationId', '==', userOrgId)
        .where('status', '==', statusFilter)
        .orderBy('createdAt', 'desc')
        .limit(100);

      if (requestedManagerId) {
        alertsQuery = alertsQuery.where('managerId', '==', requestedManagerId);
      }

      const alertsSnapshot = await alertsQuery.get();
      const alerts = alertsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
        timePeriod: {
          start: doc.data().timePeriod?.start?.toDate?.()?.toISOString() || doc.data().timePeriod?.start,
          end: doc.data().timePeriod?.end?.toDate?.()?.toISOString() || doc.data().timePeriod?.end
        }
      }));

      res.json(createSuccessResponse(alerts));
    } catch (error: any) {
      console.error('❌ [ACCOUNTING APPROVAL] Error getting alerts:', error);
      res.status(500).json(handleError(error, 'getAccountingApprovalAlerts'));
    }
  }
);

/**
 * Create or update an accounting approval alert
 */
export const createAccountingApprovalAlert = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('Method not allowed', 'POST method required'));
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userOrgId = decodedToken.organizationId;

      if (!userOrgId) {
        res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
        return;
      }

      const alertData = req.body;
      
      // Validate required fields
      if (!alertData.managerId || !alertData.alertType || !alertData.message) {
        res.status(400).json(createErrorResponse('Missing required fields', 'managerId, alertType, and message are required'));
        return;
      }

      const now = Timestamp.now();
      const alertDoc = {
        ...alertData,
        organizationId: userOrgId,
        status: alertData.status || 'PENDING',
        createdAt: now,
        updatedAt: now,
        timePeriod: {
          start: Timestamp.fromDate(new Date(alertData.timePeriod?.start || now.toDate())),
          end: Timestamp.fromDate(new Date(alertData.timePeriod?.end || now.toDate()))
        }
      };

      const alertRef = await db.collection('accountingApprovalAlerts').add(alertDoc);

      // Send notification to accounting personnel
      await sendAccountingNotification(alertRef.id, alertDoc, userOrgId);

      res.json(createSuccessResponse({
        id: alertRef.id,
        ...alertDoc,
        createdAt: alertDoc.createdAt.toDate().toISOString(),
        updatedAt: alertDoc.updatedAt.toDate().toISOString()
      }));
    } catch (error: any) {
      console.error('❌ [ACCOUNTING APPROVAL] Error creating alert:', error);
      res.status(500).json(handleError(error, 'createAccountingApprovalAlert'));
    }
  }
);

/**
 * Acknowledge an accounting approval alert
 */
export const acknowledgeAccountingAlert = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('Method not allowed', 'POST method required'));
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userOrgId = decodedToken.organizationId;

      if (!userOrgId) {
        res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
        return;
      }

      const { alertId } = req.body;
      if (!alertId) {
        res.status(400).json(createErrorResponse('Missing alertId', 'alertId is required'));
        return;
      }

      const alertRef = db.collection('accountingApprovalAlerts').doc(alertId);
      const alertDoc = await alertRef.get();

      if (!alertDoc.exists) {
        res.status(404).json(createErrorResponse('Alert not found', 'The specified alert does not exist'));
        return;
      }

      const alertData = alertDoc.data();
      if (alertData?.organizationId !== userOrgId) {
        res.status(403).json(createErrorResponse('Forbidden', 'Cannot access alert from different organization'));
        return;
      }

      await alertRef.update({
        status: 'ACKNOWLEDGED',
        acknowledgedBy: decodedToken.uid,
        acknowledgedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      res.json(createSuccessResponse({ message: 'Alert acknowledged successfully' }));
    } catch (error: any) {
      console.error('❌ [ACCOUNTING APPROVAL] Error acknowledging alert:', error);
      res.status(500).json(handleError(error, 'acknowledgeAccountingAlert'));
    }
  }
);

/**
 * Resolve an accounting approval alert
 */
export const resolveAccountingAlert = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      if (req.method !== 'POST') {
        res.status(405).json(createErrorResponse('Method not allowed', 'POST method required'));
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userOrgId = decodedToken.organizationId;

      if (!userOrgId) {
        res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
        return;
      }

      const { alertId, resolutionNotes } = req.body;
      if (!alertId) {
        res.status(400).json(createErrorResponse('Missing alertId', 'alertId is required'));
        return;
      }

      const alertRef = db.collection('accountingApprovalAlerts').doc(alertId);
      const alertDoc = await alertRef.get();

      if (!alertDoc.exists) {
        res.status(404).json(createErrorResponse('Alert not found', 'The specified alert does not exist'));
        return;
      }

      const alertData = alertDoc.data();
      if (alertData?.organizationId !== userOrgId) {
        res.status(403).json(createErrorResponse('Forbidden', 'Cannot access alert from different organization'));
        return;
      }

      await alertRef.update({
        status: 'RESOLVED',
        resolvedBy: decodedToken.uid,
        resolvedAt: Timestamp.now(),
        resolutionNotes: resolutionNotes || '',
        updatedAt: Timestamp.now()
      });

      res.json(createSuccessResponse({ message: 'Alert resolved successfully' }));
    } catch (error: any) {
      console.error('❌ [ACCOUNTING APPROVAL] Error resolving alert:', error);
      res.status(500).json(handleError(error, 'resolveAccountingAlert'));
    }
  }
);

/**
 * Helper function to send notification to accounting personnel
 */
async function sendAccountingNotification(
  alertId: string,
  alertData: any,
  organizationId: string
): Promise<void> {
  try {
    // Get accounting personnel
    const teamMembersRef = db.collection('teamMembers');
    const accountingQuery = teamMembersRef
      .where('organizationId', '==', organizationId)
      .where('role', 'in', ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN']);

    const accountingSnapshot = await accountingQuery.get();
    const accountingUserIds: string[] = [];
    const accountingEmails: string[] = [];

    accountingSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.userId) {
        accountingUserIds.push(data.userId);
      }
      if (data.email) {
        accountingEmails.push(data.email);
      }
    });

    // Create notifications for each accounting user
    const notificationsRef = db.collection('notifications');
    const batch = db.batch();
    const now = Timestamp.now();

    accountingUserIds.forEach(userId => {
      const notificationRef = notificationsRef.doc();
      batch.set(notificationRef, {
        userId,
        organizationId,
        category: 'TIMECARD_APPROVAL',
        title: `Accounting Approval Required: ${alertData.managerName || 'Manager'}`,
        message: alertData.message,
        priority: alertData.severity === 'urgent' ? 'urgent' : alertData.severity === 'high' ? 'high' : 'medium',
        read: false,
        timestamp: now.toDate().toISOString(),
        createdAt: now,
        updatedAt: now,
        sourceApp: 'timecard-management',
        metadata: {
          alertId,
          alertType: alertData.alertType,
          managerId: alertData.managerId,
          managerName: alertData.managerName,
          timecardApprovalFlows: alertData.timecardApprovalFlows || [],
          overtimeRequests: alertData.overtimeRequests || [],
          actionUrl: `/accounting-approvals?alertId=${alertId}`,
          requiresAccountingApproval: true
        }
      });
    });

    await batch.commit();
    console.log(`✅ [ACCOUNTING APPROVAL] Sent notifications to ${accountingUserIds.length} accounting personnel`);
  } catch (error) {
    console.error('❌ [ACCOUNTING APPROVAL] Error sending notifications:', error);
    // Don't throw - notification failure shouldn't block alert creation
  }
}

/**
 * Check manager approval threshold and create alert if needed
 * This can be called as a scheduled function or triggered by timecard approval
 */
export const checkManagerApprovalThreshold = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await auth.verifyIdToken(token);
      const userOrgId = decodedToken.organizationId;

      if (!userOrgId) {
        res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
        return;
      }

      // Support callable format (data wrapped in body.data) or direct body
      const requestData = req.body?.data || req.body || {};
      const { managerId, timePeriod } = requestData;
      if (!managerId) {
        res.status(400).json(createErrorResponse('Missing managerId', 'managerId is required'));
        return;
      }

      // Get manager's direct report configuration
      const directReportsRef = db.collection('userDirectReports');
      const managerQuery = directReportsRef
        .where('organizationId', '==', userOrgId)
        .where('managerId', '==', managerId)
        .where('isActive', '==', true)
        .limit(1);

      const managerDocs = await managerQuery.get();
      if (managerDocs.empty) {
        res.json(createSuccessResponse({ needsAlert: false, reason: 'No direct reports configured' }));
        return;
      }

      const managerConfig = managerDocs.docs[0].data();
      const maxApprovalHours = managerConfig.maxApprovalHours;
      const requiresEscalation = managerConfig.requiresEscalation;

      if (!maxApprovalHours || !requiresEscalation) {
        res.json(createSuccessResponse({ needsAlert: false, reason: 'No threshold configured' }));
        return;
      }

      // Calculate time period (default to current week)
      const now = new Date();
      const periodStart = timePeriod?.start 
        ? new Date(timePeriod.start)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const periodEnd = timePeriod?.end
        ? new Date(timePeriod.end)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7);

      // Get approved timecards by this manager in the period
      const timecardsRef = db.collection('timecard_entries');
      const timecardQuery = timecardsRef
        .where('organizationId', '==', userOrgId)
        .where('status', '==', 'approved')
        .where('approvedBy', '==', managerId);

      const timecardDocs = await timecardQuery.get();
      let totalHours = 0;
      const timecardIds: string[] = [];

      timecardDocs.docs.forEach(doc => {
        const data = doc.data();
        const approvedAt = data.approvedAt?.toDate?.() || 
                          (data.approvedAt instanceof Date ? data.approvedAt : new Date(data.approvedAt));
        
        if (approvedAt >= periodStart && approvedAt <= periodEnd) {
          timecardIds.push(doc.id);
          totalHours += data.totalHours || 0;
        }
      });

      if (totalHours <= maxApprovalHours) {
        res.json(createSuccessResponse({ 
          needsAlert: false, 
          currentHours: totalHours,
          threshold: maxApprovalHours
        }));
        return;
      }

      // Get manager info
      const teamMembersRef = db.collection('teamMembers');
      const managerDocQuery = teamMembersRef
        .where('organizationId', '==', userOrgId)
        .where('userId', '==', managerId)
        .limit(1);

      const managerInfoDocs = await managerDocQuery.get();
      const managerInfo = managerInfoDocs.empty 
        ? { displayName: 'Unknown Manager', name: 'Unknown Manager', email: 'unknown@example.com' }
        : managerInfoDocs.docs[0].data();

      // Create alert
      const alertData = {
        organizationId: userOrgId,
        alertType: 'TIMECARD_THRESHOLD',
        severity: calculateSeverity(totalHours, maxApprovalHours),
        managerId,
        managerName: managerInfo.displayName || managerInfo.name || 'Unknown Manager',
        managerEmail: managerInfo.email || 'unknown@example.com',
        maxApprovalHours,
        currentApprovedHours: totalHours,
        thresholdExceededBy: totalHours - maxApprovalHours,
        timePeriod: {
          start: Timestamp.fromDate(periodStart),
          end: Timestamp.fromDate(periodEnd)
        },
        timecardApprovalFlows: timecardIds,
        message: `Manager ${managerInfo.displayName || managerInfo.name} has approved ${totalHours.toFixed(2)} hours, exceeding their threshold of ${maxApprovalHours} hours by ${(totalHours - maxApprovalHours).toFixed(2)} hours.`,
        requiresImmediateAction: totalHours > maxApprovalHours * 1.5,
        status: 'PENDING',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      const alertRef = await db.collection('accountingApprovalAlerts').add(alertData);
      
      // Send notification
      await sendAccountingNotification(alertRef.id, alertData, userOrgId);

      res.json(createSuccessResponse({
        needsAlert: true,
        alertId: alertRef.id,
        currentHours: totalHours,
        threshold: maxApprovalHours,
        exceededBy: totalHours - maxApprovalHours
      }));
    } catch (error: any) {
      console.error('❌ [ACCOUNTING APPROVAL] Error checking threshold:', error);
      res.status(500).json(handleError(error, 'checkManagerApprovalThreshold'));
    }
  }
);

/**
 * Calculate alert severity based on threshold exceedance
 */
function calculateSeverity(currentHours: number, thresholdHours: number): 'low' | 'medium' | 'high' | 'urgent' {
  const exceedancePercent = ((currentHours - thresholdHours) / thresholdHours) * 100;
  
  if (exceedancePercent >= 100) return 'urgent';
  if (exceedancePercent >= 50) return 'high';
  if (exceedancePercent >= 25) return 'medium';
  return 'low';
}
