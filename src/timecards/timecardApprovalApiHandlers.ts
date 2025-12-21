/**
 * Timecard Approval API Handlers
 * 
 * Exported handler functions for use in Express routes
 */

import { db, createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

// ============================================================================
// PENDING APPROVALS OPERATIONS
// ============================================================================

export async function handlePendingApprovals(req: any, res: any, organizationId: string, userId: string) {
  try {
    const { projectId } = req.query;

    console.log(`⏰ [PENDING APPROVALS] Getting pending approvals for org: ${organizationId}`);

    let query = db.collection('timecards')
      .where('organizationId', '==', organizationId)
      .where('status', '==', 'submitted');

    // Apply additional filters
    if (projectId) {
      query = query.where('projectId', '==', projectId);
    }

    query = query.orderBy('submittedAt', 'desc');

    const timecardsSnapshot = await query.get();
    const timecards = timecardsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`⏰ [PENDING APPROVALS] Found ${timecards.length} pending approvals`);

    res.status(200).json(createSuccessResponse({
      pendingApprovals: timecards,
      summary: {
        total: timecards.length,
        compliance: 0
      }
    }, 'Pending approvals retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [PENDING APPROVALS] Error:', error);
    res.status(500).json(handleError(error, 'handlePendingApprovals'));
  }
}

// ============================================================================
// MY SUBMISSIONS OPERATIONS
// ============================================================================

export async function handleMySubmissions(req: any, res: any, organizationId: string, userId: string) {
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
      submissions: timecards,
      summary: {
        total: timecards.length,
        approved: timecards.filter((tc: any) => tc.status === 'approved').length,
        rejected: timecards.filter((tc: any) => tc.status === 'rejected').length,
        escalated: timecards.filter((tc: any) => tc.escalatedAt).length
      }
    }, 'My submissions retrieved successfully'));

  } catch (error: any) {
    console.error('❌ [MY SUBMISSIONS] Error:', error);
    res.status(500).json(handleError(error, 'handleMySubmissions'));
  }
}

// ============================================================================
// APPROVAL HISTORY OPERATIONS
// ============================================================================

export async function handleApprovalHistory(req: any, res: any, organizationId: string, userId: string) {
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

export async function handleDirectReports(req: any, res: any, organizationId: string, userId: string) {
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

export async function handleMyManager(req: any, res: any, organizationId: string, userId: string) {
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
    
    if (!teamMember) {
      console.log(`⏰ [MY MANAGER] Team member document has no data for user: ${userId}`);
      res.status(404).json(createErrorResponse(
        'Team member data not found',
        'Your team member record exists but contains no data'
      ));
      return;
    }
    
    // Check if user is owner/admin
    const isOwner = teamMember.isOrganizationOwner === true || 
                    teamMember.role === 'owner' || 
                    teamMember.role === 'SUPERADMIN' ||
                    teamMember.teamMemberRole === 'owner';
    const isAdmin = teamMember.isAdmin === true || 
                    teamMember.role === 'admin' || 
                    teamMember.role === 'ADMIN' ||
                    teamMember.dashboardRole === 'ADMIN';
    
    const managerId = teamMember.managerId;

    // Handle case where user doesn't have a manager
    if (!managerId) {
      console.log(`⏰ [MY MANAGER] No manager ID found for user: ${userId} (isOwner: ${isOwner}, isAdmin: ${isAdmin})`);
      
      // For owners/admins without managers, return self-manager response
      if (isOwner || isAdmin) {
        // Get user's own details for self-manager response
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        
        const selfManagerInfo = {
          id: teamMemberDoc.id,
          employeeId: userId,
          managerId: userId, // Self-manager
          isActive: true,
          canApproveTimecards: true,
          isSelfManager: true,
          effectiveDate: (teamMember.createdAt && typeof teamMember.createdAt.toDate === 'function') 
            ? teamMember.createdAt.toDate().toISOString() 
            : new Date().toISOString(),
          manager: {
            id: userId,
            name: userData?.displayName || userData?.name || `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || teamMember.email || 'You',
            firstName: userData?.firstName || undefined,
            lastName: userData?.lastName || undefined,
            email: userData?.email || teamMember.email || undefined,
            role: teamMember.role || userData?.role || undefined,
            department: teamMember.department || userData?.department || undefined
          },
          assigner: {
            id: 'system',
            name: 'System',
            email: 'system@backbone.app'
          }
        };

        console.log(`⏰ [MY MANAGER] Returning self-manager for owner/admin: ${userId}`);
        res.status(200).json(createSuccessResponse(
          selfManagerInfo,
          'You are self-managed for timecard approvals (organization owner/admin)'
        ));
        return;
      }
      
      // For regular users without managers, return informative error
      res.status(404).json(createErrorResponse(
        'No manager assigned',
        'You do not have a manager assigned for timecard approvals. Please contact your administrator.'
      ));
      return;
    }

    // Check if this is a self-manager scenario
    const isSelfManager = managerId === userId;
    
    // Get manager's user details (or user's own details if self-manager)
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
    
    if (!managerData) {
      console.log(`⏰ [MY MANAGER] Manager document exists but has no data: ${managerId}`);
      res.status(404).json(createErrorResponse(
        'Manager data not found',
        'Your assigned manager document exists but contains no data'
      ));
      return;
    }
    
    // Build response matching the expected UserDirectReport type
    // Safely access properties with defaults
    const directReportInfo = {
      id: teamMemberDoc.id,
      employeeId: userId,
      managerId: managerId,
      isActive: teamMember.isActive !== false, // Default to true if not set
      canApproveTimecards: teamMember.canApproveTimecards !== false, // Default to true if not set
      isSelfManager: isSelfManager, // Flag to indicate self-management
      effectiveDate: (teamMember.createdAt && typeof teamMember.createdAt.toDate === 'function') 
        ? teamMember.createdAt.toDate().toISOString() 
        : (teamMember.createdAt || new Date().toISOString()),
      manager: {
        id: managerId,
        name: managerData.displayName || managerData.name || `${managerData.firstName || ''} ${managerData.lastName || ''}`.trim() || managerData.email || 'Unknown',
        firstName: managerData.firstName || undefined,
        lastName: managerData.lastName || undefined,
        email: managerData.email || undefined,
        role: managerData.role || teamMember.role || undefined,
        department: managerData.department || teamMember.department || undefined
      },
      assigner: teamMember.createdBy ? {
        id: teamMember.createdBy,
        name: 'System',
        email: 'system@backbone.app'
      } : (teamMember.managerAssignedBy ? {
        id: teamMember.managerAssignedBy,
        name: 'System',
        email: 'system@backbone.app'
      } : undefined)
    };

    const managerType = isSelfManager ? 'self-manager' : 'assigned manager';
    console.log(`⏰ [MY MANAGER] Found ${managerType} for user ${userId}: ${managerData.email || managerId}`);

    const message = isSelfManager 
      ? 'You are self-managed for timecard approvals'
      : 'Manager information retrieved successfully';

    res.status(200).json(createSuccessResponse(
      directReportInfo,
      message
    ));

  } catch (error: any) {
    console.error('❌ [MY MANAGER] Error:', error);
    res.status(500).json(handleError(error, 'handleMyManager'));
  }
}

