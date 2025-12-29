/**
 * 🔥 UNIFIED TIMECARD APPROVAL API FUNCTION
 * Handles all timecard approval operations through a single endpoint
 * Routes: /api/timecard-approval/*
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

export const timecardApprovalApi = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
  try {
    // Set CORS headers
    setCorsHeaders(req, res);
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(createErrorResponse('Unauthorized', 'Valid authentication token required'));
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      const { getAuth } = await import('firebase-admin/auth');
      decodedToken = await getAuth().verifyIdToken(token);
    } catch (error) {
      res.status(401).json(createErrorResponse('Invalid token', 'Authentication token is invalid'));
      return;
    }

    const { getAuth } = await import('firebase-admin/auth');
    const userRecord = await getAuth().getUser(decodedToken.uid);
    const userClaims = userRecord.customClaims || {};
    const userOrgId = userClaims.organizationId;

    if (!userOrgId) {
      res.status(400).json(createErrorResponse('Organization ID required', 'User must be associated with an organization'));
      return;
    }

    // Parse the URL path to determine the operation
    const path = req.path;
    const method = req.method;

    console.log(`⏰ [TIMECARD APPROVAL API] ${method} ${path} for user: ${decodedToken.uid} in org: ${userOrgId}`);

    // Handle different timecard approval operations based on path and method
    if (path === '/pending' && method === 'GET') {
      await handlePendingApprovals(req, res, userOrgId, decodedToken.uid);
    } else if (path === '/my-submissions' && method === 'GET') {
      await handleMySubmissions(req, res, userOrgId, decodedToken.uid);
    } else if (path === '/history' && method === 'GET') {
      await handleApprovalHistory(req, res, userOrgId, decodedToken.uid);
    } else if ((path === '/direct-reports' || path === '/direct-reports/all') && method === 'GET') {
      await handleDirectReports(req, res, userOrgId, decodedToken.uid);
    } else if (path === '/my-manager' && method === 'GET') {
      await handleMyManager(req, res, userOrgId, decodedToken.uid);
    } else if (path.startsWith('/') && path.endsWith('/submit') && method === 'POST') {
      // Extract timecard ID from path like "/{timecardId}/submit"
      const timecardId = path.slice(1, -7); // Remove leading "/" and trailing "/submit"
      await handleSubmitTimecard(req, res, userOrgId, decodedToken.uid, timecardId);
    } else {
      res.status(404).json(createErrorResponse('Not found', 'Timecard approval endpoint not found'));
      return;
    }

  } catch (error: any) {
    console.error('❌ [TIMECARD APPROVAL API] Error:', error);
    res.status(500).json(handleError(error, 'timecardApprovalApi'));
    return;
  }
});

// ============================================================================
// PENDING APPROVALS OPERATIONS
// ============================================================================

async function handlePendingApprovals(req: any, res: any, organizationId: string, userId: string) {
  try {
    const { projectId } = req.query;

    console.log(`⏰ [PENDING APPROVALS] Getting pending approvals for org: ${organizationId}`);

    // 🔧 FIX: Use timecard_entries collection instead of timecards
    let query = db.collection('timecard_entries')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'SUBMITTED');

    // Apply additional filters
    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }

    // Order by submittedAt if available, otherwise by createdAt
    try {
      query = query.orderBy('submittedAt', 'desc');
    } catch (error) {
      // Fallback to createdAt if submittedAt index doesn't exist
      console.warn('⚠️ [PENDING APPROVALS] submittedAt index not available, using createdAt');
      query = query.orderBy('createdAt', 'desc');
    }

    const timecardsSnapshot = await query.get();
    const timecards = timecardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`⏰ [PENDING APPROVALS] Found ${timecards.length} pending approvals`);

    res.status(200).json(createSuccessResponse({
      timecards,
      count: timecards.length,
      organizationId,
      filters: { projectId }
    }, 'Pending approvals retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [PENDING APPROVALS] Error:', error);
    res.status(500).json(handleError(error, 'handlePendingApprovals'));
  }
}

// ============================================================================
// MY SUBMISSIONS OPERATIONS
// ============================================================================

async function handleMySubmissions(req: any, res: any, organizationId: string, userId: string) {
  try {
    const { projectId, status, startDate, endDate } = req.query;

    console.log(`⏰ [MY SUBMISSIONS] Getting submissions for user: ${userId} in org: ${organizationId}`);

    let query = db.collection('timecards')
      .where('organizationId', '==', organizationId)
      .where('userId', '==', userId);

    // Apply additional filters
    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    if (startDate) {
      query = query.where('date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('date', '<=', endDate);
    }

    query = query.orderBy('date', 'desc');

    const timecardsSnapshot = await query.get();
    const timecards = timecardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`⏰ [MY SUBMISSIONS] Found ${timecards.length} submissions`);

    res.status(200).json(createSuccessResponse({
      timecards,
      count: timecards.length,
      organizationId,
      userId,
      filters: { projectId, status, startDate, endDate }
    }, 'My submissions retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [MY SUBMISSIONS] Error:', error);
    res.status(500).json(handleError(error, 'handleMySubmissions'));
  }
}

// ============================================================================
// APPROVAL HISTORY OPERATIONS
// ============================================================================

async function handleApprovalHistory(req: any, res: any, organizationId: string, userId: string) {
  try {
    const { projectId, status, startDate, endDate, page = 1, limit = 20, search } = req.query;

    console.log(`⏰ [APPROVAL HISTORY] Getting approval history for org: ${organizationId}`);

    let query = db.collection('timecards')
      .where('organizationId', '==', organizationId)
      .where('status', 'in', ['approved', 'rejected']);

    // Apply additional filters
    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    if (startDate) {
      query = query.where('date', '>=', startDate);
    }

    if (endDate) {
      query = query.where('date', '<=', endDate);
    }

    query = query.orderBy('approvedAt', 'desc');

    const timecardsSnapshot = await query.get();
    const allTimecards = timecardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];

    // Calculate summary statistics
    const total = allTimecards.length;
    const approved = allTimecards.filter((tc: any) => tc.status === 'approved').length;
    const rejected = allTimecards.filter((tc: any) => tc.status === 'rejected').length;
    const escalated = allTimecards.filter((tc: any) => tc.escalatedAt).length;
    const completed = approved + rejected;

    // Calculate average processing time
    let totalProcessingTime = 0;
    let processedCount = 0;

    allTimecards.forEach((timecard: any) => {
      if (timecard.submittedAt && (timecard.approvedAt || timecard.rejectedAt)) {
        const submitted = new Date(timecard.submittedAt);
        const completed = new Date(timecard.approvedAt || timecard.rejectedAt);
        const processingTime = completed.getTime() - submitted.getTime();
        totalProcessingTime += processingTime;
        processedCount++;
      }
    });

    const averageProcessingTime = processedCount > 0 ? totalProcessingTime / processedCount : 0;

    // Apply pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const approvalHistory = allTimecards.slice(startIndex, endIndex);

    console.log(`⏰ [APPROVAL HISTORY] Found ${total} approval history records, returning ${approvalHistory.length} for page ${pageNum}`);

    res.status(200).json(createSuccessResponse({
      approvalHistory,
      summary: {
        total,
        approved,
        rejected,
        escalated,
        completed,
        averageProcessingTime
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        totalPages: Math.ceil(total / limitNum)
      }
    }, 'Approval history retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [APPROVAL HISTORY] Error:', error);
    res.status(500).json(handleError(error, 'handleApprovalHistory'));
  }
}

// ============================================================================
// DIRECT REPORTS OPERATIONS
// ============================================================================

async function handleDirectReports(req: any, res: any, organizationId: string, userId: string) {
  try {
    console.log(`⏰ [DIRECT REPORTS] Getting direct reports for manager: ${userId} in org: ${organizationId}`);

    // Get team members who report to this manager
    const teamMembersQuery = await db.collection('teamMembers')
      .where('organizationId', '==', organizationId)
      .where('managerId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const directReports = [];
    
    for (const doc of teamMembersQuery.docs) {
      const teamMember = doc.data();
      
      // Get user details from users collection
      const userDoc = await db.collection('users').doc(teamMember.userId).get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData) {
          directReports.push({
            id: teamMember.userId,
            email: userData.email,
            displayName: userData.displayName || userData.name,
            role: teamMember.role,
            teamMemberRole: teamMember.teamMemberRole,
            isActive: teamMember.isActive,
            createdAt: teamMember.createdAt,
            managerId: teamMember.managerId
          });
        }
      }
    }

    console.log(`⏰ [DIRECT REPORTS] Found ${directReports.length} direct reports`);

    res.status(200).json(createSuccessResponse({
      directReports,
      count: directReports.length,
      organizationId,
      managerId: userId
    }, 'Direct reports retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [DIRECT REPORTS] Error:', error);
    res.status(500).json(handleError(error, 'handleDirectReports'));
  }
}

// ============================================================================
// MY MANAGER OPERATIONS
// ============================================================================

async function handleMyManager(req: any, res: any, organizationId: string, userId: string) {
  try {
    console.log(`⏰ [MY MANAGER] Getting manager info for user: ${userId} in org: ${organizationId}`);

    // Find team member record where this user is the employee
    const teamMemberQuery = await db.collection('teamMembers')
      .where('organizationId', '==', organizationId)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (teamMemberQuery.empty) {
      console.log(`⏰ [MY MANAGER] No active team member record found for user: ${userId}`);
      res.status(404).json(createErrorResponse(
        'No active direct report relationship found',
        'You do not have an active manager assigned for timecard approvals'
      ));
      return;
    }

    const teamMemberDoc = teamMemberQuery.docs[0];
    const teamMember = teamMemberDoc.data();
    const managerId = teamMember.managerId;

    if (!managerId) {
      console.log(`⏰ [MY MANAGER] No manager ID found for user: ${userId}`);
      res.status(404).json(createErrorResponse(
        'No manager assigned',
        'You do not have a manager assigned for timecard approvals'
      ));
      return;
    }

    // Get manager's user details
    const managerDoc = await db.collection('users').doc(managerId).get();
    
    if (!managerDoc.exists) {
      console.log(`⏰ [MY MANAGER] Manager user not found: ${managerId}`);
      res.status(404).json(createErrorResponse(
        'Manager not found',
        'Your assigned manager could not be found'
      ));
      return;
    }

    const managerData = managerDoc.data();
    
    // Build response matching the expected UserDirectReport type
    const directReportInfo = {
      id: teamMemberDoc.id,
      employeeId: userId,
      managerId: managerId,
      isActive: teamMember.isActive,
      canApproveTimecards: teamMember.canApproveTimecards !== false, // Default to true if not set
      effectiveDate: teamMember.createdAt || new Date().toISOString(),
      manager: {
        id: managerId,
        name: managerData?.displayName || managerData?.name || `${managerData?.firstName || ''} ${managerData?.lastName || ''}`.trim() || managerData?.email || '',
        firstName: managerData?.firstName,
        lastName: managerData?.lastName,
        email: managerData?.email || '',
        role: managerData?.role,
        department: managerData?.department
      },
      assigner: teamMember.createdBy ? {
        id: teamMember.createdBy,
        name: 'System',
        email: 'system@backbone.app'
      } : undefined
    };

    console.log(`⏰ [MY MANAGER] Found manager for user ${userId}: ${managerData?.email || 'unknown'}`);

    res.status(200).json(createSuccessResponse(
      directReportInfo,
      'Manager information retrieved successfully'
    ));

  } catch (error: any) {
    console.error('❌ [MY MANAGER] Error:', error);
    res.status(500).json(handleError(error, 'handleMyManager'));
  }
}

// ============================================================================
// SUBMIT TIMECARD OPERATIONS
// ============================================================================

/**
 * Calculate timecard totals using template rules
 */
async function calculateTimecardTotals(
  entryData: any,
  template: any | null
): Promise<{
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  mealPenalty: boolean;
  totalPay: number;
}> {
  // Use default rules if no template
  const config = template || {
    standardHoursPerDay: 8.0,
    overtimeThreshold: 8.0,
    doubleTimeThreshold: 12.0,
    hourlyRate: 0.0,
    overtimeMultiplier: 1.5,
    doubleTimeMultiplier: 2.0,
    mealBreakRequired: true,
    mealBreakThreshold: 6.0,
    mealPenaltyHours: 1.0,
  };

  const clockInTime = entryData.clockInTime?.toDate?.() || 
                     (entryData.timeIn?.toDate?.() || new Date(entryData.timeIn || entryData.clockInTime));
  const clockOutTime = entryData.clockOutTime?.toDate?.() || 
                      (entryData.timeOut?.toDate?.() || new Date(entryData.timeOut || entryData.clockOutTime));
  const mealBreakStart = entryData.mealBreakStart?.toDate?.() || 
                        (entryData.mealBreakStart ? new Date(entryData.mealBreakStart) : null);
  const mealBreakEnd = entryData.mealBreakEnd?.toDate?.() || 
                      (entryData.mealBreakEnd ? new Date(entryData.mealBreakEnd) : null);
  const hourlyRate = entryData.hourlyRate || config.hourlyRate || 0;

  if (!clockInTime || !clockOutTime) {
    return {
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      mealPenalty: false,
      totalPay: 0,
    };
  }

  // Calculate total work hours (subtract meal break if taken)
  let totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
  
  if (mealBreakStart && mealBreakEnd) {
    const mealBreakHours = (mealBreakEnd.getTime() - mealBreakStart.getTime()) / (1000 * 60 * 60);
    totalHours -= mealBreakHours;
  }

  // Calculate meal penalty
  const mealPenalty = config.mealBreakRequired &&
    totalHours >= config.mealBreakThreshold &&
    (!mealBreakStart || !mealBreakEnd);

  // Calculate overtime breakdown using template rules
  let regularHours = Math.min(totalHours, config.overtimeThreshold);
  let overtimeHours = 0;
  let doubleTimeHours = 0;

  if (totalHours > config.overtimeThreshold) {
    const overtimeAmount = totalHours - config.overtimeThreshold;

    if (totalHours > config.doubleTimeThreshold) {
      const doubleTimeAmount = totalHours - config.doubleTimeThreshold;
      doubleTimeHours = doubleTimeAmount;
      overtimeHours = overtimeAmount - doubleTimeAmount;
    } else {
      overtimeHours = overtimeAmount;
    }
  }

  // Calculate total pay
  let totalPay = regularHours * hourlyRate;
  totalPay += overtimeHours * hourlyRate * config.overtimeMultiplier;
  totalPay += doubleTimeHours * hourlyRate * config.doubleTimeMultiplier;

  // Add meal penalty
  if (mealPenalty) {
    totalPay += config.mealPenaltyHours * hourlyRate;
  }

  return {
    totalHours,
    regularHours,
    overtimeHours,
    doubleTimeHours,
    mealPenalty,
    totalPay,
  };
}

async function handleSubmitTimecard(req: any, res: any, organizationId: string, userId: string, timecardId: string) {
  try {
    console.log(`⏰ [SUBMIT TIMECARD] Submitting timecard ${timecardId} for user: ${userId} in org: ${organizationId}`);

    // Get the timecard entry
    const entryRef = db.collection('timecard_entries').doc(timecardId);
    const entryDoc = await entryRef.get();

    if (!entryDoc.exists) {
      res.status(404).json(createErrorResponse('Timecard not found', 'The specified timecard entry does not exist'));
      return;
    }

    const entryData = entryDoc.data();
    
    if (!entryData) {
      res.status(404).json(createErrorResponse('Timecard data not found', 'The timecard entry exists but contains no data'));
      return;
    }

    // Verify ownership
    if (entryData.userId !== userId || entryData.organizationId !== organizationId) {
      res.status(403).json(createErrorResponse('Access denied', 'You do not have permission to submit this timecard'));
      return;
    }

    // Check if already submitted
    if (entryData.status === 'SUBMITTED' || entryData.status === 'APPROVED' || entryData.status === 'REJECTED') {
      res.status(400).json(createErrorResponse('Invalid status', `Timecard is already ${entryData.status}`));
      return;
    }

    // Get user's timecard template/assignment
    let template = null;
    try {
      const assignmentsQuery = await db.collection('timecardAssignments')
        .where('userId', '==', userId)
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .limit(1)
        .get();

      if (!assignmentsQuery.empty) {
        const assignment = assignmentsQuery.docs[0].data();
        if (assignment.templateId) {
          const templateDoc = await db.collection('timecardTemplates').doc(assignment.templateId).get();
          if (templateDoc.exists) {
            template = templateDoc.data();
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ [SUBMIT TIMECARD] Could not fetch template, using defaults:', error);
    }

    // Calculate totals using template rules
    const calculations = await calculateTimecardTotals(entryData, template);

    // Update entry with calculated values and SUBMITTED status
    await entryRef.update({
      status: 'SUBMITTED',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      totalHours: calculations.totalHours,
      regularHours: calculations.regularHours,
      overtimeHours: calculations.overtimeHours,
      doubleTimeHours: calculations.doubleTimeHours,
      mealPenalty: calculations.mealPenalty,
      totalPay: calculations.totalPay,
      hourlyRate: entryData.hourlyRate || template?.hourlyRate || 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const updatedDoc = await entryRef.get();
    const updatedData: any = { id: updatedDoc.id, ...updatedDoc.data() };

    console.log(`✅ [SUBMIT TIMECARD] Timecard ${timecardId} submitted successfully with calculations:`, {
      totalHours: calculations.totalHours,
      regularHours: calculations.regularHours,
      overtimeHours: calculations.overtimeHours,
      doubleTimeHours: calculations.doubleTimeHours,
      mealPenalty: calculations.mealPenalty,
      totalPay: calculations.totalPay
    });

    res.status(200).json(createSuccessResponse({
      id: updatedData.id,
      status: updatedData.status,
      submittedAt: updatedData.submittedAt?.toDate?.()?.toISOString() || updatedData.submittedAt,
      totalHours: updatedData.totalHours,
      regularHours: updatedData.regularHours,
      overtimeHours: updatedData.overtimeHours,
      doubleTimeHours: updatedData.doubleTimeHours,
      mealPenalty: updatedData.mealPenalty,
      totalPay: updatedData.totalPay
    }, 'Timecard submitted for approval successfully'));

  } catch (error: any) {
    console.error('❌ [SUBMIT TIMECARD] Error:', error);
    res.status(500).json(handleError(error, 'handleSubmitTimecard'));
  }
}
