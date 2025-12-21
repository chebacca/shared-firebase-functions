/**
 * Global Context Service
 * 
 * Aggregates context from ALL Backbone apps by composing existing context services.
 * Uses project-specific context services to avoid duplicating logic.
 * 
 * Apps:
 * - Dashboard (Projects) - via DashboardContextService
 * - Clip Show Pro (Pitches, Stories, Workflow) - via WorkflowContextService
 * - Licensing (Licenses) - via LicensingContextService
 * - Call Sheet (Personnel) - via CallSheetContextService
 * - Schedule (Calendar) - via ScheduleContextService
 * - Bridge (NLE Source Folders) - via BridgeContextService
 */

import { gatherWorkflowContext, WorkflowContext } from './WorkflowContextService';
import { gatherScheduleContext, ScheduleContext } from './ScheduleContextService';
import { gatherDashboardContext, DashboardContext } from './DashboardContextService';
import { gatherLicensingContext, LicensingContext } from './LicensingContextService';
import { gatherCallSheetContext, CallSheetContext } from './CallSheetContextService';
import { gatherBridgeContext, BridgeContext } from './BridgeContextService';
import { gatherTeamContext, TeamContext } from './TeamContextService';
import { gatherPWSWorkflowContext, PWSWorkflowContext } from './PWSWorkflowContextService';
import { gatherSessionContext, SessionContext } from './SessionContextService';

export interface GlobalContext {
  organizationId: string;
  timestamp: string;
  userId?: string;

  // App-specific contexts (composed from existing services)
  dashboard: DashboardContext;
  licensing: LicensingContext;
  callSheet: CallSheetContext;
  bridge: BridgeContext;
  clipShow: WorkflowContext;
  schedule: ScheduleContext;
  team: TeamContext;
  pwsWorkflows: PWSWorkflowContext; // PWS workflow context for CNS
  sessions: SessionContext; // Session context for workflow creation
}

/**
 * Gather Global Context for an Organization
 * 
 * Composes context from all existing context services.
 * This ensures we use the same query patterns and logic as each app's frontend.
 */
export async function gatherGlobalContext(
  organizationId: string,
  userId?: string,
  sessionId?: string // Optional: if provided, gathers detailed session context
): Promise<GlobalContext> {
  const now = new Date();

  // Parallel fetch of all contexts using existing services
  // Each service follows the same patterns as its corresponding frontend app
  // Session context is fetched separately with error handling to prevent failures
  const [
    dashboardContext,
    licensingContext,
    callSheetContext,
    bridgeContext,
    workflowContext,
    scheduleContext,
    teamContext,
    pwsWorkflowContext
  ] = await Promise.all([
    gatherDashboardContext(organizationId),
    gatherLicensingContext(organizationId),
    gatherCallSheetContext(organizationId),
    gatherBridgeContext(organizationId),
    gatherWorkflowContext(organizationId),
    gatherScheduleContext(organizationId, { userId }),
    gatherTeamContext(organizationId),
    gatherPWSWorkflowContext(organizationId) // PWS workflow context
  ]);

  // Fetch session context separately with error handling to prevent it from breaking the entire context gathering
  let sessionContext: SessionContext;
  try {
    sessionContext = await gatherSessionContext(organizationId, sessionId);
  } catch (error) {
    console.warn('[GlobalContextService] Error gathering session context, continuing without it:', error);
    sessionContext = {
      statistics: {
        totalSessions: 0,
        sessionsByStatus: {},
        sessionsByPhase: {},
        activeWorkflows: 0
      }
    };
  }

  return {
    organizationId,
    timestamp: now.toISOString(),
    userId,
    dashboard: dashboardContext,
    licensing: licensingContext,
    callSheet: callSheetContext,
    bridge: bridgeContext,
    clipShow: workflowContext,
    schedule: scheduleContext,
    team: teamContext,
    pwsWorkflows: pwsWorkflowContext,
    sessions: sessionContext
  };
}

/**
 * Gather Minimal Context for Graph Requests
 * 
 * Only fetches team context needed for relationship graphs.
 * This avoids unnecessary Firestore queries when user just wants graph view.
 * 
 * Returns a minimal GlobalContext with only team data populated.
 * Other contexts are set to minimal defaults that won't affect the summary.
 */
export async function gatherMinimalContextForGraph(
  organizationId: string,
  userId?: string
): Promise<GlobalContext> {
  const now = new Date();

  // Only fetch team context - needed for relationship graphs
  const teamContext = await gatherTeamContext(organizationId);

  // Return minimal context with empty/default values for other apps
  // These defaults ensure buildContextSummary() still works correctly
  return {
    organizationId,
    timestamp: now.toISOString(),
    dashboard: {
      activeProjects: 0,
      totalProjects: 0,
      projects: []
    },
    licensing: {
      activeLicenses: 0,
      totalLicenses: 0,
      licenses: []
    },
    callSheet: {
      activePersonnel: 0,
      personnel: []
    },
    bridge: {
      activeFolders: 0,
      folders: []
    },
    clipShow: {
      phaseDistribution: new Map(),
      bottlenecks: [],
      statusTransitions: [],
      velocityMetrics: {
        averageTimeToComplete: 0,
        averageTimePerPhase: new Map(),
        completionRate: 0,
        itemsInProgress: 0,
        itemsCompleted: 0
      },
      itemsByPhase: new Map()
    },
    schedule: {
      linkedEvents: [],
      overdueItems: [],
      conflicts: [],
      atRiskItems: [],
      activeItemsTimeline: []
    },
    team: teamContext,
    pwsWorkflows: {
      templates: [],
      sessionWorkflows: [],
      userWorkflows: [],
      statistics: {
        totalTemplates: 0,
        totalActiveWorkflows: 0,
        averageWorkflowComplexity: 0,
        mostUsedTemplate: ''
      }
    },
    sessions: {
      statistics: {
        totalSessions: 0,
        sessionsByStatus: {},
        sessionsByPhase: {},
        activeWorkflows: 0
      }
    }
  };
}
