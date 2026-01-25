/**
 * PWS Workflow Context Service
 * 
 * Provides read-only access to Production Workflow System (PWS) workflow data
 * for the CNS Master Agent. This service queries workflow templates, user workflows,
 * and session workflows for analysis and reporting.
 */

import { getFirestore } from 'firebase-admin/firestore';

// Initialize getDb() lazily
const getDb = () => getFirestore();

export interface PWSWorkflowContext {
  // Templates available
  templates: Array<{
    id: string;
    name: string;
    category: string;
    nodeCount: number;
    isPublic: boolean;
    usageCount: number;
    createdAt?: any;
    updatedAt?: any;
  }>;

  // Active session workflows
  sessionWorkflows: Array<{
    sessionId: string;
    sessionName: string;
    workflowName: string;
    status: string;
    progress: number;
    stepCount: number;
    completedSteps: number;
  }>;

  // User-created workflows
  userWorkflows: Array<{
    id: string;
    name: string;
    createdBy: string;
    nodeCount: number;
    edgeCount: number;
    isTemplate: boolean;
    createdAt?: any;
  }>;

  // Statistics
  statistics: {
    totalTemplates: number;
    totalActiveWorkflows: number;
    averageWorkflowComplexity: number;
    mostUsedTemplate: string;
  };
}

/**
 * Gather PWS workflow context for an organization
 * 
 * This is a READ-ONLY service for querying workflow data.
 * All write operations must go through PWS Workflow Architect.
 */
export async function gatherPWSWorkflowContext(
  organizationId: string
): Promise<PWSWorkflowContext> {
  try {
    // Query templates (read-only)
    const templatesSnapshot = await getDb().collection('workflow-templates')
      .where('organizationId', '==', organizationId)
      .limit(50)
      .get();

    const templates = templatesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        category: data.category || 'general',
        nodeCount: data.nodes?.length || 0,
        isPublic: data.isPublic || false,
        usageCount: data.usageCount || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
    });

    // Query session workflows (read-only)
    // Query session workflows from multiple potential collections
    // Frontend uses 'sessions', so we prioritize that. 
    // Also keeping 'sessionWorkflows' etc. for legacy/migration safety.
    const collectionsToQuery = ['sessions', 'sessionWorkflows', 'session_workflows', 'workflow-sessions'];
    const allSessions: any[] = [];

    console.log(`[PWSWorkflowContextService] Querying multiple collections for org ${organizationId}: ${collectionsToQuery.join(', ')}`);

    for (const collectionName of collectionsToQuery) {
      try {
        console.log(`[PWSWorkflowContextService] Querying ${collectionName}...`);

        // Debug query first (small limit)
        const debugSnap = await getDb().collection(collectionName)
          .where('organizationId', '==', organizationId)
          .limit(1).get();

        if (!debugSnap.empty) {
          console.log(`[PWSWorkflowContextService] Found data in ${collectionName}! Sample ID: ${debugSnap.docs[0].id}`);
        }

        let query = getDb().collection(collectionName).where('organizationId', '==', organizationId);

        // If querying 'sessions' collection specifically, we might need to be careful with status
        // The frontend service doesn't filter by status in getSessions(), it fetches ALL.
        // We will fetch all for 'sessions' collection to be safe, then filter in memory if needed.
        // For other collections, we keep the status filter to avoid junk.
        if (collectionName !== 'sessions') {
          query = query.where('status', 'in', ['ACTIVE', 'PENDING', 'active', 'pending', 'IN_PROGRESS', 'in_progress', 'PRE_PRODUCTION', 'PRODUCTION', 'POST_PRODUCTION', 'DELIVERY']);
        }

        const snapshot = await query.limit(50).get();

        snapshot.docs.forEach(doc => {
          const d = doc.data() as any;
          // Avoid duplicates if IDs clash
          if (!allSessions.find(s => s.sessionId === (d.sessionId || doc.id))) {
            // Map 'sessions' data structure to the expected format
            // specific mapping for 'sessions' collection which uses 'title' instead of 'workflowName' often
            let workflowName = d.workflowName || d.name || d.title || 'Unnamed Workflow';
            let sessionName = d.sessionName || d.title || d.name || 'Unnamed Session';

            // If it's from 'sessions', the document ID IS the session ID.
            const sessionId = d.sessionId || doc.id;

            allSessions.push({
              sessionId: sessionId,
              sessionName: sessionName,
              workflowName: workflowName,
              status: d.status || 'PENDING',
              progress: d.progress || 0,
              stepCount: d.stepCount || 0,
              completedSteps: d.completedSteps || 0
            });
          }
        });

        console.log(`[PWSWorkflowContextService] Found ${snapshot.size} docs in ${collectionName}`);
      } catch (err) {
        console.warn(`[PWSWorkflowContextService] Error querying ${collectionName}:`, err);
      }
    }

    const sessionWorkflows = allSessions;

    // Query user workflows (read-only)
    const userWorkflowsSnapshot = await getDb().collection('user-workflows')
      .where('organizationId', '==', organizationId)
      .limit(30)
      .get();

    const userWorkflows = userWorkflowsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        createdBy: data.userId || '',
        nodeCount: data.nodes?.length || 0,
        edgeCount: data.edges?.length || 0,
        isTemplate: data.metadata?.isTemplate || false,
        createdAt: data.createdAt
      };
    });

    // Calculate statistics
    const totalTemplates = templates.length;
    const totalActiveWorkflows = sessionWorkflows.length;
    const averageWorkflowComplexity = templates.length > 0
      ? templates.reduce((sum, t) => sum + t.nodeCount, 0) / templates.length
      : 0;

    // Find most used template
    const mostUsedTemplate = templates.length > 0
      ? templates.reduce((max, t) => t.usageCount > max.usageCount ? t : max, templates[0]).name
      : '';

    return {
      templates,
      sessionWorkflows,
      userWorkflows,
      statistics: {
        totalTemplates,
        totalActiveWorkflows,
        averageWorkflowComplexity,
        mostUsedTemplate
      }
    };
  } catch (error: any) {
    console.error('[PWSWorkflowContextService] Error gathering context:', error);
    // Return empty context on error
    return {
      templates: [],
      sessionWorkflows: [],
      userWorkflows: [],
      statistics: {
        totalTemplates: 0,
        totalActiveWorkflows: 0,
        averageWorkflowComplexity: 0,
        mostUsedTemplate: ''
      }
    };
  }
}

