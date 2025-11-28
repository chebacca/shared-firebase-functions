/**
 * AI Context Service
 * 
 * Gathers real workflow context from Firestore for AI operations
 * Provides comprehensive context about current state, history, and patterns
 */

import { getFirestore } from 'firebase-admin/firestore';
import {
  fetchCurrentPitch,
  fetchCurrentStory,
  fetchWorkflowHistory,
  fetchAutomationRules,
  fetchExecutionLogs,
  fetchUserRole,
  fetchTeamMembers,
  fetchProjects,
  fetchBudgetSummary,
  fetchProjectBudgets,
  fetchCalendarSummary,
  fetchUpcomingCalendarEvents,
  fetchRecentPitches,
  fetchRecentStories,
  fetchContactsSummary,
  fetchAutomationSummary,
  fetchIndexedFilesSummary,
  fetchConversationsSummary,
  fetchLicensingBudgetSummary
} from './utils/workflowDataFetcher';
import {
  mapPitchStatusToWorkflowStage,
  mapStoryStatusToWorkflowStage,
  getValidNextStatuses,
  analyzeStatusTransitionPatterns,
  identifyBottlenecks
} from './utils/workflowUnderstanding';
import { getAppKnowledgePrompt, getPageContextPrompt } from './utils/appKnowledge';

const db = getFirestore();

export interface AIContext {
  // Current entity context
  currentEntity?: {
    type: 'pitch' | 'story' | 'show' | 'season';
    id: string;
    data: any;
    workflowStage: any;
  };

  // Workflow history
  workflowHistory: any[];

  // User context
  user: {
    id: string;
    role?: any;
    organizationId: string;
  };

  // Organization context
  organization: {
    id: string;
    teamMembers: any[];
    automationRules: any[];
    recentExecutionLogs: any[];
  };

  // Workflow patterns
  patterns: {
    statusTransitions: any[];
    bottlenecks: any[];
  };

  // Page context
  pageContext?: {
    page: string;
    selectedItems?: string[];
    recentPitches?: any[];
    recentStories?: any[];
    recentProjects?: any[];
  };

  // Budget context
  budget?: {
    summary?: any;
    projects?: any[];
    projectBudgets?: Map<string, any>;
  };

  // Calendar context
  calendar?: {
    summary?: any;
    upcomingEvents?: any[];
    recentEvents?: any[];
  };

  // Contacts context
  contacts?: {
    summary?: any;
    recentContacts?: any[];
  };

  // Automation context
  automation?: {
    summary?: any;
    functions?: any[];
    recentRules?: any[];
  };

  // Indexed Files context
  indexedFiles?: {
    summary?: any;
    recentIndexes?: any[];
  };

  // Messages/Conversations context
  messages?: {
    summary?: any;
    recentConversations?: any[];
  };

  // Licensing Budget Tracker context
  licensingBudget?: {
    summary?: any;
    recentLicenses?: any[];
  };
}

/**
 * Gather comprehensive AI context for a specific entity
 */
export async function gatherEntityContext(
  organizationId: string,
  userId: string,
  entityType: 'pitch' | 'story' | 'show' | 'season',
  entityId: string,
  pageContext?: { page: string; selectedItems?: string[] }
): Promise<AIContext> {
  // Fetch current entity
  let currentEntity: any = null;
  let workflowStage: any = null;

  if (entityType === 'pitch') {
    currentEntity = await fetchCurrentPitch(entityId, organizationId);
    if (currentEntity?.status) {
      workflowStage = mapPitchStatusToWorkflowStage(currentEntity.status);
    }
  } else if (entityType === 'story') {
    currentEntity = await fetchCurrentStory(entityId, organizationId);
    if (currentEntity?.status) {
      workflowStage = mapStoryStatusToWorkflowStage(currentEntity.status);
    }
  }

  // Fetch workflow history
  const workflowHistory = await fetchWorkflowHistory(entityId, entityType, organizationId, 50);

  // Fetch user role
  const userRole = await fetchUserRole(userId, organizationId);

  // Fetch organization context
  const teamMembers = await fetchTeamMembers(organizationId);
  const automationRules = await fetchAutomationRules(organizationId);
  const executionLogs = await fetchExecutionLogs(organizationId, 50);

  // Analyze patterns
  const statusTransitions = await analyzeStatusTransitionPatterns(organizationId, entityType);
  const bottlenecks = (entityType === 'pitch' || entityType === 'story')
    ? await identifyBottlenecks(organizationId, entityType)
    : [];

  return {
    currentEntity: currentEntity ? {
      type: entityType,
      id: entityId,
      data: currentEntity,
      workflowStage
    } : undefined,
    workflowHistory,
    user: {
      id: userId,
      role: userRole,
      organizationId
    },
    organization: {
      id: organizationId,
      teamMembers,
      automationRules,
      recentExecutionLogs: executionLogs
    },
    patterns: {
      statusTransitions,
      bottlenecks
    },
    pageContext
  };
}

/**
 * Gather general AI context (no specific entity) - enhanced with page-specific data
 */
export async function gatherGeneralContext(
  organizationId: string,
  userId: string,
  pageContext?: { page: string; selectedItems?: string[] }
): Promise<AIContext> {
  // Fetch user role
  const userRole = await fetchUserRole(userId, organizationId);

  // Fetch organization context
  const teamMembers = await fetchTeamMembers(organizationId);
  const automationRules = await fetchAutomationRules(organizationId);
  const executionLogs = await fetchExecutionLogs(organizationId, 50);

  // Analyze patterns (no specific entity type)
  const statusTransitions = await analyzeStatusTransitionPatterns(organizationId);

  // ALWAYS fetch ALL context regardless of page - comprehensive context at all times
  // Fetch recent items for better understanding
  const recentPitches = await fetchRecentPitches(organizationId, 10);
  const recentStories = await fetchRecentStories(organizationId, 10);
  const recentProjects = await fetchProjects(organizationId, 20);
  
  // ALWAYS fetch budget data
  let budgetContext: { summary?: any; projects?: any[]; projectBudgets?: Map<string, any> } | undefined;
  if (recentProjects.length > 0) {
    const projectIds = recentProjects.map(p => p.id);
    const budgetSummary = await fetchBudgetSummary(organizationId);
    const projectBudgets = await fetchProjectBudgets(organizationId, projectIds);
    
    budgetContext = {
      summary: budgetSummary,
      projects: recentProjects.slice(0, 10),
      projectBudgets
    };
  }

  // ALWAYS fetch calendar data
  const calendarSummary = await fetchCalendarSummary(organizationId);
  const upcomingEvents = await fetchUpcomingCalendarEvents(organizationId, 30);
  const calendarContext = {
    summary: calendarSummary,
    upcomingEvents: upcomingEvents.slice(0, 10),
    recentEvents: upcomingEvents.slice(0, 5)
  };

  // ALWAYS fetch contacts data
  const contactsSummary = await fetchContactsSummary(organizationId);
  const contactsContext = {
    summary: contactsSummary,
    recentContacts: contactsSummary.recentContacts || []
  };

  // ALWAYS fetch automation data
  const automationSummary = await fetchAutomationSummary(organizationId);
  const automationContext = {
    summary: automationSummary,
    functions: automationSummary.functions || [],
    recentRules: automationRules.slice(0, 10)
  };

  // ALWAYS fetch indexed files data
  const indexedFilesSummary = await fetchIndexedFilesSummary(organizationId);
  const indexedFilesContext = {
    summary: indexedFilesSummary,
    recentIndexes: indexedFilesSummary.recentIndexes || []
  };

  // ALWAYS fetch messages/conversations data
  const conversationsSummary = await fetchConversationsSummary(organizationId);
  const messagesContext = {
    summary: conversationsSummary,
    recentConversations: conversationsSummary.recentConversations || []
  };

  // ALWAYS fetch licensing budget data
  const licensingBudgetSummary = await fetchLicensingBudgetSummary(organizationId);
  const licensingBudgetContext = {
    summary: licensingBudgetSummary,
    recentLicenses: licensingBudgetSummary.recentLicenses || []
  };

  return {
    workflowHistory: [],
    user: {
      id: userId,
      role: userRole,
      organizationId
    },
    organization: {
      id: organizationId,
      teamMembers,
      automationRules,
      recentExecutionLogs: executionLogs
    },
    patterns: {
      statusTransitions,
      bottlenecks: []
    },
    pageContext: {
      ...pageContext,
      recentPitches: recentPitches.length > 0 ? recentPitches : undefined,
      recentStories: recentStories.length > 0 ? recentStories : undefined,
      recentProjects: recentProjects.length > 0 ? recentProjects : undefined
    },
    budget: budgetContext,
    calendar: calendarContext,
    contacts: contactsContext,
    automation: automationContext,
    indexedFiles: indexedFilesContext,
    messages: messagesContext,
    licensingBudget: licensingBudgetContext
  };
}

/**
 * Format context for AI prompt with comprehensive app knowledge
 */
export function formatContextForPrompt(context: AIContext): string {
  let prompt = getAppKnowledgePrompt();
  prompt += '\n\n';
  prompt += '## Current Session Context\n\n';

  // Page context
  if (context.pageContext?.page) {
    prompt += getPageContextPrompt(context.pageContext.page);
    prompt += '\n';
  }

  // Current entity - detailed
  if (context.currentEntity) {
    const entity = context.currentEntity;
    prompt += `### Current ${entity.type.charAt(0).toUpperCase() + entity.type.slice(1)} Details\n`;
    prompt += `- ID: ${entity.id}\n`;
    prompt += `- Status: ${entity.data.status || 'Unknown'}\n`;
    
    if (entity.workflowStage) {
      prompt += `- Workflow Stage: ${entity.workflowStage.stage}\n`;
      prompt += `- Stage Description: ${entity.workflowStage.description}\n`;
    }
    
    // Valid next statuses
    const validNext = getValidNextStatuses(entity.data.status || '', entity.type);
    if (validNext.length > 0) {
      prompt += `- Valid Next Statuses: ${validNext.join(', ')}\n`;
    }
    
    if (entity.data.clipTitle || entity.data.title) {
      prompt += `- Title: ${entity.data.clipTitle || entity.data.title}\n`;
    }
    
    // Pitch-specific fields
    if (entity.type === 'pitch') {
      if (entity.data.producerId) prompt += `- Producer ID: ${entity.data.producerId}\n`;
      if (entity.data.licensingSpecialistId) prompt += `- Licensing Specialist ID: ${entity.data.licensingSpecialistId}\n`;
      if (entity.data.clearanceStage) prompt += `- Clearance Stage: ${entity.data.clearanceStage}\n`;
    }
    
    // Story-specific fields
    if (entity.type === 'story') {
      if (entity.data.writerId) prompt += `- Writer ID: ${entity.data.writerId}\n`;
      if (entity.data.editorId) prompt += `- Editor ID: ${entity.data.editorId}\n`;
      if (entity.data.transcodingStatus) prompt += `- Transcoding Status: ${entity.data.transcodingStatus}\n`;
      if (entity.data.pitchId) prompt += `- Linked Pitch ID: ${entity.data.pitchId}\n`;
    }
    
    prompt += '\n';
  }

  // User context
  prompt += `### Current User\n`;
  prompt += `- User ID: ${context.user.id}\n`;
  prompt += `- Role: ${context.user.role?.role || 'Unknown'}\n`;
  if (context.user.role?.name) {
    prompt += `- Name: ${context.user.role.name}\n`;
  }
  prompt += `- Organization ID: ${context.organization.id}\n`;
  prompt += '\n';

  // Team context
  if (context.organization.teamMembers.length > 0) {
    prompt += `### Team Members (${context.organization.teamMembers.length} total)\n`;
    context.organization.teamMembers.slice(0, 10).forEach((member, idx) => {
      prompt += `${idx + 1}. ${member.name || member.email || 'Unknown'} - ${member.role || 'Member'}\n`;
    });
    prompt += '\n';
  }

  // Recent workflow history - detailed
  if (context.workflowHistory.length > 0) {
    prompt += `### Recent Workflow Actions (${context.workflowHistory.length} items)\n`;
    context.workflowHistory.slice(0, 15).forEach((action, idx) => {
      const timestamp = action.timestamp?.toDate();
      const timeStr = timestamp ? timestamp.toLocaleString() : 'Unknown time';
      prompt += `${idx + 1}. **${action.action}**\n`;
      prompt += `   - Performed by: ${action.performedByName || action.performedBy}\n`;
      prompt += `   - Time: ${timeStr}\n`;
      if (action.metadata) {
        if (action.metadata.oldStatus && action.metadata.newStatus) {
          prompt += `   - Status change: ${action.metadata.oldStatus} → ${action.metadata.newStatus}\n`;
        }
      }
      prompt += '\n';
    });
    prompt += '\n';
  }

  // Automation context
  if (context.organization.automationRules.length > 0) {
    prompt += `### Active Automation Rules (${context.organization.automationRules.length} total)\n`;
    context.organization.automationRules.slice(0, 5).forEach((rule, idx) => {
      prompt += `${idx + 1}. ${rule.functionName} - ${rule.enabled ? 'Enabled' : 'Disabled'}\n`;
    });
    prompt += '\n';
  }

  // Patterns - more detailed
  if (context.patterns.statusTransitions.length > 0) {
    prompt += `### Common Status Transition Patterns\n`;
    prompt += `These patterns show how items typically move through the workflow:\n`;
    context.patterns.statusTransitions.slice(0, 8).forEach(transition => {
      prompt += `- **${transition.from} → ${transition.to}**: ${transition.count} times`;
      if (transition.averageTime) {
        const hours = Math.round(transition.averageTime / 3600);
        prompt += ` (avg ${hours} hours)`;
      }
      prompt += '\n';
    });
    prompt += '\n';
  }

  // Bottlenecks - actionable insights
  if (context.patterns.bottlenecks.length > 0) {
    prompt += `### Workflow Bottlenecks (Areas Needing Attention)\n`;
    prompt += `These statuses have items waiting longer than usual:\n`;
    context.patterns.bottlenecks.slice(0, 5).forEach((bottleneck, idx) => {
      const hours = Math.round(bottleneck.averageWaitTime / 3600);
      prompt += `${idx + 1}. **${bottleneck.status}** (${bottleneck.entityType}):\n`;
      prompt += `   - ${bottleneck.itemCount} items waiting\n`;
      prompt += `   - Average wait time: ${hours} hours\n`;
    });
    prompt += '\n';
  }

  // Selected items context
  if (context.pageContext?.selectedItems && context.pageContext.selectedItems.length > 0) {
    prompt += `### Selected Items\n`;
    prompt += `User has selected ${context.pageContext.selectedItems.length} item(s): ${context.pageContext.selectedItems.slice(0, 5).join(', ')}\n`;
    prompt += '\n';
  }

  // Recent items on current page
  if (context.pageContext?.recentPitches && context.pageContext.recentPitches.length > 0) {
    prompt += `### Recent Pitches on This Page (${context.pageContext.recentPitches.length} items)\n`;
    context.pageContext.recentPitches.slice(0, 5).forEach((pitch, idx) => {
      prompt += `${idx + 1}. ${pitch.clipTitle || 'Untitled'} - Status: ${pitch.status || 'Unknown'}\n`;
    });
    prompt += '\n';
  }

  if (context.pageContext?.recentStories && context.pageContext.recentStories.length > 0) {
    prompt += `### Recent Stories on This Page (${context.pageContext.recentStories.length} items)\n`;
    context.pageContext.recentStories.slice(0, 5).forEach((story, idx) => {
      prompt += `${idx + 1}. ${story.title || 'Untitled'} - Status: ${story.status || 'Unknown'}\n`;
    });
    prompt += '\n';
  }

  // Budget context - comprehensive budget information
  if (context.budget) {
    prompt += `## Budget Context\n\n`;
    
    if (context.budget.summary) {
      const summary = context.budget.summary;
      prompt += `### Budget Summary\n`;
      prompt += `- Total Projects: ${summary.totalProjects || 0}\n`;
      prompt += `- Projects with Budgets: ${summary.projectsWithBudgets || 0}\n`;
      prompt += `- Total Budget: $${(summary.totalBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      prompt += `- Total Spent: $${(summary.totalSpent || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      prompt += `- Budget Remaining: $${(summary.budgetRemaining || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      
      if (summary.totalBudget > 0) {
        const utilizationPercent = ((summary.totalSpent || 0) / summary.totalBudget * 100).toFixed(1);
        prompt += `- Budget Utilization: ${utilizationPercent}%\n`;
      }
      prompt += '\n';
    }

    if (context.budget.projects && context.budget.projects.length > 0) {
      prompt += `### Projects with Budget Data (${context.budget.projects.length} projects)\n`;
      context.budget.projects.slice(0, 10).forEach((project, idx) => {
        prompt += `${idx + 1}. **${project.name || 'Unnamed Project'}** (ID: ${project.id})\n`;
        
        if (project.budget) {
          const prodBudget = project.budget.productionBudget || 0;
          const postProdBudget = project.budget.postProductionBudget || 0;
          const totalBudget = prodBudget + postProdBudget;
          prompt += `   - Production Budget: $${prodBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          prompt += `   - Post-Production Budget: $${postProdBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          prompt += `   - Total Budget: $${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        }
        
        if (project.calculations) {
          const calc = project.calculations;
          prompt += `   - Budget Used: $${(calc.budgetUsed || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          prompt += `   - Budget Remaining: $${(calc.budgetRemaining || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          prompt += `   - Budget Status: ${calc.budgetStatus || 'none'}\n`;
          
          if (calc.totalClips) {
            prompt += `   - Total Clips: ${calc.totalClips}\n`;
            prompt += `   - Total Duration: ${(calc.totalDuration || 0).toFixed(2)} seconds\n`;
          }
          
          if (calc.productionMetrics) {
            prompt += `   - Production Metrics: ${calc.productionMetrics.clips || 0} clips, $${(calc.productionMetrics.cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          }
          
          if (calc.postProductionMetrics) {
            prompt += `   - Post-Production Metrics: ${calc.postProductionMetrics.clips || 0} clips, $${(calc.postProductionMetrics.cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          }
        }
        
        prompt += '\n';
      });
      prompt += '\n';
    }

    if (context.budget.projectBudgets && context.budget.projectBudgets.size > 0) {
      prompt += `### Budget Groups & Clips\n`;
      let groupCount = 0;
      context.budget.projectBudgets.forEach((budgetData, projectId) => {
        if (budgetData.groups && budgetData.groups.length > 0 && groupCount < 5) {
          const project = context.budget.projects?.find(p => p.id === projectId);
          prompt += `**${project?.name || 'Project'}** (${budgetData.groups.length} budget groups):\n`;
          budgetData.groups.slice(0, 3).forEach((group: any, idx: number) => {
            prompt += `  ${idx + 1}. ${group.name || 'Unnamed Group'} - $${(group.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${group.clipCount || 0} clips, ${group.type || 'unassigned'})\n`;
          });
          groupCount++;
          prompt += '\n';
        }
      });
    }
  }

  if (context.pageContext?.recentProjects && context.pageContext.recentProjects.length > 0) {
    prompt += `### Recent Projects on This Page (${context.pageContext.recentProjects.length} items)\n`;
    context.pageContext.recentProjects.slice(0, 5).forEach((project, idx) => {
      prompt += `${idx + 1}. ${project.name || 'Unnamed Project'} - ${project.status || 'Active'}\n`;
    });
    prompt += '\n';
  }

  // Calendar context - comprehensive calendar information
  if (context.calendar) {
    prompt += `## Calendar Context\n\n`;
    
    if (context.calendar.summary) {
      const summary = context.calendar.summary;
      prompt += `### Calendar Summary\n`;
      prompt += `- Total Events: ${summary.totalEvents || 0}\n`;
      prompt += `- Upcoming Events (next 30 days): ${summary.upcomingEventsCount || 0}\n`;
      prompt += `- Events This Week: ${summary.eventsThisWeek || 0}\n`;
      prompt += `- Events This Month: ${summary.eventsThisMonth || 0}\n`;
      
      if (summary.eventsByType && Object.keys(summary.eventsByType).length > 0) {
        prompt += `- Events by Type:\n`;
        Object.entries(summary.eventsByType).slice(0, 5).forEach(([type, count]) => {
          prompt += `  - ${type}: ${count}\n`;
        });
      }
      
      if (summary.eventsByWorkflowType && Object.keys(summary.eventsByWorkflowType).length > 0) {
        prompt += `- Events by Workflow Type:\n`;
        Object.entries(summary.eventsByWorkflowType).slice(0, 5).forEach(([type, count]) => {
          prompt += `  - ${type}: ${count}\n`;
        });
      }
      prompt += '\n';
    }

    if (context.calendar.upcomingEvents && context.calendar.upcomingEvents.length > 0) {
      prompt += `### Upcoming Calendar Events (${context.calendar.upcomingEvents.length} events)\n`;
      context.calendar.upcomingEvents.slice(0, 10).forEach((event, idx) => {
        const eventDate = event.startDate?.toDate ? event.startDate.toDate() : new Date(event.startDate);
        const dateStr = eventDate.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        
        prompt += `${idx + 1}. **${event.title || 'Untitled Event'}**\n`;
        prompt += `   - Date: ${dateStr}\n`;
        if (event.eventType) prompt += `   - Type: ${event.eventType}\n`;
        if (event.location) prompt += `   - Location: ${event.location}\n`;
        if (event.workflowType) prompt += `   - Workflow: ${event.workflowType}\n`;
        if (event.description) {
          const desc = event.description.length > 100 ? event.description.substring(0, 100) + '...' : event.description;
          prompt += `   - Description: ${desc}\n`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Contacts context - comprehensive contacts information
  if (context.contacts) {
    prompt += `## Contacts Context\n\n`;
    
    if (context.contacts.summary) {
      const summary = context.contacts.summary;
      prompt += `### Contacts Summary\n`;
      prompt += `- Total Contacts: ${summary.totalContacts || 0}\n`;
      
      if (summary.contactsByRole && Object.keys(summary.contactsByRole).length > 0) {
        prompt += `- Contacts by Role:\n`;
        Object.entries(summary.contactsByRole).slice(0, 8).forEach(([role, count]) => {
          prompt += `  - ${role}: ${count}\n`;
        });
      }
      
      if (summary.contactsByDepartment && Object.keys(summary.contactsByDepartment).length > 0) {
        prompt += `- Contacts by Department:\n`;
        Object.entries(summary.contactsByDepartment).slice(0, 5).forEach(([dept, count]) => {
          prompt += `  - ${dept}: ${count}\n`;
        });
      }
      
      if (summary.contactsByPod && Object.keys(summary.contactsByPod).length > 0) {
        prompt += `- Contacts by Pod:\n`;
        Object.entries(summary.contactsByPod).slice(0, 5).forEach(([pod, count]) => {
          prompt += `  - ${pod}: ${count}\n`;
        });
      }
      prompt += '\n';
    }

    if (context.contacts.recentContacts && context.contacts.recentContacts.length > 0) {
      prompt += `### Recent Contacts (${context.contacts.recentContacts.length} contacts)\n`;
      context.contacts.recentContacts.slice(0, 10).forEach((contact, idx) => {
        prompt += `${idx + 1}. **${contact.name || contact.firstName + ' ' + contact.lastName || 'Unnamed'}**\n`;
        if (contact.role) prompt += `   - Role: ${contact.role}\n`;
        if (contact.department) prompt += `   - Department: ${contact.department}\n`;
        if (contact.email) prompt += `   - Email: ${contact.email}\n`;
        if (contact.phone || contact.phoneNumber) prompt += `   - Phone: ${contact.phone || contact.phoneNumber}\n`;
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Automation context - comprehensive automation information
  if (context.automation) {
    prompt += `## Automation Context\n\n`;
    
    if (context.automation.summary) {
      const summary = context.automation.summary;
      prompt += `### Automation Summary\n`;
      prompt += `- Total Automation Functions: ${summary.totalFunctions || 0}\n`;
      prompt += `- Total Automation Rules: ${summary.totalRules || 0}\n`;
      prompt += `- Enabled Rules: ${summary.enabledRules || 0}\n`;
      prompt += `- Disabled Rules: ${summary.disabledRules || 0}\n`;
      
      if (summary.rulesByFunction && Object.keys(summary.rulesByFunction).length > 0) {
        prompt += `- Rules by Function:\n`;
        Object.entries(summary.rulesByFunction).slice(0, 8).forEach(([functionId, count]) => {
          prompt += `  - ${functionId}: ${count} rule(s)\n`;
        });
      }
      prompt += '\n';
    }

    if (context.automation.functions && context.automation.functions.length > 0) {
      prompt += `### Available Automation Functions (${context.automation.functions.length} functions)\n`;
      context.automation.functions.slice(0, 10).forEach((func, idx) => {
        prompt += `${idx + 1}. **${func.name || func.functionName || 'Unnamed'}**\n`;
        if (func.category) prompt += `   - Category: ${func.category}\n`;
        if (func.page) prompt += `   - Page: ${func.page}\n`;
        if (func.description) {
          const desc = func.description.length > 100 ? func.description.substring(0, 100) + '...' : func.description;
          prompt += `   - Description: ${desc}\n`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }

    if (context.automation.recentRules && context.automation.recentRules.length > 0) {
      prompt += `### Recent Automation Rules (${context.automation.recentRules.length} rules)\n`;
      context.automation.recentRules.slice(0, 5).forEach((rule, idx) => {
        prompt += `${idx + 1}. **${rule.name || rule.functionName || 'Unnamed Rule'}**\n`;
        prompt += `   - Status: ${rule.enabled ? 'Enabled' : 'Disabled'}\n`;
        if (rule.functionName) prompt += `   - Function: ${rule.functionName}\n`;
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Indexed Files context - comprehensive indexed files information
  if (context.indexedFiles) {
    prompt += `## Indexed Files Context\n\n`;
    
    if (context.indexedFiles.summary) {
      const summary = context.indexedFiles.summary;
      prompt += `### Indexed Files Summary\n`;
      prompt += `- Total Indexes: ${summary.totalIndexes || 0}\n`;
      prompt += `- Total Files Indexed: ${summary.totalFiles || 0}\n`;
      
      if (summary.filesByType && Object.keys(summary.filesByType).length > 0) {
        prompt += `- Files by Type:\n`;
        Object.entries(summary.filesByType).slice(0, 8).forEach(([type, count]) => {
          prompt += `  - ${type}: ${count}\n`;
        });
      }
      prompt += '\n';
    }

    if (context.indexedFiles.recentIndexes && context.indexedFiles.recentIndexes.length > 0) {
      prompt += `### Recent Indexed Files (${context.indexedFiles.recentIndexes.length} indexes)\n`;
      context.indexedFiles.recentIndexes.slice(0, 10).forEach((index, idx) => {
        prompt += `${idx + 1}. **${index.name || index.path || 'Unnamed Index'}**\n`;
        if (index.path) prompt += `   - Path: ${index.path}\n`;
        if (index.type) prompt += `   - Type: ${index.type}\n`;
        if (index.files && Array.isArray(index.files)) {
          prompt += `   - Files: ${index.files.length} files\n`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Messages/Conversations context - comprehensive messaging information
  if (context.messages) {
    prompt += `## Messages & Conversations Context\n\n`;
    
    if (context.messages.summary) {
      const summary = context.messages.summary;
      prompt += `### Messages Summary\n`;
      prompt += `- Total Conversations: ${summary.totalConversations || 0}\n`;
      prompt += `- Total Unread Messages: ${summary.totalUnread || 0}\n`;
      prompt += '\n';
    }

    if (context.messages.recentConversations && context.messages.recentConversations.length > 0) {
      prompt += `### Recent Conversations (${context.messages.recentConversations.length} conversations)\n`;
      context.messages.recentConversations.slice(0, 10).forEach((conv, idx) => {
        prompt += `${idx + 1}. **${conv.title || conv.name || 'Unnamed Conversation'}**\n`;
        if (conv.participants && Array.isArray(conv.participants)) {
          prompt += `   - Participants: ${conv.participants.length} participant(s)\n`;
        }
        if (conv.unreadCount && typeof conv.unreadCount === 'object') {
          const unread = Object.values(conv.unreadCount).reduce((sum: number, count: unknown) => {
            const numCount = typeof count === 'number' ? count : 0;
            return sum + numCount;
          }, 0) as number;
          if (unread > 0) prompt += `   - Unread: ${unread} message(s)\n`;
        }
        if (conv.lastMessage) {
          const lastMsg = conv.lastMessage.length > 80 ? conv.lastMessage.substring(0, 80) + '...' : conv.lastMessage;
          prompt += `   - Last Message: ${lastMsg}\n`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  // Licensing Budget Tracker context - comprehensive licensing budget information
  if (context.licensingBudget) {
    prompt += `## Licensing Budget Tracker Context\n\n`;
    
    if (context.licensingBudget.summary) {
      const summary = context.licensingBudget.summary;
      prompt += `### Licensing Budget Summary\n`;
      prompt += `- Total Licenses: ${summary.totalLicenses || 0}\n`;
      prompt += `- Total Budget: $${(summary.totalBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      prompt += `- Cleared Budget (Signed): $${(summary.clearedBudget || summary.signedBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      prompt += `- Pending Budget: $${(summary.pendingBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      prompt += `- Draft Budget: $${(summary.draftBudget || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      
      if (summary.licensesByStatus && Object.keys(summary.licensesByStatus).length > 0) {
        prompt += `- Licenses by Status:\n`;
        Object.entries(summary.licensesByStatus).slice(0, 6).forEach(([status, count]) => {
          prompt += `  - ${status}: ${count} license(s)\n`;
        });
      }
      
      if (summary.budgetByShow && Object.keys(summary.budgetByShow).length > 0) {
        prompt += `- Budget by Show:\n`;
        Object.entries(summary.budgetByShow)
          .sort((a: any, b: any) => b[1].budget - a[1].budget)
          .slice(0, 8)
          .forEach(([show, data]: [string, any]) => {
            prompt += `  - ${show}: $${data.budget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${data.count} licenses)\n`;
          });
      }
      
      if (summary.budgetByLicensor && Object.keys(summary.budgetByLicensor).length > 0) {
        prompt += `- Top Licensors:\n`;
        Object.entries(summary.budgetByLicensor)
          .sort((a: any, b: any) => b[1].budget - a[1].budget)
          .slice(0, 5)
          .forEach(([licensor, data]: [string, any]) => {
            prompt += `  - ${licensor}: $${data.budget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${data.count} licenses)\n`;
          });
      }
      prompt += '\n';
    }

    if (context.licensingBudget.recentLicenses && context.licensingBudget.recentLicenses.length > 0) {
      prompt += `### Recent Licenses (${context.licensingBudget.recentLicenses.length} licenses)\n`;
      context.licensingBudget.recentLicenses.slice(0, 10).forEach((license, idx) => {
        prompt += `${idx + 1}. **${license.clipTitle || 'Unnamed License'}**\n`;
        prompt += `   - Status: ${license.status || 'Unknown'}\n`;
        if (license.fee) prompt += `   - Fee: $${license.fee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        if (license.licensor) prompt += `   - Licensor: ${license.licensor}\n`;
        if (license.showName || license.show) prompt += `   - Show: ${license.showName || license.show}\n`;
        if (license.territory) prompt += `   - Territory: ${license.territory}\n`;
        if (license.signedDate) {
          const date = license.signedDate?.toDate ? license.signedDate.toDate() : new Date(license.signedDate);
          prompt += `   - Signed: ${date.toLocaleDateString('en-US')}\n`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }
  }

  return prompt;
}

