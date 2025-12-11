/**
 * Generate Timecard Report Function
 * 
 * Generates timecard reports (PDF, CSV, Excel) based on filters
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  department?: string;
  targetUserId?: string;
  reportType: 'summary' | 'detailed' | 'compliance' | 'payroll';
  format?: 'json' | 'csv' | 'pdf';
}

// Firebase Callable function
export const generateTimecardReport = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 120,
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

      if (!filters || !filters.reportType) {
        throw new HttpsError('invalid-argument', 'Report type is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
      
      if (!hasAccess && !isAdmin) {
        console.warn(`🚨 [GENERATE TIMECARD REPORT] Security violation: User ${userId} attempted to generate report for org ${organizationId} without access`);
        throw new HttpsError('permission-denied', 'You do not have access to this organization');
      }

      const filterData: ReportFilters = filters;
      const { startDate, endDate, department, targetUserId, reportType, format = 'json' } = filterData;

      console.log(`⏰ [GENERATE TIMECARD REPORT] Generating ${reportType} report for org: ${organizationId}`, { filters: filterData });

      // Build query for timecards (similar to analytics)
      let timecardsQuery = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      if (startDate) {
        timecardsQuery = timecardsQuery.where('date', '>=', new Date(startDate));
      }
      if (endDate) {
        timecardsQuery = timecardsQuery.where('date', '<=', new Date(endDate));
      }
      if (targetUserId && (isAdmin || hasAccess)) {
        timecardsQuery = timecardsQuery.where('userId', '==', targetUserId);
      } else if (!isAdmin && !hasAccess) {
        timecardsQuery = timecardsQuery.where('userId', '==', userId);
      }

      const timecardsSnapshot = await timecardsQuery.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Generate report based on type
      let reportData: any = {};

      switch (reportType) {
        case 'summary':
          reportData = {
            reportType: 'summary',
            generatedAt: new Date().toISOString(),
            dateRange: { start: startDate, end: endDate },
            summary: {
              totalTimecards: timecards.length,
              totalHours: timecards.reduce((sum: number, tc: any) => sum + (tc.totalHours || 0), 0),
              totalPay: timecards.reduce((sum: number, tc: any) => sum + (tc.totalPay || 0), 0),
              approved: timecards.filter((tc: any) => tc.status === 'APPROVED').length,
              pending: timecards.filter((tc: any) => tc.status === 'PENDING').length,
              rejected: timecards.filter((tc: any) => tc.status === 'REJECTED').length
            },
            timecards: format === 'json' ? timecards : undefined
          };
          break;

        case 'detailed':
          reportData = {
            reportType: 'detailed',
            generatedAt: new Date().toISOString(),
            dateRange: { start: startDate, end: endDate },
            timecards: timecards.map((tc: any) => ({
              id: tc.id,
              userId: tc.userId,
              date: tc.date,
              totalHours: tc.totalHours,
              regularHours: tc.regularHours,
              overtimeHours: tc.overtimeHours,
              totalPay: tc.totalPay,
              status: tc.status,
              mealPenalty: tc.mealPenalty,
              turnaroundViolation: tc.turnaroundViolation
            }))
          };
          break;

        case 'compliance':
          const complianceIssues = timecards.filter((tc: any) => 
            tc.mealPenalty || tc.turnaroundViolation
          );
          reportData = {
            reportType: 'compliance',
            generatedAt: new Date().toISOString(),
            dateRange: { start: startDate, end: endDate },
            complianceIssues: complianceIssues.length,
            issues: complianceIssues.map((tc: any) => ({
              id: tc.id,
              userId: tc.userId,
              date: tc.date,
              mealPenalty: tc.mealPenalty,
              turnaroundViolation: tc.turnaroundViolation
            }))
          };
          break;

        case 'payroll':
          const payrollData = timecards.reduce((acc: any, tc: any) => {
            const uid = tc.userId || 'unknown';
            if (!acc[uid]) {
              acc[uid] = {
                userId: uid,
                totalHours: 0,
                regularHours: 0,
                overtimeHours: 0,
                totalPay: 0,
                timecardCount: 0
              };
            }
            acc[uid].totalHours += tc.totalHours || 0;
            acc[uid].regularHours += tc.regularHours || 0;
            acc[uid].overtimeHours += tc.overtimeHours || 0;
            acc[uid].totalPay += tc.totalPay || 0;
            acc[uid].timecardCount += 1;
            return acc;
          }, {});
          reportData = {
            reportType: 'payroll',
            generatedAt: new Date().toISOString(),
            dateRange: { start: startDate, end: endDate },
            payroll: Object.values(payrollData)
          };
          break;

        default:
          throw new HttpsError('invalid-argument', `Unknown report type: ${reportType}`);
      }

      console.log(`⏰ [GENERATE TIMECARD REPORT] Report generated: ${reportType}`, {
        timecards: timecards.length,
        format
      });

      return createSuccessResponse({
        report: reportData,
        format,
        downloadUrl: null // TODO: Implement file storage for PDF/CSV exports
      }, 'Timecard report generated successfully');

    } catch (error: any) {
      console.error('❌ [GENERATE TIMECARD REPORT] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to generate timecard report',
        error.stack || error.toString()
      );
    }
  }
);

// HTTP function
export const generateTimecardReportHttp = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 120,
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

      const { organizationId, reportType, startDate, endDate, format = 'json' } = req.body;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      if (!reportType) {
        res.status(400).json(createErrorResponse('Report type is required'));
        return;
      }

      console.log(`⏰ [GENERATE TIMECARD REPORT HTTP] Generating ${reportType} report for org: ${organizationId}`);

      // Similar logic to callable version (simplified for HTTP)
      let timecardsQuery = db.collection('timecards')
        .where('organizationId', '==', organizationId);

      if (startDate) {
        timecardsQuery = timecardsQuery.where('date', '>=', new Date(startDate));
      }
      if (endDate) {
        timecardsQuery = timecardsQuery.where('date', '<=', new Date(endDate));
      }

      const timecardsSnapshot = await timecardsQuery.get();
      const timecards = timecardsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Generate summary report (simplified for HTTP)
      const reportData = {
        reportType,
        generatedAt: new Date().toISOString(),
        dateRange: { start: startDate, end: endDate },
        summary: {
          totalTimecards: timecards.length,
          totalHours: timecards.reduce((sum: number, tc: any) => sum + (tc.totalHours || 0), 0),
          totalPay: timecards.reduce((sum: number, tc: any) => sum + (tc.totalPay || 0), 0)
        }
      };

      res.status(200).json(createSuccessResponse({
        report: reportData,
        format
      }, 'Timecard report generated successfully'));

    } catch (error: any) {
      console.error('❌ [GENERATE TIMECARD REPORT HTTP] Error:', error);
      res.status(500).json(handleError(error, 'generateTimecardReportHttp'));
    }
  }
);
