/**
 * User Workload Analyzer
 * 
 * Analyzes user workload and suggests rebalancing:
 * - Calculate items assigned per user
 * - Identify overloaded users
 * - Suggest reassignments to balance workload
 * - Detect users behind on their tasks
 */

import { gatherUserRoleContext } from '../contextAggregation/UserRoleContextService';
import { gatherScheduleContext } from '../contextAggregation/ScheduleContextService';

export interface WorkloadAnalysis {
  userWorkloads: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    totalItems: number;
    overdueItems: number;
    atRiskItems: number;
    workloadScore: number; // 0-100, higher = more overloaded
    recommendations: string[];
  }>;
  
  overloadedUsers: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    totalItems: number;
    workloadScore: number;
    suggestedReassignments: Array<{
      entityType: 'pitch' | 'story';
      entityId: string;
      entityTitle: string;
      suggestedAssignee?: string;
    }>;
  }>;
  
  rebalancingSuggestions: Array<{
    fromUserId: string;
    fromUserName?: string;
    toUserId: string;
    toUserName?: string;
    entityType: 'pitch' | 'story';
    entityId: string;
    entityTitle: string;
    reason: string;
    confidence: number;
  }>;
}

/**
 * Analyze user workloads
 */
export async function analyzeWorkloads(
  organizationId: string
): Promise<WorkloadAnalysis> {
  // Gather user role context
  const userRoleContext = await gatherUserRoleContext(organizationId, {
    includeWorkload: true,
    includeBehindSchedule: true
  });

  // Gather schedule context for overdue/at-risk items
  const scheduleContext = await gatherScheduleContext(organizationId, {
    includeOverdue: true,
    includeAtRisk: true
  });

  // Build user workload map with overdue/at-risk counts
  const userWorkloadMap = new Map<string, {
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    totalItems: number;
    overdueItems: number;
    atRiskItems: number;
  }>();

  // Initialize from user role context
  userRoleContext.userWorkloads.forEach(workload => {
    userWorkloadMap.set(workload.userId, {
      userId: workload.userId,
      userName: workload.userName,
      userEmail: workload.userEmail,
      role: workload.role,
      totalItems: workload.totalItems,
      overdueItems: 0,
      atRiskItems: 0
    });
  });

  // Count overdue items per user
  scheduleContext.overdueItems.forEach(item => {
    item.assignedUsers.forEach(userId => {
      const workload = userWorkloadMap.get(userId);
      if (workload) {
        workload.overdueItems++;
      }
    });
  });

  // Count at-risk items per user
  scheduleContext.atRiskItems.forEach(item => {
    item.assignedUsers.forEach(userId => {
      const workload = userWorkloadMap.get(userId);
      if (workload) {
        workload.atRiskItems++;
      }
    });
  });

  // Calculate workload scores and generate recommendations
  const userWorkloads = Array.from(userWorkloadMap.values()).map(workload => {
    // Calculate workload score (0-100)
    // Base score from total items (max 50 points)
    const itemsScore = Math.min(workload.totalItems * 5, 50);
    
    // Penalty for overdue items (max 30 points)
    const overdueScore = Math.min(workload.overdueItems * 10, 30);
    
    // Penalty for at-risk items (max 20 points)
    const atRiskScore = Math.min(workload.atRiskItems * 5, 20);
    
    const workloadScore = itemsScore + overdueScore + atRiskScore;

    // Generate recommendations
    const recommendations: string[] = [];
    if (workload.overdueItems > 0) {
      recommendations.push(`Address ${workload.overdueItems} overdue item(s) immediately.`);
    }
    if (workload.atRiskItems > 0) {
      recommendations.push(`Monitor ${workload.atRiskItems} at-risk item(s) closely.`);
    }
    if (workload.totalItems > 8) {
      recommendations.push('Consider reassigning some items to balance workload.');
    }
    if (workload.overdueItems > 2) {
      recommendations.push('User may be overloaded - consider reducing assignments.');
    }

    return {
      ...workload,
      workloadScore,
      recommendations
    };
  });

  // Identify overloaded users (score > 60)
  const overloadedUsers = userWorkloads
    .filter(w => w.workloadScore > 60)
    .map(workload => {
      // Find items that could be reassigned
      const suggestedReassignments: WorkloadAnalysis['overloadedUsers'][0]['suggestedReassignments'] = [];
      
      // Get overdue items for this user
      scheduleContext.overdueItems.forEach(item => {
        if (item.assignedUsers.includes(workload.userId)) {
          suggestedReassignments.push({
            entityType: item.entityType,
            entityId: item.entityId,
            entityTitle: item.title
          });
        }
      });

      return {
        userId: workload.userId,
        userName: workload.userName,
        userEmail: workload.userEmail,
        role: workload.role,
        totalItems: workload.totalItems,
        workloadScore: workload.workloadScore,
        suggestedReassignments: suggestedReassignments.slice(0, 5) // Top 5
      };
    });

  // Generate rebalancing suggestions
  const rebalancingSuggestions: WorkloadAnalysis['rebalancingSuggestions'] = [];
  
  // Find users with low workload who could take on more
  const lowWorkloadUsers = userWorkloads
    .filter(w => w.workloadScore < 30 && w.totalItems < 5)
    .sort((a, b) => a.workloadScore - b.workloadScore);

  overloadedUsers.forEach(overloaded => {
    // Try to reassign overdue items to low-workload users
    overloaded.suggestedReassignments.forEach((reassignment, index) => {
      if (index < lowWorkloadUsers.length) {
        const targetUser = lowWorkloadUsers[index];
        rebalancingSuggestions.push({
          fromUserId: overloaded.userId,
          fromUserName: overloaded.userName,
          toUserId: targetUser.userId,
          toUserName: targetUser.userName,
          entityType: reassignment.entityType,
          entityId: reassignment.entityId,
          entityTitle: reassignment.entityTitle,
          reason: `Rebalance workload: ${overloaded.userName || overloaded.userId} is overloaded (score: ${overloaded.workloadScore}), ${targetUser.userName || targetUser.userId} has capacity (score: ${targetUser.workloadScore})`,
          confidence: 0.7
        });
      }
    });
  });

  return {
    userWorkloads: userWorkloads.sort((a, b) => b.workloadScore - a.workloadScore),
    overloadedUsers,
    rebalancingSuggestions
  };
}










