/**
 * Schedule Analyzer
 * 
 * Analyzes schedules and predicts issues:
 * - Overdue items detection
 * - Scheduling conflicts
 * - At-risk items
 * - Bottleneck detection
 */

import { getFirestore } from 'firebase-admin/firestore';
import { gatherScheduleContext } from '../contextAggregation/ScheduleContextService';
import { gatherHistoricalPatterns } from '../contextAggregation/HistoricalPatternService';

const db = getFirestore();

export interface ScheduleAlert {
  id: string;
  type: 'overdue' | 'conflict' | 'at_risk' | 'bottleneck';
  severity: 'low' | 'medium' | 'high' | 'critical';
  entityType: 'pitch' | 'story';
  entityId: string;
  entityTitle: string;
  message: string;
  details: string;
  affectedUsers: string[]; // Contact IDs
  suggestedActions: SuggestedAction[];
  predictedImpact: string;
  createdAt: Date;
}

export interface SuggestedAction {
  id: string;
  type: 'status_update' | 'reassign' | 'extend_deadline' | 'notify_team';
  description: string;
  actionData: any;
  confidence: number; // 0-1
  requiresConfirmation: boolean;
}

/**
 * Analyze schedules and generate alerts
 */
export async function analyzeSchedules(
  organizationId: string,
  options?: {
    includeOverdue?: boolean;
    includeConflicts?: boolean;
    includeAtRisk?: boolean;
    includeBottlenecks?: boolean;
    daysAhead?: number;
  }
): Promise<ScheduleAlert[]> {
  const {
    includeOverdue = true,
    includeConflicts = true,
    includeAtRisk = true,
    includeBottlenecks = true,
    daysAhead = 7
  } = options || {};

  const alerts: ScheduleAlert[] = [];

  // Gather schedule context
  const scheduleContext = await gatherScheduleContext(organizationId, {
    includeOverdue,
    includeConflicts,
    includeAtRisk,
    daysAhead
  });

  // Gather historical patterns for predictions
  const historicalPatterns = await gatherHistoricalPatterns(organizationId);

  // Generate overdue alerts
  if (includeOverdue && scheduleContext.overdueItems.length > 0) {
    scheduleContext.overdueItems.forEach(item => {
      const severity = determineOverdueSeverity(item.daysOverdue);
      
      alerts.push({
        id: `overdue-${item.entityType}-${item.entityId}-${Date.now()}`,
        type: 'overdue',
        severity,
        entityType: item.entityType,
        entityId: item.entityId,
        entityTitle: item.title,
        message: `${item.title} is ${item.daysOverdue} days overdue`,
        details: `This ${item.entityType} has been in "${item.status}" status for ${item.daysOverdue} days, which exceeds the expected timeline.`,
        affectedUsers: item.assignedUsers,
        suggestedActions: generateOverdueActions(item, historicalPatterns),
        predictedImpact: `Delays in ${item.entityType} completion may impact downstream workflow stages.`,
        createdAt: new Date()
      });
    });
  }

  // Generate conflict alerts
  if (includeConflicts && scheduleContext.conflicts.length > 0) {
    scheduleContext.conflicts.forEach(conflict => {
      const severity = determineConflictSeverity(conflict.conflictingItems.length);
      
      // Group by user to identify specific conflicts
      const userConflicts = new Map<string, typeof conflict.conflictingItems>();
      conflict.conflictingItems.forEach(item => {
        if (!userConflicts.has(item.assignedUser)) {
          userConflicts.set(item.assignedUser, []);
        }
        userConflicts.get(item.assignedUser)!.push(item);
      });

      userConflicts.forEach((items, userId) => {
        if (items.length > 1) {
          alerts.push({
            id: `conflict-${userId}-${conflict.date.toISOString()}-${Date.now()}`,
            type: 'conflict',
            severity,
            entityType: items[0].entityType,
            entityId: items[0].entityId,
            entityTitle: `${items.length} items due on ${conflict.date.toLocaleDateString()}`,
            message: `${items.length} items are due on the same day for the same user`,
            details: `Multiple ${items[0].entityType}s are scheduled for completion on ${conflict.date.toLocaleDateString()}: ${items.map(i => i.title).join(', ')}`,
            affectedUsers: [userId],
            suggestedActions: generateConflictActions(items, conflict.date),
            predictedImpact: `User may be overloaded on ${conflict.date.toLocaleDateString()}, risking delays or quality issues.`,
            createdAt: new Date()
          });
        }
      });
    });
  }

  // Generate at-risk alerts
  if (includeAtRisk && scheduleContext.atRiskItems.length > 0) {
    scheduleContext.atRiskItems.forEach(item => {
      const severity = determineAtRiskSeverity(item.daysUntilDeadline);
      
      alerts.push({
        id: `at-risk-${item.entityType}-${item.entityId}-${Date.now()}`,
        type: 'at_risk',
        severity,
        entityType: item.entityType,
        entityId: item.entityId,
        entityTitle: item.title,
        message: `${item.title} is at risk of missing deadline (${item.daysUntilDeadline} days remaining)`,
        details: `This ${item.entityType} is due in ${item.daysUntilDeadline} days but is still in "${item.status}" status.`,
        affectedUsers: item.assignedUsers,
        suggestedActions: generateAtRiskActions(item, historicalPatterns),
        predictedImpact: `If not addressed, this ${item.entityType} may miss its deadline, causing workflow delays.`,
        createdAt: new Date()
      });
    });
  }

  // Generate bottleneck alerts
  if (includeBottlenecks) {
    const workflowContext = await import('../contextAggregation/WorkflowContextService').then(m => 
      m.gatherWorkflowContext(organizationId, { includeBottlenecks: true })
    );

    workflowContext.bottlenecks.forEach(bottleneck => {
      if (bottleneck.itemCount >= 3) { // At least 3 items stuck
        const severity = determineBottleneckSeverity(bottleneck.itemCount, bottleneck.averageWaitTime);
        
        alerts.push({
          id: `bottleneck-${bottleneck.entityType}-${bottleneck.status}-${Date.now()}`,
          type: 'bottleneck',
          severity,
          entityType: bottleneck.entityType,
          entityId: bottleneck.items[0]?.entityId || '',
          entityTitle: `${bottleneck.itemCount} items stuck in "${bottleneck.status}"`,
          message: `${bottleneck.itemCount} ${bottleneck.entityType}s are stuck in "${bottleneck.status}" status`,
          details: `Multiple ${bottleneck.entityType}s are waiting in "${bottleneck.status}" status with an average wait time of ${Math.round(bottleneck.averageWaitTime / (24 * 60 * 60))} days.`,
          affectedUsers: [], // Would extract from items
          suggestedActions: generateBottleneckActions(bottleneck),
          predictedImpact: `This bottleneck is blocking workflow progression and may cause delays across multiple items.`,
          createdAt: new Date()
        });
      }
    });
  }

  return alerts;
}

/**
 * Determine severity for overdue items
 */
function determineOverdueSeverity(daysOverdue: number): ScheduleAlert['severity'] {
  if (daysOverdue >= 14) return 'critical';
  if (daysOverdue >= 7) return 'high';
  if (daysOverdue >= 3) return 'medium';
  return 'low';
}

/**
 * Determine severity for conflicts
 */
function determineConflictSeverity(itemCount: number): ScheduleAlert['severity'] {
  if (itemCount >= 4) return 'critical';
  if (itemCount >= 3) return 'high';
  if (itemCount >= 2) return 'medium';
  return 'low';
}

/**
 * Determine severity for at-risk items
 */
function determineAtRiskSeverity(daysUntilDeadline: number): ScheduleAlert['severity'] {
  if (daysUntilDeadline <= 1) return 'critical';
  if (daysUntilDeadline <= 3) return 'high';
  if (daysUntilDeadline <= 5) return 'medium';
  return 'low';
}

/**
 * Determine severity for bottlenecks
 */
function determineBottleneckSeverity(itemCount: number, averageWaitTime: number): ScheduleAlert['severity'] {
  const daysWait = averageWaitTime / (24 * 60 * 60);
  
  if (itemCount >= 5 && daysWait >= 14) return 'critical';
  if (itemCount >= 3 && daysWait >= 7) return 'high';
  if (itemCount >= 2 && daysWait >= 3) return 'medium';
  return 'low';
}

/**
 * Generate suggested actions for overdue items
 */
function generateOverdueActions(
  item: any,
  historicalPatterns: any
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Check with assigned user
  actions.push({
    id: `notify-${item.entityId}`,
    type: 'notify_team',
    description: `Notify assigned team members about overdue status`,
    actionData: {
      entityType: item.entityType,
      entityId: item.entityId,
      recipients: item.assignedUsers
    },
    confidence: 0.9,
    requiresConfirmation: true
  });

  // Reassign if appropriate
  if (item.assignedUsers.length > 0) {
    actions.push({
      id: `reassign-${item.entityId}`,
      type: 'reassign',
      description: `Consider reassigning to balance workload`,
      actionData: {
        entityType: item.entityType,
        entityId: item.entityId
      },
      confidence: 0.6,
      requiresConfirmation: true
    });
  }

  return actions;
}

/**
 * Generate suggested actions for conflicts
 */
function generateConflictActions(
  items: any[],
  date: Date
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Extend deadline for lower priority items
  items.forEach((item, index) => {
    if (index > 0) { // Keep first item, extend others
      actions.push({
        id: `extend-${item.entityId}`,
        type: 'extend_deadline',
        description: `Extend deadline for "${item.title}" to balance workload`,
        actionData: {
          entityType: item.entityType,
          entityId: item.entityId,
          newDeadline: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days
        },
        confidence: 0.7,
        requiresConfirmation: true
      });
    }
  });

  // Notify team
  const allUsers = Array.from(new Set(items.map(i => i.assignedUser)));
  actions.push({
    id: `notify-conflict-${date.toISOString()}`,
    type: 'notify_team',
    description: `Notify team about scheduling conflict`,
    actionData: {
      recipients: allUsers,
      conflictDate: date
    },
    confidence: 0.9,
    requiresConfirmation: true
  });

  return actions;
}

/**
 * Generate suggested actions for at-risk items
 */
function generateAtRiskActions(
  item: any,
  historicalPatterns: any
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Check progress
  actions.push({
    id: `check-progress-${item.entityId}`,
    type: 'notify_team',
    description: `Check progress with assigned team members`,
    actionData: {
      entityType: item.entityType,
      entityId: item.entityId,
      recipients: item.assignedUsers
    },
    confidence: 0.9,
    requiresConfirmation: true
  });

  // Extend deadline if needed
  if (item.daysUntilDeadline <= 3) {
    actions.push({
      id: `extend-${item.entityId}`,
      type: 'extend_deadline',
      description: `Consider extending deadline if needed`,
      actionData: {
        entityType: item.entityType,
        entityId: item.entityId
      },
      confidence: 0.6,
      requiresConfirmation: true
    });
  }

  return actions;
}

/**
 * Generate suggested actions for bottlenecks
 */
function generateBottleneckActions(
  bottleneck: any
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  // Notify team about bottleneck
  actions.push({
    id: `notify-bottleneck-${bottleneck.status}`,
    type: 'notify_team',
    description: `Notify team about bottleneck in "${bottleneck.status}" status`,
    actionData: {
      status: bottleneck.status,
      entityType: bottleneck.entityType,
      itemCount: bottleneck.itemCount
    },
    confidence: 0.9,
    requiresConfirmation: true
  });

  return actions;
}










