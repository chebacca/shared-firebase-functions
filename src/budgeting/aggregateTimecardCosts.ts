/**
 * Aggregate Timecard Costs Function
 * 
 * Aggregates all approved timecards for a budget period
 * and creates summary line items
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

interface AggregationOptions {
  budgetId?: string;
  projectId?: string;
  organizationId: string;
  startDate?: string;
  endDate?: string;
  groupBy?: 'department' | 'role' | 'phase' | 'user';
}

/**
 * Aggregate timecard costs for a budget period
 */
export const aggregateTimecardCosts = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const options: AggregationOptions = request.data;

      if (!options.organizationId) {
        throw new Error('Organization ID is required');
      }

      const aggregation = await performAggregation(options);

      return createSuccessResponse(aggregation, 'Timecard costs aggregated successfully');

    } catch (error: any) {
      console.error('❌ [AGGREGATE TIMECARD COSTS] Error:', error);
      return handleError(error, 'aggregateTimecardCosts');
    }
  }
);

/**
 * Aggregate timecard costs (HTTP function)
 */
export const aggregateTimecardCostsHttp = onRequest(
  {
    memory: '512MiB',
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

      const options: AggregationOptions = req.body || req.query;

      if (!options.organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      const aggregation = await performAggregation(options);

      res.status(200).json(createSuccessResponse(aggregation, 'Timecard costs aggregated successfully'));

    } catch (error: any) {
      console.error('❌ [AGGREGATE TIMECARD COSTS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'aggregateTimecardCostsHttp'));
    }
  }
);

/**
 * Perform the aggregation
 */
async function performAggregation(options: AggregationOptions) {
  // Build query
  let query = db.collection('timecards')
    .where('organizationId', '==', options.organizationId)
    .where('status', '==', 'approved');

  if (options.projectId) {
    query = query.where('projectId', '==', options.projectId);
  }

  if (options.startDate) {
    query = query.where('weekStartDate', '>=', options.startDate);
  }

  if (options.endDate) {
    query = query.where('weekStartDate', '<=', options.endDate);
  }

  const timecardsSnapshot = await query.get();

  // Group timecards
  const grouped: Record<string, {
    timecards: any[];
    totalHours: number;
    totalRegularHours: number;
    totalOvertimeHours: number;
    totalDoubleTimeHours: number;
    totalPay: number;
    userCount: number;
  }> = {};

  for (const doc of timecardsSnapshot.docs) {
    const timecardData = doc.data();
    const timecard: any = { id: doc.id, ...timecardData };
    const stats = timecard.stats || {};
    const totalPay = timecard.totalPay || stats.totalPay || 0;
    const totalHours = timecard.totalHours || stats.totalHours || 0;

    // Determine group key
    let groupKey = 'all';
    if (options.groupBy === 'department') {
      groupKey = timecard.department || 'unknown';
    } else if (options.groupBy === 'role') {
      groupKey = timecard.role || 'unknown';
    } else if (options.groupBy === 'user') {
      groupKey = timecard.userId || 'unknown';
    } else if (options.groupBy === 'phase') {
      // Determine phase from date
      groupKey = determinePhase(timecard.weekStartDate || new Date());
    }

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        timecards: [],
        totalHours: 0,
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        totalDoubleTimeHours: 0,
        totalPay: 0,
        userCount: 0
      };
    }

    grouped[groupKey].timecards.push(timecard);
    grouped[groupKey].totalHours += totalHours;
    grouped[groupKey].totalRegularHours += stats.totalRegularHours || 0;
    grouped[groupKey].totalOvertimeHours += stats.totalOvertimeHours || 0;
    grouped[groupKey].totalDoubleTimeHours += stats.totalDoubleTimeHours || 0;
    grouped[groupKey].totalPay += totalPay;

    // Count unique users
    if (!grouped[groupKey].timecards.some(tc => tc.userId === timecard.userId)) {
      grouped[groupKey].userCount++;
    }
  }

  // Convert to array format
  const summary = Object.entries(grouped).map(([key, data]) => ({
    group: key,
    ...data,
    averagePayPerUser: data.userCount > 0 ? data.totalPay / data.userCount : 0,
    averageHoursPerUser: data.userCount > 0 ? data.totalHours / data.userCount : 0
  }));

  // Calculate totals
  const totals = {
    totalTimecards: timecardsSnapshot.size,
    totalHours: summary.reduce((sum, s) => sum + s.totalHours, 0),
    totalRegularHours: summary.reduce((sum, s) => sum + s.totalRegularHours, 0),
    totalOvertimeHours: summary.reduce((sum, s) => sum + s.totalOvertimeHours, 0),
    totalDoubleTimeHours: summary.reduce((sum, s) => sum + s.totalDoubleTimeHours, 0),
    totalPay: summary.reduce((sum, s) => sum + s.totalPay, 0),
    uniqueUsers: new Set(timecardsSnapshot.docs.map(doc => doc.data().userId)).size
  };

  return {
    summary,
    totals,
    options,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Determine phase from date
 */
function determinePhase(date: string | Date): 'pre_production' | 'production' | 'post_production' {
  // Default to production
  // In a real system, this would check project dates
  return 'production';
}

