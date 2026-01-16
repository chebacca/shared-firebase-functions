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
    const sessionsSnapshot = await getDb().collection('sessionWorkflows')
      .where('organizationId', '==', organizationId)
      .where('status', 'in', ['ACTIVE', 'PENDING'])
      .limit(20)
      .get();
    
    const sessionWorkflows = sessionsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        sessionId: data.sessionId || '',
        sessionName: data.sessionName || '',
        workflowName: data.workflowName || data.name || '',
        status: data.status || 'PENDING',
        progress: data.progress || 0,
        stepCount: data.stepCount || 0,
        completedSteps: data.completedSteps || 0
      };
    });
    
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

