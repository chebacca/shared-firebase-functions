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
import { gatherBudgetContext, BudgetContext } from './BudgetContextService';
import { gatherInventoryContext, InventoryContext } from './InventoryContextService';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize getDb() lazily to avoid initialization errors during deployment
const getDb = () => getFirestore();

export interface GlobalContext {
  organizationId: string;
  timestamp: string;
  userId?: string;

  // NEW: State tracking for Architect/Planner Mode
  activeMode?: string;
  conversationHistory?: any[];
  currentProjectId?: string | null;

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
  budgets: BudgetContext;
  inventory: InventoryContext;

  // Available shows and seasons for script creation planning
  availableShows?: {
    shows: Array<{
      id: string;
      name: string;
      status: string;
      seasons: Array<{
        id: string;
        seasonNumber: number;
        name: string;
        status: string;
      }>;
    }>;
  };
}

/**
 * Fetch available shows and seasons for an organization
 */
async function fetchAvailableShows(organizationId: string): Promise<{
  shows: Array<{
    id: string;
    name: string;
    status: string;
    seasons: Array<{
      id: string;
      seasonNumber: number;
      name: string;
      status: string;
    }>;
  }>;
}> {
  try {
    const showsSnap = await getDb()
      .collection('clipShowShows')
      .where('organizationId', '==', organizationId)
      .limit(20)
      .get();

    const shows = await Promise.all(
      showsSnap.docs.map(async (showDoc) => {
        const showData = showDoc.data();
        // Extract seasons from show data (seasons array is stored on the show document)
        const seasons = (showData.seasons || []).map((season: any) => ({
          id: season.id || `${showDoc.id}_season_${season.seasonNumber}`,
          seasonNumber: season.seasonNumber || 0,
          name: season.name || `Season ${season.seasonNumber || 0}`,
          status: season.status || 'Active'
        }));

        return {
          id: showDoc.id,
          name: showData.name || 'Unnamed Show',
          status: showData.status || 'Active',
          seasons: seasons
        };
      })
    );

    return { shows };
  } catch (error) {
    console.error('❌ [GlobalContext] Error fetching available shows:', error);
    return { shows: [] };
  }
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

  // Parallel fetch of all contexts using existing services with individual error handling
  // Each service follows the same patterns as its corresponding frontend app
  const [
    dashboardContext,
    licensingContext,
    callSheetContext,
    bridgeContext,
    workflowContext,
    scheduleContext,
    teamContext,
    pwsWorkflowContext,
    budgetContext,
    inventoryContext
  ] = await Promise.all([
    // Dashboard Context
    gatherDashboardContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Dashboard context:', error);
      return { activeProjects: 0, totalProjects: 0, projects: [] };
    }),

    // Licensing Context
    gatherLicensingContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Licensing context:', error);
      return { activeLicenses: 0, totalLicenses: 0, licenses: [] };
    }),

    // Call Sheet Context
    gatherCallSheetContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Call Sheet context:', error);
      return { activePersonnel: 0, personnel: [] };
    }),

    // Bridge Context
    gatherBridgeContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Bridge context:', error);
      return { activeFolders: 0, folders: [] };
    }),

    // Workflow Context (Clip Show)
    gatherWorkflowContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Workflow context:', error);
      return {
        phaseDistribution: {},
        bottlenecks: [],
        statusTransitions: [],
        velocityMetrics: { averageTimeToComplete: 0, averageTimePerPhase: {}, completionRate: 0, itemsInProgress: 0, itemsCompleted: 0 },
        itemsByPhase: {}
      };
    }),

    // Schedule Context
    gatherScheduleContext(organizationId, { userId }).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Schedule context:', error);
      return { linkedEvents: [], overdueItems: [], conflicts: [], atRiskItems: [], activeItemsTimeline: [] };
    }),

    // Team Context
    gatherTeamContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Team context:', error);
      return { totalMembers: 0, activeMembers: 0, pendingMembers: 0, ownerCount: 0, adminCount: 0, memberCount: 0, viewerCount: 0, recentlyActive: 0 };
    }),

    // PWS Workflow Context
    gatherPWSWorkflowContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering PWS Workflow context:', error);
      return {
        templates: [],
        sessionWorkflows: [],
        userWorkflows: [],
        statistics: { totalTemplates: 0, totalActiveWorkflows: 0, averageWorkflowComplexity: 0, mostUsedTemplate: '' }
      };
    }),

    // Budget Context
    gatherBudgetContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Budget context:', error);
      return { totalBudgets: 0, activeBudgets: 0, totalBudgeted: 0, totalSpent: 0, budgets: [] };
    }),

    // Inventory Context
    gatherInventoryContext(organizationId).catch(error => {
      console.error('❌ [GlobalContext] Error gathering Inventory context:', error);
      return { totalItems: 0, checkedOutItems: 0, availableItems: 0, lowStockItems: 0, items: [] };
    })
  ]);

  // Fetch session context separately with error handling (already handled in gatherSessionContext, but adding extra safety)
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

  // Fetch available shows and seasons for script creation planning
  const availableShows = await fetchAvailableShows(organizationId).catch(error => {
    console.error('❌ [GlobalContext] Error gathering available shows:', error);
    return { shows: [] };
  });

  const globalContext: GlobalContext = {
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
    sessions: sessionContext,
    budgets: budgetContext,
    inventory: inventoryContext,
    availableShows
  };

  console.log(`✅ [GlobalContext] Context aggregation complete for org ${organizationId}`);
  return globalContext;
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
      phaseDistribution: {},
      bottlenecks: [],
      statusTransitions: [],
      velocityMetrics: {
        averageTimeToComplete: 0,
        averageTimePerPhase: {},
        completionRate: 0,
        itemsInProgress: 0,
        itemsCompleted: 0
      },
      itemsByPhase: {}
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
    },
    budgets: {
      totalBudgets: 0,
      activeBudgets: 0,
      totalBudgeted: 0,
      totalSpent: 0,
      budgets: []
    },
    inventory: {
      totalItems: 0,
      checkedOutItems: 0,
      availableItems: 0,
      lowStockItems: 0,
      items: []
    }
  };
}
