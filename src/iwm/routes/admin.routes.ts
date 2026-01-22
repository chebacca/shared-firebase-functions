/**
 * Admin Routes
 * 
 * Express routes for admin operations
 */

import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../../shared/middleware';
import { db, createSuccessResponse, createErrorResponse } from '../../shared/utils';

const router = Router();

// Get timecard analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.query;
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

    const timecardsSnapshot = await query.get();
    const timecards = timecardsSnapshot.docs.map(doc => doc.data());

    // Calculate analytics
    const totalHours = timecards.reduce((sum: number, tc: any) => sum + (tc.hours || 0), 0);
    const approvedCount = timecards.filter((tc: any) => tc.status === 'approved').length;
    const pendingCount = timecards.filter((tc: any) => tc.status === 'pending').length;
    const rejectedCount = timecards.filter((tc: any) => tc.status === 'rejected').length;

    res.json(createSuccessResponse({
      totalTimecards: timecards.length,
      totalHours,
      approvedCount,
      pendingCount,
      rejectedCount,
      organizationId: orgId
    }));
  } catch (error: any) {
    console.error('Error getting analytics:', error);
    res.status(500).json(createErrorResponse(error.message || 'Failed to get analytics'));
  }
});

export default router;
