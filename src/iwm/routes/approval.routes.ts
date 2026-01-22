/**
 * Approval Routes
 * 
 * Express routes for timecard approval operations
 */

import { Router } from 'express';
import { authenticateToken } from '../../shared/middleware';
import { db, createSuccessResponse, createErrorResponse } from '../../shared/utils';
import { FieldValue } from 'firebase-admin/firestore';

const router = Router();

// Approve timecard
router.post('/approve', authenticateToken, async (req, res) => {
  try {
    const { timecardId, organizationId } = req.body;
    const approverId = req.user?.uid;
    const userOrgId = req.user?.organizationId;

    if (!timecardId) {
      return res.status(400).json(createErrorResponse('Timecard ID is required'));
    }

    const orgId = organizationId || userOrgId!;

    const timecardRef = db.collection('timecards').doc(timecardId);
    const timecardDoc = await timecardRef.get();

    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== orgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    await timecardRef.update({
      status: 'approved',
      approvedBy: approverId,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Create approval record
    await db.collection('timecardApprovals').add({
      timecardId,
      organizationId: orgId,
      approverId,
      action: 'approved',
      createdAt: FieldValue.serverTimestamp()
    });

    res.json(createSuccessResponse({
      timecardId,
      status: 'approved'
    }));
  } catch (error: any) {
    console.error('Error approving timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to approve timecard'));
  }
});

// Reject timecard
router.post('/reject', authenticateToken, async (req, res) => {
  try {
    const { timecardId, organizationId, reason } = req.body;
    const rejectorId = req.user?.uid;
    const userOrgId = req.user?.organizationId;

    if (!timecardId) {
      return res.status(400).json(createErrorResponse('Timecard ID is required'));
    }

    const orgId = organizationId || userOrgId!;

    const timecardRef = db.collection('timecards').doc(timecardId);
    const timecardDoc = await timecardRef.get();

    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== orgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    await timecardRef.update({
      status: 'rejected',
      rejectedBy: rejectorId,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason,
      updatedAt: FieldValue.serverTimestamp()
    });

    await db.collection('timecardApprovals').add({
      timecardId,
      organizationId: orgId,
      approverId: rejectorId,
      action: 'rejected',
      reason,
      createdAt: FieldValue.serverTimestamp()
    });

    res.json(createSuccessResponse({
      timecardId,
      status: 'rejected'
    }));
  } catch (error: any) {
    console.error('Error rejecting timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to reject timecard'));
  }
});

// Get approval history
router.get('/history/:timecardId', authenticateToken, async (req, res) => {
  try {
    const timecardId = Array.isArray(req.params.timecardId) ? req.params.timecardId[0] : req.params.timecardId;
    const userOrgId = req.user?.organizationId;

    // Verify timecard exists and user has access
    const timecardDoc = await db.collection('timecards').doc(timecardId).get();
    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== userOrgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    const historyQuery = await db.collection('timecardApprovals')
      .where('timecardId', '==', timecardId)
      .orderBy('createdAt', 'desc')
      .get();

    const history = historyQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(createSuccessResponse({
      history,
      count: history.length
    }));
  } catch (error: any) {
    console.error('Error getting approval history:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to get approval history'));
  }
});

export default router;
