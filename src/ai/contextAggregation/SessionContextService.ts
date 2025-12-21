/**
 * Session Context Service
 * 
 * Gathers session information for workflow creation context.
 * Provides session status, phase, existing workflows, and team assignments.
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface SessionContext {
  // Current session information (if sessionId provided)
  currentSession?: {
    id: string;
    name: string;
    status: string;
    phase: string;
    workflowStage?: string;
    teamMembers?: Array<{
      userId: string;
      roleId: string;
      roleName: string;
    }>;
    deliverables?: Array<{
      id: string;
      name: string;
      type: string;
    }>;
    existingWorkflows?: Array<{
      id: string;
      name: string;
      phase: string;
      status: string;
      progress: number;
    }>;
  };
  
  // Organization-wide session statistics
  statistics: {
    totalSessions: number;
    sessionsByStatus: Record<string, number>;
    sessionsByPhase: Record<string, number>;
    activeWorkflows: number;
  };
}

/**
 * Gather session context for workflow creation
 * 
 * If sessionId is provided, gathers detailed information about that session.
 * Otherwise, gathers organization-wide session statistics.
 */
export async function gatherSessionContext(
  organizationId: string,
  sessionId?: string
): Promise<SessionContext> {
  try {
    const statistics = {
      totalSessions: 0,
      sessionsByStatus: {} as Record<string, number>,
      sessionsByPhase: {} as Record<string, number>,
      activeWorkflows: 0
    };

    // If sessionId provided, get detailed session information
    if (sessionId) {
      let sessionData: any = null;
      try {
        // Get session document
        const sessionDoc = await db.collection('sessions')
          .doc(sessionId)
          .get();
        
        if (!sessionDoc.exists) {
          console.warn(`[SessionContextService] Session ${sessionId} not found`);
          return {
            statistics
          };
        }

        sessionData = sessionDoc.data();
      } catch (error) {
        console.warn(`[SessionContextService] Error fetching session ${sessionId}:`, error);
        // Return with empty statistics if session fetch fails
        return {
          statistics
        };
      }
      
      // Get existing workflow instances for this session (with error handling)
      let existingWorkflows: any[] = [];
      try {
        const workflowInstancesSnapshot = await db.collection('workflowInstances')
          .where('sessionId', '==', sessionId)
          .get();
        
        existingWorkflows = workflowInstancesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || data.workflowName || 'Unnamed Workflow',
            phase: data.phase || data.workflowPhase || 'PRODUCTION',
            status: data.status || 'ACTIVE',
            progress: data.progress || 0
          };
        });
      } catch (error) {
        console.warn('[SessionContextService] Error fetching workflow instances:', error);
        // Continue without workflow instances
      }

      // Get team assignments for this session (with error handling)
      let teamMembers: any[] = [];
      try {
        const assignmentsSnapshot = await db.collection('sessionAssignments')
          .where('sessionId', '==', sessionId)
          .get();
        
        teamMembers = assignmentsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            userId: data.userId || '',
            roleId: data.roleId || '',
            roleName: data.roleName || data.role || ''
          };
        });
      } catch (error) {
        console.warn('[SessionContextService] Error fetching session assignments:', error);
        // Continue without team members
      }

      // Get deliverables for this session (with error handling)
      let deliverables: any[] = [];
      try {
        const deliverablesSnapshot = await db.collection('deliverables')
          .where('sessionId', '==', sessionId)
          .limit(20)
          .get();
        
        deliverables = deliverablesSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || '',
            type: data.type || 'general'
          };
        });
      } catch (error) {
        console.warn('[SessionContextService] Error fetching deliverables:', error);
        // Continue without deliverables
      }

      // Map status to phase
      const statusPhaseMap: Record<string, string> = {
        'PLANNING': 'PRE_PRODUCTION',
        'PLANNED': 'PRE_PRODUCTION',
        'PRE_PRODUCTION': 'PRE_PRODUCTION',
        'PRODUCTION_IN_PROGRESS': 'PRODUCTION',
        'IN_PRODUCTION': 'PRODUCTION',
        'PREPARE_FOR_POST': 'PRODUCTION',
        'READY_FOR_POST': 'POST_PRODUCTION',
        'POST_PRODUCTION': 'POST_PRODUCTION',
        'POST_IN_PROGRESS': 'POST_PRODUCTION',
        'CHANGES_NEEDED': 'POST_PRODUCTION',
        'WAITING_FOR_APPROVAL': 'POST_PRODUCTION',
        'DELIVERY': 'DELIVERY',
        'PHASE_4_POST_PRODUCTION': 'DELIVERY',
        'COMPLETED': 'DELIVERY',
        'ARCHIVED': 'ARCHIVED',
        'CANCELED': 'ARCHIVED',
        'ON_HOLD': 'PRE_PRODUCTION'
      };

      const sessionStatus = sessionData?.status || 'PLANNING';
      const sessionPhase = statusPhaseMap[sessionStatus] || 'PRE_PRODUCTION';

      return {
        currentSession: {
          id: sessionId,
          name: sessionData?.name || sessionData?.sessionName || 'Unnamed Session',
          status: sessionStatus,
          phase: sessionPhase,
          workflowStage: sessionData?.workflowStage || sessionData?.stage,
          teamMembers,
          deliverables,
          existingWorkflows
        },
        statistics
      };
    }

    // Otherwise, gather organization-wide statistics (with error handling)
    try {
      const sessionsSnapshot = await db.collection('sessions')
        .where('organizationId', '==', organizationId)
        .limit(100)
        .get();
      
      statistics.totalSessions = sessionsSnapshot.size;
      
      sessionsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const status = data.status || 'PLANNING';
        statistics.sessionsByStatus[status] = (statistics.sessionsByStatus[status] || 0) + 1;
        
        // Map status to phase for statistics
        const statusPhaseMap: Record<string, string> = {
          'PLANNING': 'PRE_PRODUCTION',
          'PLANNED': 'PRE_PRODUCTION',
          'PRE_PRODUCTION': 'PRE_PRODUCTION',
          'PRODUCTION_IN_PROGRESS': 'PRODUCTION',
          'IN_PRODUCTION': 'PRODUCTION',
          'PREPARE_FOR_POST': 'PRODUCTION',
          'READY_FOR_POST': 'POST_PRODUCTION',
          'POST_PRODUCTION': 'POST_PRODUCTION',
          'POST_IN_PROGRESS': 'POST_PRODUCTION',
          'CHANGES_NEEDED': 'POST_PRODUCTION',
          'WAITING_FOR_APPROVAL': 'POST_PRODUCTION',
          'DELIVERY': 'DELIVERY',
          'PHASE_4_POST_PRODUCTION': 'DELIVERY',
          'COMPLETED': 'DELIVERY',
          'ARCHIVED': 'ARCHIVED',
          'CANCELED': 'ARCHIVED',
          'ON_HOLD': 'PRE_PRODUCTION'
        };
        
        const phase = statusPhaseMap[status] || 'PRE_PRODUCTION';
        statistics.sessionsByPhase[phase] = (statistics.sessionsByPhase[phase] || 0) + 1;
      });
    } catch (error) {
      console.warn('[SessionContextService] Error fetching session statistics:', error);
      // Continue with empty statistics
    }

    // Get active workflow instances count (with error handling)
    try {
      const activeWorkflowsSnapshot = await db.collection('workflowInstances')
        .where('organizationId', '==', organizationId)
        .where('status', 'in', ['ACTIVE', 'IN_PROGRESS', 'PENDING'])
        .limit(100)
        .get();
      
      statistics.activeWorkflows = activeWorkflowsSnapshot.size;
    } catch (error) {
      console.warn('[SessionContextService] Error fetching active workflows:', error);
      // Continue with 0 active workflows
    }

    return {
      statistics
    };
  } catch (error) {
    console.error('[SessionContextService] Error gathering session context:', error);
    return {
      statistics: {
        totalSessions: 0,
        sessionsByStatus: {},
        sessionsByPhase: {},
        activeWorkflows: 0
      }
    };
  }
}

