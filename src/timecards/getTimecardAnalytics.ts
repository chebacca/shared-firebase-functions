/**
 * Get Timecard Analytics Function
 * 
 * Retrieves comprehensive timecard analytics for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  department?: string;
  targetUserId?: string;
  includeUserPerformance?: boolean;
}

// Firebase Callable function
export const getTimecardAnalytics = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { organizationId, filters } = request.data;
      const userId = request.auth.uid;
      const token = request.auth.token;

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
      
      if (!hasAccess && !isAdmin) {
        console.warn(`🚨 [GET TIMECARD ANALYTICS] Security violation: User ${userId} attempted to access analytics for org ${organizationId} without access`);
        throw new HttpsError('permission-denied', 'You do not have access to this organization');
      }

      const filterData: AnalyticsFilters = filters || {};
      const { startDate, endDate, department, targetUserId, includeUserPerformance } = filterData;

      console.log(`⏰ [GET TIMECARD ANALYTICS] Getting analytics for org: ${organizationId}`, { filters: filterData });

      // Build query for timecards
      let timecardsQuery = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      // Apply date filters if provided
      if (startDate) {
        const start = new Date(startDate);
        timecardsQuery = timecardsQuery.where('date', '>=', start);
      }
      if (endDate) {
        const end = new Date(endDate);
        timecardsQuery = timecardsQuery.where('date', '<=', end);
      }

      // Apply user filter if provided and user has permission
      if (targetUserId && (isAdmin || hasAccess)) {
        timecardsQuery = timecardsQuery.where('userId', '==', targetUserId);
      } else if (!isAdmin && !hasAccess) {
        // Regular users can only see their own data
        timecardsQuery = timecardsQuery.where('userId', '==', userId);
      }

      const timecardsSnapshot = await timecardsQuery.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate analytics
      const totalTimecards = timecards.length;
      const totalHours = timecards.reduce((sum, tc: any) => sum + (tc.totalHours || 0), 0);
      const totalPay = timecards.reduce((sum, tc: any) => sum + (tc.totalPay || 0), 0);
      const approvedTimecards = timecards.filter((tc: any) => tc.status === 'APPROVED').length;
      const pendingTimecards = timecards.filter((tc: any) => tc.status === 'PENDING').length;
      const rejectedTimecards = timecards.filter((tc: any) => tc.status === 'REJECTED').length;

      // Calculate average hours per day
      const dateRange = startDate && endDate 
        ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
        : 30; // Default to 30 days if no range provided
      const averageHoursPerDay = dateRange > 0 ? totalHours / dateRange : 0;

      // Calculate compliance rate (timecards without penalties or violations)
      const compliantTimecards = timecards.filter((tc: any) => 
        !tc.mealPenalty && !tc.turnaroundViolation
      ).length;
      const complianceRate = totalTimecards > 0 
        ? (compliantTimecards / totalTimecards) * 100 
        : 0;

      // User performance data (if requested)
      let userPerformance: any = null;
      if (includeUserPerformance) {
        const userHoursMap = new Map<string, number>();
        const userPayMap = new Map<string, number>();
        
        timecards.forEach((tc: any) => {
          const uid = tc.userId || 'unknown';
          userHoursMap.set(uid, (userHoursMap.get(uid) || 0) + (tc.totalHours || 0));
          userPayMap.set(uid, (userPayMap.get(uid) || 0) + (tc.totalPay || 0));
        });

        userPerformance = Array.from(userHoursMap.entries()).map(([uid, hours]) => ({
          userId: uid,
          totalHours: hours,
          totalPay: userPayMap.get(uid) || 0,
          timecardCount: timecards.filter((tc: any) => tc.userId === uid).length
        })).sort((a, b) => b.totalHours - a.totalHours);
      }

      // Department breakdown (if department filter not applied)
      const hoursByDepartment: Record<string, number> = {};
      if (!department) {
        timecards.forEach((tc: any) => {
          const dept = tc.department || 'Unknown';
          hoursByDepartment[dept] = (hoursByDepartment[dept] || 0) + (tc.totalHours || 0);
        });
      }

      const analytics = {
        totalTimecards,
        totalHours,
        totalPay,
        averageHoursPerDay,
        complianceRate,
        pendingApprovals: pendingTimecards,
        approvedTimecards,
        rejectedTimecards,
        hoursByDepartment,
        userPerformance: includeUserPerformance ? userPerformance : undefined,
        dateRange: {
          start: startDate || null,
          end: endDate || null
        }
      };

      console.log(`⏰ [GET TIMECARD ANALYTICS] Analytics calculated:`, {
        totalTimecards,
        totalHours,
        complianceRate: `${complianceRate.toFixed(2)}%`
      });

      return createSuccessResponse(analytics, 'Timecard analytics retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD ANALYTICS] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to get timecard analytics',
        error.stack || error.toString()
      );
    }
  }
);

// HTTP function
export const getTimecardAnalyticsHttp = onRequest(
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

      const { organizationId, startDate, endDate, department, targetUserId, includeUserPerformance } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET TIMECARD ANALYTICS HTTP] Getting analytics for org: ${organizationId}`);

      // Build query (similar to callable version but without auth context)
      let timecardsQuery = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      if (startDate) {
        timecardsQuery = timecardsQuery.where('date', '>=', new Date(startDate as string));
      }
      if (endDate) {
        timecardsQuery = timecardsQuery.where('date', '<=', new Date(endDate as string));
      }
      if (targetUserId) {
        timecardsQuery = timecardsQuery.where('userId', '==', targetUserId);
      }

      const timecardsSnapshot = await timecardsQuery.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate analytics (same logic as callable version)
      const totalTimecards = timecards.length;
      const totalHours = timecards.reduce((sum: number, tc: any) => sum + (tc.totalHours || 0), 0);
      const totalPay = timecards.reduce((sum: number, tc: any) => sum + (tc.totalPay || 0), 0);
      const approvedTimecards = timecards.filter((tc: any) => tc.status === 'APPROVED').length;
      const pendingTimecards = timecards.filter((tc: any) => tc.status === 'PENDING').length;
      const rejectedTimecards = timecards.filter((tc: any) => tc.status === 'REJECTED').length;

      const dateRange = startDate && endDate 
        ? Math.ceil((new Date(endDate as string).getTime() - new Date(startDate as string).getTime()) / (1000 * 60 * 60 * 24))
        : 30;
      const averageHoursPerDay = dateRange > 0 ? totalHours / dateRange : 0;

      const compliantTimecards = timecards.filter((tc: any) => 
        !tc.mealPenalty && !tc.turnaroundViolation
      ).length;
      const complianceRate = totalTimecards > 0 
        ? (compliantTimecards / totalTimecards) * 100 
        : 0;

      const analytics = {
        totalTimecards,
        totalHours,
        totalPay,
        averageHoursPerDay,
        complianceRate,
        pendingApprovals: pendingTimecards,
        approvedTimecards,
        rejectedTimecards
      };

      res.status(200).json(createSuccessResponse(analytics, 'Timecard analytics retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET TIMECARD ANALYTICS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getTimecardAnalyticsHttp'));
    }
  }
);
