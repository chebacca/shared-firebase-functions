/**
 * Workflow Data Fetcher
 * 
 * Fetches real workflow data from Firestore for AI context
 * CRITICAL: All functions query actual Firestore collections
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

const db = getFirestore();

export interface WorkflowAction {
  id: string;
  entityType: 'pitch' | 'story' | 'show' | 'season';
  entityId: string;
  action: string;
  performedBy: string;
  performedByName?: string;
  timestamp: admin.firestore.Timestamp;
  metadata?: any;
}

export interface AutomationRule {
  id: string;
  functionId: string;
  functionName: string;
  enabled: boolean;
  triggers: {
    email?: any;
    message?: any;
    notification?: any;
  };
  createdAt: admin.firestore.Timestamp;
}

export interface ExecutionLog {
  id: string;
  functionId: string;
  functionName: string;
  status: 'success' | 'partial' | 'error';
  executedAt: admin.firestore.Timestamp;
  context?: any;
}

/**
 * Fetch current pitch data
 */
export async function fetchCurrentPitch(pitchId: string, organizationId: string): Promise<any | null> {
  try {
    const pitchDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('pitches')
      .doc(pitchId)
      .get();

    if (!pitchDoc.exists) {
      return null;
    }

    return {
      id: pitchDoc.id,
      ...pitchDoc.data()
    };
  } catch (error) {
    console.error('Error fetching pitch:', error);
    throw new Error(`Failed to fetch pitch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch current story data
 */
export async function fetchCurrentStory(storyId: string, organizationId: string): Promise<any | null> {
  try {
    const storyDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('stories')
      .doc(storyId)
      .get();

    if (!storyDoc.exists) {
      return null;
    }

    return {
      id: storyDoc.id,
      ...storyDoc.data()
    };
  } catch (error) {
    console.error('Error fetching story:', error);
    throw new Error(`Failed to fetch story: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch workflow history for an entity
 */
export async function fetchWorkflowHistory(
  entityId: string,
  entityType: 'pitch' | 'story' | 'show' | 'season',
  organizationId: string,
  limit: number = 50
): Promise<WorkflowAction[]> {
  try {
    const workflowActionsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('workflowActions');

    const query = workflowActionsRef
      .where('entityId', '==', entityId)
      .where('entityType', '==', entityType)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    const snapshot = await query.get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as WorkflowAction[];
  } catch (error) {
    console.error('Error fetching workflow history:', error);
    return [];
  }
}

/**
 * Fetch automation rules for organization
 */
export async function fetchAutomationRules(organizationId: string): Promise<AutomationRule[]> {
  try {
    const rulesRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('automationRules');

    const snapshot = await rulesRef.where('enabled', '==', true).get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as AutomationRule[];
  } catch (error) {
    console.error('Error fetching automation rules:', error);
    return [];
  }
}

/**
 * Fetch execution logs for organization
 */
export async function fetchExecutionLogs(
  organizationId: string,
  limit: number = 100
): Promise<ExecutionLog[]> {
  try {
    const logsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('automationExecutionLogs');

    const snapshot = await logsRef
      .orderBy('executedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ExecutionLog[];
  } catch (error) {
    console.error('Error fetching execution logs:', error);
    return [];
  }
}

/**
 * Fetch user role information
 */
export async function fetchUserRole(userId: string, organizationId: string): Promise<any | null> {
  try {
    const userDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('teamMembers')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      return null;
    }

    return {
      id: userDoc.id,
      ...userDoc.data()
    };
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

/**
 * Fetch team members for organization
 */
export async function fetchTeamMembers(organizationId: string): Promise<any[]> {
  try {
    const teamRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('teamMembers');

    const snapshot = await teamRef.get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching team members:', error);
    return [];
  }
}

/**
 * Fetch recent pitches for organization
 */
export async function fetchRecentPitches(organizationId: string, limit: number = 20): Promise<any[]> {
  try {
    const pitchesRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('pitches');

    const snapshot = await pitchesRef
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching recent pitches:', error);
    return [];
  }
}

/**
 * Fetch recent stories for organization
 */
export async function fetchRecentStories(organizationId: string, limit: number = 20): Promise<any[]> {
  try {
    const storiesRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('stories');

    const snapshot = await storiesRef
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching recent stories:', error);
    return [];
  }
}

/**
 * Fetch projects for organization
 */
export async function fetchProjects(organizationId: string, limit: number = 50): Promise<any[]> {
  try {
    const projectsRef = db.collection('projects');
    const snapshot = await projectsRef
      .where('organizationId', '==', organizationId)
      .limit(limit)
      .get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return [];
  }
}

/**
 * Fetch budget data for projects (budget values, groups, and calculations)
 */
export async function fetchProjectBudgets(organizationId: string, projectIds: string[]): Promise<Map<string, any>> {
  const budgetMap = new Map<string, any>();
  
  if (!projectIds || projectIds.length === 0) {
    return budgetMap;
  }

  try {
    // Fetch budget values
    const budgetValuesRef = db.collection('budget-values');
    const budgetValuesSnapshot = await budgetValuesRef
      .where('organizationId', '==', organizationId)
      .where('projectId', 'in', projectIds.length > 10 ? projectIds.slice(0, 10) : projectIds)
      .get();

    // Fetch budget groups
    const budgetGroupsRef = db.collection('budget-groups');
    const budgetGroupsSnapshot = await budgetGroupsRef
      .where('organizationId', '==', organizationId)
      .where('projectId', 'in', projectIds.length > 10 ? projectIds.slice(0, 10) : projectIds)
      .get();

    // Fetch budget calculations
    const budgetCalculationsRef = db.collection('budget-calculations');
    const budgetCalculationsSnapshot = await budgetCalculationsRef
      .where('organizationId', '==', organizationId)
      .where('projectId', 'in', projectIds.length > 10 ? projectIds.slice(0, 10) : projectIds)
      .get();

    // Organize by project ID
    budgetValuesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const projectId = data.projectId;
      if (!budgetMap.has(projectId)) {
        budgetMap.set(projectId, {});
      }
      budgetMap.get(projectId).values = { id: doc.id, ...data };
    });

    budgetGroupsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const projectId = data.projectId;
      if (!budgetMap.has(projectId)) {
        budgetMap.set(projectId, {});
      }
      if (!budgetMap.get(projectId).groups) {
        budgetMap.get(projectId).groups = [];
      }
      budgetMap.get(projectId).groups.push({ id: doc.id, ...data });
    });

    budgetCalculationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const projectId = data.projectId;
      if (!budgetMap.has(projectId)) {
        budgetMap.set(projectId, {});
      }
      budgetMap.get(projectId).calculations = { id: doc.id, ...data };
    });

    // Fetch licenses for budget analysis (if available)
    const licensesRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('licenses');
    
    // Get licenses for projects (approximate - licenses may reference pitches/stories that link to projects)
    const licensesSnapshot = await licensesRef.limit(100).get();
    const projectLicenses = new Map<string, any[]>();
    
    licensesSnapshot.docs.forEach(doc => {
      const license = doc.data();
      // Try to match by pitch/story if project info is available
      // This is approximate - ideally we'd have direct project references
      if (license.pitchId || license.storyId) {
        // For now, we'll aggregate all licenses
        // In a real implementation, you'd fetch pitches/stories to get project IDs
      }
    });

    return budgetMap;
  } catch (error) {
    console.error('Error fetching project budgets:', error);
    return budgetMap;
  }
}

/**
 * Fetch budget summary across all projects for organization
 */
export async function fetchBudgetSummary(organizationId: string): Promise<any> {
  try {
    const projects = await fetchProjects(organizationId, 100);
    const projectIds = projects.map(p => p.id);
    
    if (projectIds.length === 0) {
      return {
        totalProjects: 0,
        totalBudget: 0,
        totalSpent: 0,
        projectsWithBudgets: 0
      };
    }

    const budgetMap = await fetchProjectBudgets(organizationId, projectIds);
    
    let totalBudget = 0;
    let totalSpent = 0;
    let projectsWithBudgets = 0;

    budgetMap.forEach((budgetData, projectId) => {
      if (budgetData.values) {
        const productionBudget = budgetData.values.productionBudget || 0;
        const postProductionBudget = budgetData.values.postProductionBudget || 0;
        totalBudget += productionBudget + postProductionBudget;
        projectsWithBudgets++;
      }
      
      if (budgetData.calculations) {
        totalSpent += budgetData.calculations.budgetUsed || 0;
      }
    });

    return {
      totalProjects: projects.length,
      totalBudget,
      totalSpent,
      budgetRemaining: totalBudget - totalSpent,
      projectsWithBudgets,
      projects: projects.slice(0, 10).map(p => ({
        id: p.id,
        name: p.name,
        budget: budgetMap.get(p.id)?.values || null,
        calculations: budgetMap.get(p.id)?.calculations || null
      }))
    };
  } catch (error) {
    console.error('Error fetching budget summary:', error);
    return {
      totalProjects: 0,
      totalBudget: 0,
      totalSpent: 0,
      projectsWithBudgets: 0
    };
  }
}

/**
 * Fetch calendar events for organization
 */
export async function fetchCalendarEvents(
  organizationId: string, 
  limit: number = 50,
  startDate?: Date,
  endDate?: Date
): Promise<any[]> {
  try {
    const eventsRef = db.collection('calendarEvents');
    let query: admin.firestore.Query = eventsRef.where('organizationId', '==', organizationId);

    if (startDate) {
      query = query.where('startDate', '>=', admin.firestore.Timestamp.fromDate(startDate));
    }

    if (endDate) {
      query = query.where('startDate', '<=', admin.firestore.Timestamp.fromDate(endDate));
    }

    // Try to order by startDate, but if it fails (due to missing index), fetch without ordering
    try {
      const snapshot = await query
        .orderBy('startDate', 'asc')
        .limit(limit)
        .get();

      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as { id: string; startDate?: any; [key: string]: any }));
      
      // Sort client-side if we got results (as fallback)
      return events.sort((a, b) => {
        const dateA = a.startDate?.toDate ? a.startDate.toDate().getTime() : new Date(a.startDate).getTime();
        const dateB = b.startDate?.toDate ? b.startDate.toDate().getTime() : new Date(b.startDate).getTime();
        return dateA - dateB;
      });
    } catch (orderError) {
      // If orderBy fails (likely missing index), fetch without ordering and sort client-side
      console.warn('Could not order by startDate, fetching and sorting client-side:', orderError);
      const snapshot = await query.limit(limit).get();
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as { id: string; startDate?: any; [key: string]: any }));
      
      return events.sort((a, b) => {
        const dateA = a.startDate?.toDate ? a.startDate.toDate().getTime() : new Date(a.startDate).getTime();
        const dateB = b.startDate?.toDate ? b.startDate.toDate().getTime() : new Date(b.startDate).getTime();
        return dateA - dateB;
      });
    }
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return [];
  }
}

/**
 * Fetch upcoming calendar events (next 30 days)
 */
export async function fetchUpcomingCalendarEvents(organizationId: string, days: number = 30): Promise<any[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(now.getDate() + days);
  
  return await fetchCalendarEvents(organizationId, 50, now, futureDate);
}

/**
 * Fetch contacts for organization
 */
export async function fetchContacts(organizationId: string, limit: number = 50): Promise<any[]> {
  try {
    const contactsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('contacts');
    
    const snapshot = await contactsRef.limit(limit).get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return [];
  }
}

/**
 * Fetch contacts summary (counts by role, department, etc.)
 */
export async function fetchContactsSummary(organizationId: string): Promise<any> {
  try {
    const contacts = await fetchContacts(organizationId, 200);
    
    // Count by role
    const contactsByRole = new Map<string, number>();
    const contactsByDepartment = new Map<string, number>();
    const contactsByPod = new Map<string, number>();
    
    contacts.forEach(contact => {
      const role = contact.role || 'Unassigned';
      contactsByRole.set(role, (contactsByRole.get(role) || 0) + 1);
      
      if (contact.department) {
        contactsByDepartment.set(contact.department, (contactsByDepartment.get(contact.department) || 0) + 1);
      }
      
      if (contact.pod) {
        contactsByPod.set(contact.pod, (contactsByPod.get(contact.pod) || 0) + 1);
      }
    });
    
    return {
      totalContacts: contacts.length,
      contactsByRole: Object.fromEntries(contactsByRole),
      contactsByDepartment: Object.fromEntries(contactsByDepartment),
      contactsByPod: Object.fromEntries(contactsByPod),
      recentContacts: contacts.slice(0, 10)
    };
  } catch (error) {
    console.error('Error fetching contacts summary:', error);
    return {
      totalContacts: 0,
      contactsByRole: {},
      contactsByDepartment: {},
      contactsByPod: {},
      recentContacts: []
    };
  }
}

/**
 * Fetch automation functions for organization
 */
export async function fetchAutomationFunctions(organizationId: string): Promise<any[]> {
  try {
    // Automation functions are typically stored in a global collection, but may be scoped to org
    const functionsRef = db.collection('automationFunctions');
    const snapshot = await functionsRef.limit(50).get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching automation functions:', error);
    return [];
  }
}

/**
 * Fetch automation summary (functions, rules, execution stats)
 */
export async function fetchAutomationSummary(organizationId: string): Promise<any> {
  try {
    const [functions, rules] = await Promise.all([
      fetchAutomationFunctions(organizationId),
      fetchAutomationRules(organizationId)
    ]);
    
    // Count enabled vs disabled rules
    const enabledRules = rules.filter(r => r.enabled).length;
    const disabledRules = rules.filter(r => !r.enabled).length;
    
    // Group rules by function
    const rulesByFunction = new Map<string, number>();
    rules.forEach(rule => {
      const functionId = rule.functionId || 'unknown';
      rulesByFunction.set(functionId, (rulesByFunction.get(functionId) || 0) + 1);
    });
    
    // Get recent execution logs
    const recentLogs = await fetchExecutionLogs(organizationId, 10);
    
    return {
      totalFunctions: functions.length,
      totalRules: rules.length,
      enabledRules,
      disabledRules,
      rulesByFunction: Object.fromEntries(rulesByFunction),
      recentExecutionLogs: recentLogs.slice(0, 5),
      functions: functions.slice(0, 10)
    };
  } catch (error) {
    console.error('Error fetching automation summary:', error);
    return {
      totalFunctions: 0,
      totalRules: 0,
      enabledRules: 0,
      disabledRules: 0,
      rulesByFunction: {},
      recentExecutionLogs: [],
      functions: []
    };
  }
}

/**
 * Fetch indexed files for organization (file indexing data)
 */
export async function fetchIndexedFiles(organizationId: string, limit: number = 50): Promise<any[]> {
  try {
    // Indexed files are typically stored in localIndexes or indexedFiles collections
    // Check both possible collection names
    let snapshot;
    
    try {
      const indexedFilesRef = db
        .collection('organizations')
        .doc(organizationId)
        .collection('localIndexes');
      snapshot = await indexedFilesRef.limit(limit).get();
    } catch (error) {
      // Try alternative collection name
      try {
        const indexedFilesRef = db
          .collection('organizations')
          .doc(organizationId)
          .collection('indexedFiles');
        snapshot = await indexedFilesRef.limit(limit).get();
      } catch (altError) {
        console.warn('Could not find indexed files collection:', altError);
        return [];
      }
    }
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching indexed files:', error);
    return [];
  }
}

/**
 * Fetch conversations for organization
 */
export async function fetchConversations(organizationId: string, limit: number = 50): Promise<any[]> {
  try {
    const conversationsRef = db.collection('conversations');
    const snapshot = await conversationsRef
      .where('organizationId', '==', organizationId)
      .limit(limit)
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
}

/**
 * Fetch licenses for organization
 */
export async function fetchLicenses(organizationId: string, limit: number = 100): Promise<any[]> {
  try {
    const licensesRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('licenses');
    
    const snapshot = await licensesRef.limit(limit).get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    // Try alternative collection name (clipShowLicenses)
    try {
      const licensesRef = db.collection('clipShowLicenses');
      const snapshot = await licensesRef
        .where('organizationId', '==', organizationId)
        .limit(limit)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (altError) {
      console.error('Error fetching licenses:', altError);
      return [];
    }
  }
}

/**
 * Fetch licensing budget summary (license fees by status, show, etc.)
 */
export async function fetchLicensingBudgetSummary(organizationId: string): Promise<any> {
  try {
    const licenses = await fetchLicenses(organizationId, 500);
    
    // Calculate totals by status
    let totalBudget = 0;
    let signedBudget = 0;
    let pendingBudget = 0;
    let draftBudget = 0;
    let expiredBudget = 0;
    let cancelledBudget = 0;
    
    // Count by status
    const licensesByStatus = new Map<string, number>();
    const budgetByStatus = new Map<string, number>();
    
    // Budget by show
    const budgetByShow = new Map<string, { budget: number; count: number }>();
    
    // Budget by licensor
    const budgetByLicensor = new Map<string, { budget: number; count: number }>();
    
    licenses.forEach(license => {
      const fee = license.fee || 0;
      const status = license.status || 'Draft';
      
      totalBudget += fee;
      
      // Sum by status
      if (status === 'Signed') {
        signedBudget += fee;
      } else if (status === 'Pending') {
        pendingBudget += fee;
      } else if (status === 'Draft') {
        draftBudget += fee;
      } else if (status === 'Expired') {
        expiredBudget += fee;
      } else if (status === 'Cancelled') {
        cancelledBudget += fee;
      }
      
      // Count by status
      licensesByStatus.set(status, (licensesByStatus.get(status) || 0) + 1);
      budgetByStatus.set(status, (budgetByStatus.get(status) || 0) + fee);
      
      // Group by show (if available via pitch)
      if (license.showName || license.show) {
        const showName = license.showName || license.show;
        const existing = budgetByShow.get(showName) || { budget: 0, count: 0 };
        budgetByShow.set(showName, {
          budget: existing.budget + fee,
          count: existing.count + 1
        });
      }
      
      // Group by licensor
      if (license.licensor) {
        const existing = budgetByLicensor.get(license.licensor) || { budget: 0, count: 0 };
        budgetByLicensor.set(license.licensor, {
          budget: existing.budget + fee,
          count: existing.count + 1
        });
      }
    });
    
    // Get recent licenses
    const recentLicenses = licenses
      .sort((a, b) => {
        const dateA = a.signedDate?.toDate ? a.signedDate.toDate().getTime() : 
                     a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() :
                     new Date(a.createdAt || 0).getTime();
        const dateB = b.signedDate?.toDate ? b.signedDate.toDate().getTime() : 
                     b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() :
                     new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      })
      .slice(0, 10);
    
    return {
      totalLicenses: licenses.length,
      totalBudget,
      signedBudget,
      pendingBudget,
      draftBudget,
      expiredBudget,
      cancelledBudget,
      clearedBudget: signedBudget, // Signed = Cleared
      licensesByStatus: Object.fromEntries(licensesByStatus),
      budgetByStatus: Object.fromEntries(budgetByStatus),
      budgetByShow: Object.fromEntries(budgetByShow),
      budgetByLicensor: Object.fromEntries(budgetByLicensor),
      recentLicenses: recentLicenses.slice(0, 10)
    };
  } catch (error) {
    console.error('Error fetching licensing budget summary:', error);
    return {
      totalLicenses: 0,
      totalBudget: 0,
      signedBudget: 0,
      pendingBudget: 0,
      draftBudget: 0,
      expiredBudget: 0,
      cancelledBudget: 0,
      clearedBudget: 0,
      licensesByStatus: {},
      budgetByStatus: {},
      budgetByShow: {},
      budgetByLicensor: {},
      recentLicenses: []
    };
  }
}

/**
 * Fetch conversations summary (counts, unread, etc.)
 */
export async function fetchConversationsSummary(organizationId: string): Promise<any> {
  try {
    const conversations = await fetchConversations(organizationId, 100);
    
    let totalUnread = 0;
    conversations.forEach(conv => {
      if (conv.unreadCount && typeof conv.unreadCount === 'object') {
        const unreadCount = Object.values(conv.unreadCount).reduce((sum: number, count: unknown) => {
          const numCount = typeof count === 'number' ? count : 0;
          return sum + numCount;
        }, 0) as number;
        totalUnread += unreadCount;
      }
    });
    
    return {
      totalConversations: conversations.length,
      totalUnread,
      recentConversations: conversations.slice(0, 10)
    };
  } catch (error) {
    console.error('Error fetching conversations summary:', error);
    return {
      totalConversations: 0,
      totalUnread: 0,
      recentConversations: []
    };
  }
}

/**
 * Fetch indexed files summary (file counts, types, etc.)
 */
export async function fetchIndexedFilesSummary(organizationId: string): Promise<any> {
  try {
    const indexedFiles = await fetchIndexedFiles(organizationId, 200);
    
    // Count by file type
    const filesByType = new Map<string, number>();
    let totalFiles = 0;
    
    indexedFiles.forEach(index => {
      // Indexes may contain files array or individual file data
      if (index.files && Array.isArray(index.files)) {
        totalFiles += index.files.length;
        index.files.forEach((file: any) => {
          const type = file.type || 'unknown';
          filesByType.set(type, (filesByType.get(type) || 0) + 1);
        });
      } else if (index.type) {
        totalFiles++;
        const type = index.type;
        filesByType.set(type, (filesByType.get(type) || 0) + 1);
      }
    });
    
    return {
      totalIndexes: indexedFiles.length,
      totalFiles,
      filesByType: Object.fromEntries(filesByType),
      recentIndexes: indexedFiles.slice(0, 10)
    };
  } catch (error) {
    console.error('Error fetching indexed files summary:', error);
    return {
      totalIndexes: 0,
      totalFiles: 0,
      filesByType: {},
      recentIndexes: []
    };
  }
}

/**
 * Fetch calendar events summary (counts by type, upcoming events, etc.)
 */
export async function fetchCalendarSummary(organizationId: string): Promise<any> {
  try {
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);
    const nextMonth = new Date();
    nextMonth.setMonth(now.getMonth() + 1);

    // Fetch all events (limited)
    const allEvents = await fetchCalendarEvents(organizationId, 100);
    const upcomingEvents = await fetchUpcomingCalendarEvents(organizationId, 30);

    // Count by event type
    const eventsByType = new Map<string, number>();
    allEvents.forEach(event => {
      const eventType = event.eventType || 'other';
      eventsByType.set(eventType, (eventsByType.get(eventType) || 0) + 1);
    });

    // Count by workflow type
    const eventsByWorkflowType = new Map<string, number>();
    allEvents.forEach(event => {
      if (event.workflowType) {
        eventsByWorkflowType.set(event.workflowType, (eventsByWorkflowType.get(event.workflowType) || 0) + 1);
      }
    });

    return {
      totalEvents: allEvents.length,
      upcomingEventsCount: upcomingEvents.length,
      upcomingEvents: upcomingEvents.slice(0, 10),
      eventsByType: Object.fromEntries(eventsByType),
      eventsByWorkflowType: Object.fromEntries(eventsByWorkflowType),
      eventsThisWeek: allEvents.filter(e => {
        const eventDate = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate);
        return eventDate >= now && eventDate <= nextWeek;
      }).length,
      eventsThisMonth: allEvents.filter(e => {
        const eventDate = e.startDate?.toDate ? e.startDate.toDate() : new Date(e.startDate);
        return eventDate >= now && eventDate <= nextMonth;
      }).length
    };
  } catch (error) {
    console.error('Error fetching calendar summary:', error);
    return {
      totalEvents: 0,
      upcomingEventsCount: 0,
      upcomingEvents: [],
      eventsByType: {},
      eventsByWorkflowType: {},
      eventsThisWeek: 0,
      eventsThisMonth: 0
    };
  }
}

