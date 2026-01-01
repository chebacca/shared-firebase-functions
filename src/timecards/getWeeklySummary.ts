/**
 * Get Weekly Summary Function
 * 
 * Retrieves weekly timecard summary for a user
 * Callable version only - HTTP version removed to reduce CPU quota
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const getWeeklySummary = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { userId: providedUserId, weekStart, organizationId: providedOrgId } = request.data;
      const authUserId = request.auth?.uid;

      if (!authUserId) {
        throw new Error('Authentication required');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(authUserId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Use provided userId or auth userId
      const userId = providedUserId || authUserId;
      const organizationId = providedOrgId || userOrgId;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Verify user has access (can only view own summary unless admin)
      if (providedUserId && providedUserId !== authUserId) {
        // Check if user is admin or manager
        const userClaims = userRecord.customClaims || {};
        const isAdmin = userClaims.role === 'admin' || userClaims.role === 'owner';
        if (!isAdmin) {
          throw new Error('Access denied: Cannot view other user\'s weekly summary');
        }
      }

      // Calculate week start date (Monday of the week)
      let weekStartDate: Date;
      if (weekStart) {
        weekStartDate = new Date(weekStart);
      } else {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
        weekStartDate = new Date(today.setDate(diff));
        weekStartDate.setHours(0, 0, 0, 0);
      }

      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);
      weekEndDate.setHours(23, 59, 59, 999);

      console.log(`⏰ [GET WEEKLY SUMMARY] Getting summary for user: ${userId}, week: ${weekStartDate.toISOString()} to ${weekEndDate.toISOString()}`);

      // Get timecard entries for the week
      const entriesQuery = await db.collection('timecard_entries')
        .where('organizationId', '==', organizationId)
        .where('userId', '==', userId)
        .where('date', '>=', weekStartDate)
        .where('date', '<=', weekEndDate)
        .get();

      const entries = entriesQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate summary
      let totalHours = 0;
      let regularHours = 0;
      let overtimeHours = 0;
      let doubleTimeHours = 0;
      let totalPay = 0;
      let submittedCount = 0;
      let approvedCount = 0;
      let rejectedCount = 0;

      entries.forEach((entry: any) => {
        totalHours += entry.totalHours || 0;
        regularHours += entry.regularHours || 0;
        overtimeHours += entry.overtimeHours || 0;
        doubleTimeHours += entry.doubleTimeHours || 0;
        totalPay += entry.totalPay || 0;

        if (entry.status === 'SUBMITTED') submittedCount++;
        if (entry.status === 'APPROVED') approvedCount++;
        if (entry.status === 'REJECTED') rejectedCount++;
      });

      const summary = {
        weekStart: weekStartDate.toISOString(),
        weekEnd: weekEndDate.toISOString(),
        userId,
        organizationId,
        totalEntries: entries.length,
        totalHours,
        regularHours,
        overtimeHours,
        doubleTimeHours,
        totalPay,
        submittedCount,
        approvedCount,
        rejectedCount,
        pendingCount: entries.length - submittedCount - approvedCount - rejectedCount,
        entries: entries.map((e: any) => ({
          id: e.id,
          date: e.date,
          status: e.status,
          totalHours: e.totalHours,
          totalPay: e.totalPay
        }))
      };

      console.log(`✅ [GET WEEKLY SUMMARY] Summary calculated: ${totalHours} hours, ${totalPay} pay`);

      return createSuccessResponse(summary, 'Weekly summary retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET WEEKLY SUMMARY] Error:', error);
      return handleError(error, 'getWeeklySummary');
    }
  }
);

