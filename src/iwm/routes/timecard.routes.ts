/**
 * Timecard Routes
 * 
 * Express routes for timecard operations
 */

import { Router } from 'express';
import { authenticateToken } from '../../shared/middleware';
import { db, createSuccessResponse, createErrorResponse } from '../../shared/utils';
import { FieldValue } from 'firebase-admin/firestore';

const router = Router();

// Get timecards
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { organizationId, startDate, endDate, status, userId } = req.query;
    const userOrgId = req.user?.organizationId;

    if (!organizationId && !userOrgId) {
      return res.status(400).json(createErrorResponse('Organization ID is required'));
    }

    const orgId = (organizationId as string) || userOrgId!;
    let query = db.collection('timecards')
      .where('organizationId', '==', orgId);

    if (startDate) {
      query = query.where('date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('date', '<=', endDate);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    const timecardsSnapshot = await query.orderBy('date', 'desc').get();
    const timecards = timecardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json(createSuccessResponse(timecards));
  } catch (error: any) {
    console.error('Error getting timecards:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to get timecards'));
  }
});

// Get timecard by ID
router.get('/:timecardId', authenticateToken, async (req, res) => {
  try {
    const timecardId = Array.isArray(req.params.timecardId) ? req.params.timecardId[0] : req.params.timecardId;
    const userOrgId = req.user?.organizationId;

    const timecardDoc = await db.collection('timecards').doc(timecardId).get();

    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== userOrgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    res.json(createSuccessResponse({
      id: timecardDoc.id,
      ...timecardData
    }));
  } catch (error: any) {
    console.error('Error getting timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to get timecard'));
  }
});

// Create timecard
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { date, hours, description, organizationId } = req.body;
    const userId = req.user?.uid;
    const userOrgId = req.user?.organizationId;

    if (!date || !hours || !description) {
      return res.status(400).json(createErrorResponse('Date, hours, and description are required'));
    }

    const orgId = organizationId || userOrgId!;

    const timecardData = {
      userId,
      organizationId: orgId,
      date,
      hours: parseFloat(hours),
      description,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const timecardRef = await db.collection('timecards').add(timecardData);

    res.json(createSuccessResponse({
      id: timecardRef.id,
      ...timecardData
    }));
  } catch (error: any) {
    console.error('Error creating timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to create timecard'));
  }
});

// Update timecard
router.put('/:timecardId', authenticateToken, async (req, res) => {
  try {
    const timecardId = Array.isArray(req.params.timecardId) ? req.params.timecardId[0] : req.params.timecardId;
    const { date, hours, description } = req.body;
    const userOrgId = req.user?.organizationId;

    const timecardRef = db.collection('timecards').doc(timecardId);
    const timecardDoc = await timecardRef.get();

    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== userOrgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    if (timecardData?.status === 'approved') {
      return res.status(400).json(createErrorResponse('Cannot update approved timecard'));
    }

    await timecardRef.update({
      date: date || timecardData?.date,
      hours: hours !== undefined ? parseFloat(hours) : timecardData?.hours,
      description: description || timecardData?.description,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedDoc = await timecardRef.get();
    res.json(createSuccessResponse({
      id: updatedDoc.id,
      ...updatedDoc.data()
    }));
  } catch (error: any) {
    console.error('Error updating timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to update timecard'));
  }
});

// Delete timecard
router.delete('/:timecardId', authenticateToken, async (req, res) => {
  try {
    const timecardId = Array.isArray(req.params.timecardId) ? req.params.timecardId[0] : req.params.timecardId;
    const userOrgId = req.user?.organizationId;

    const timecardDoc = await db.collection('timecards').doc(timecardId).get();

    if (!timecardDoc.exists) {
      return res.status(404).json(createErrorResponse('Timecard not found'));
    }

    const timecardData = timecardDoc.data();
    if (timecardData?.organizationId !== userOrgId) {
      return res.status(403).json(createErrorResponse('Access denied'));
    }

    await db.collection('timecards').doc(timecardId).delete();

    res.json(createSuccessResponse({ message: 'Timecard deleted successfully' }));
  } catch (error: any) {
    console.error('Error deleting timecard:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to delete timecard'));
  }
});

export default router;
