/**
 * Workflow Understanding Service
 * 
 * Maps real workflow data to AI-understandable context
 * Provides workflow stage analysis and status transition patterns
 */

import { WorkflowAction } from './workflowDataFetcher';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface WorkflowStage {
  stage: string;
  status: string;
  entityType: 'pitch' | 'story' | 'show' | 'season';
  description: string;
}

export interface StatusTransition {
  from: string;
  to: string;
  count: number;
  averageTime?: number; // in seconds
}

export interface WorkflowPattern {
  commonPath: string[];
  frequency: number;
  averageDuration?: number;
}

export interface Bottleneck {
  status: string;
  entityType: 'pitch' | 'story' | 'show' | 'season';
  averageWaitTime: number; // in seconds
  itemCount: number;
}

/**
 * Map pitch status to workflow stage
 */
export function mapPitchStatusToWorkflowStage(status: string): WorkflowStage {
  const statusMap: Record<string, WorkflowStage> = {
    'Pitched': {
      stage: 'initial',
      status: 'Pitched',
      entityType: 'pitch',
      description: 'Clip has been pitched and is awaiting producer review'
    },
    'Pursue Clearance': {
      stage: 'clearance',
      status: 'Pursue Clearance',
      entityType: 'pitch',
      description: 'Producer approved, clearance process started'
    },
    'Ready to License': {
      stage: 'licensing',
      status: 'Ready to License',
      entityType: 'pitch',
      description: 'Ready for licensing specialist to acquire rights'
    },
    'License Cleared': {
      stage: 'cleared',
      status: 'License Cleared',
      entityType: 'pitch',
      description: 'License acquired and cleared for production'
    },
    'Ready for Script': {
      stage: 'pre-production',
      status: 'Ready for Script',
      entityType: 'pitch',
      description: 'Ready to be assigned to writer for script creation'
    },
    'Script Complete': {
      stage: 'production',
      status: 'Script Complete',
      entityType: 'pitch',
      description: 'Script has been completed'
    },
    'V1 Cut': {
      stage: 'post-production',
      status: 'V1 Cut',
      entityType: 'pitch',
      description: 'First version edit complete'
    },
    'Ready for Build': {
      stage: 'final',
      status: 'Ready for Build',
      entityType: 'pitch',
      description: 'Ready for final assembly'
    },
    'Killed': {
      stage: 'terminated',
      status: 'Killed',
      entityType: 'pitch',
      description: 'Pitch was rejected or cancelled'
    },
    'Do Not Pursue Clearance': {
      stage: 'terminated',
      status: 'Do Not Pursue Clearance',
      entityType: 'pitch',
      description: 'Producer decided not to pursue clearance'
    }
  };

  return statusMap[status] || {
    stage: 'unknown',
    status,
    entityType: 'pitch',
    description: `Status: ${status}`
  };
}

/**
 * Map story status to workflow stage
 */
export function mapStoryStatusToWorkflowStage(status: string): WorkflowStage {
  const statusMap: Record<string, WorkflowStage> = {
    'Initial': {
      stage: 'initial',
      status: 'Initial',
      entityType: 'story',
      description: 'Story has been created and assigned'
    },
    'Script Writing': {
      stage: 'writing',
      status: 'Script Writing',
      entityType: 'story',
      description: 'Writer is creating the script'
    },
    'Script Complete': {
      stage: 'review',
      status: 'Script Complete',
      entityType: 'story',
      description: 'Script completed and ready for review'
    },
    'A Roll': {
      stage: 'editing',
      status: 'A Roll',
      entityType: 'story',
      description: 'A Roll edit in progress'
    },
    'v1 Edit': {
      stage: 'editing',
      status: 'v1 Edit',
      entityType: 'story',
      description: 'First version edit complete'
    },
    'v2 Edit': {
      stage: 'editing',
      status: 'v2 Edit',
      entityType: 'story',
      description: 'Second version edit complete'
    },
    'Ready for Build': {
      stage: 'final',
      status: 'Ready for Build',
      entityType: 'story',
      description: 'Ready for final assembly'
    },
    'RC': {
      stage: 'final',
      status: 'RC',
      entityType: 'story',
      description: 'Release candidate ready'
    },
    'Assembled': {
      stage: 'complete',
      status: 'Assembled',
      entityType: 'story',
      description: 'Story assembly complete'
    }
  };

  return statusMap[status] || {
    stage: 'unknown',
    status,
    entityType: 'story',
    description: `Status: ${status}`
  };
}

/**
 * Get valid next statuses based on current status and entity type
 */
export function getValidNextStatuses(
  currentStatus: string,
  entityType: 'pitch' | 'story' | 'show' | 'season'
): string[] {
  if (entityType === 'pitch') {
    const pitchFlow: Record<string, string[]> = {
      'Pitched': ['Pursue Clearance', 'Do Not Pursue Clearance', 'Killed'],
      'Pursue Clearance': ['Ready to License', 'Do Not Pursue Clearance', 'Killed'],
      'Ready to License': ['License Cleared', 'Do Not Pursue Clearance', 'Killed'],
      'License Cleared': ['Ready for Script'],
      'Ready for Script': ['Script Complete'],
      'Script Complete': ['V1 Cut'],
      'V1 Cut': ['Ready for Build'],
      'Ready for Build': []
    };
    return pitchFlow[currentStatus] || [];
  }

  if (entityType === 'story') {
    const storyFlow: Record<string, string[]> = {
      'Initial': ['Script Writing'],
      'Script Writing': ['Script Complete', 'Killed'],
      'Script Complete': ['A Roll', 'Request Revision'],
      'A Roll': ['v1 Edit'],
      'v1 Edit': ['v2 Edit', 'Ready for Build'],
      'v2 Edit': ['Ready for Build'],
      'Ready for Build': ['RC'],
      'RC': ['Assembled']
    };
    return storyFlow[currentStatus] || [];
  }

  return [];
}

/**
 * Analyze status transition patterns from workflow actions
 */
export async function analyzeStatusTransitionPatterns(
  organizationId: string,
  entityType?: 'pitch' | 'story' | 'show' | 'season'
): Promise<StatusTransition[]> {
  try {
    const workflowActionsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection('workflowActions');

    let query = workflowActionsRef
      .where('action', '==', 'status_change')
      .orderBy('timestamp', 'desc')
      .limit(1000);

    if (entityType) {
      query = query.where('entityType', '==', entityType) as any;
    }

    const snapshot = await query.get();
    const transitions = new Map<string, { count: number; times: number[] }>();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const metadata = data.metadata || {};
      const fromStatus = metadata.oldStatus;
      const toStatus = metadata.newStatus;
      const timestamp = data.timestamp?.toMillis() || Date.now();

      if (fromStatus && toStatus) {
        const key = `${fromStatus} -> ${toStatus}`;
        if (!transitions.has(key)) {
          transitions.set(key, { count: 0, times: [] });
        }
        const transition = transitions.get(key)!;
        transition.count++;
        // Store timestamp for duration calculation (simplified)
        transition.times.push(timestamp);
      }
    });

    return Array.from(transitions.entries()).map(([key, value]) => {
      const [from, to] = key.split(' -> ');
      return {
        from,
        to,
        count: value.count,
        averageTime: value.times.length > 1
          ? (value.times[0] - value.times[value.times.length - 1]) / value.times.length / 1000
          : undefined
      };
    }).sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error analyzing status transitions:', error);
    return [];
  }
}

/**
 * Identify bottlenecks in workflow
 */
export async function identifyBottlenecks(
  organizationId: string,
  entityType: 'pitch' | 'story'
): Promise<Bottleneck[]> {
  try {
    const collectionName = entityType === 'pitch' ? 'pitches' : 'stories';
    const itemsRef = db
      .collection('organizations')
      .doc(organizationId)
      .collection(collectionName);

    const snapshot = await itemsRef.get();
    const statusCounts = new Map<string, { count: number; totalWaitTime: number; items: any[] }>();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      const updatedAt = data.updatedAt?.toMillis() || Date.now();
      const now = Date.now();
      const waitTime = (now - updatedAt) / 1000; // seconds

      if (!statusCounts.has(status)) {
        statusCounts.set(status, { count: 0, totalWaitTime: 0, items: [] });
      }
      const statusData = statusCounts.get(status)!;
      statusData.count++;
      statusData.totalWaitTime += waitTime;
      statusData.items.push({ id: doc.id, updatedAt });
    });

    return Array.from(statusCounts.entries())
      .map(([status, data]) => ({
        status,
        entityType,
        averageWaitTime: data.totalWaitTime / data.count,
        itemCount: data.count
      }))
      .filter(b => b.itemCount > 0)
      .sort((a, b) => b.averageWaitTime - a.averageWaitTime)
      .slice(0, 10); // Top 10 bottlenecks
  } catch (error) {
    console.error('Error identifying bottlenecks:', error);
    return [];
  }
}

/**
 * Get common workflow paths
 */
export async function getCommonWorkflowPaths(
  organizationId: string,
  entityType: 'pitch' | 'story',
  limit: number = 10
): Promise<WorkflowPath[]> {
  try {
    // This would analyze workflowActions to find common paths
    // Simplified implementation
    const transitions = await analyzeStatusTransitionPatterns(organizationId, entityType);
    
    // Build paths from transitions
    const paths: WorkflowPath[] = [];
    // Simplified - in production, would build actual paths from workflow history
    
    return paths;
  } catch (error) {
    console.error('Error getting workflow paths:', error);
    return [];
  }
}

export interface WorkflowPath {
  path: string[];
  frequency: number;
  averageDuration?: number;
}

