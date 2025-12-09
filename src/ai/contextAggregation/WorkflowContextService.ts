/**
 * Workflow Context Service
 * 
 * Deep workflow state analysis:
 * - Current phase detection for all pitches/stories
 * - Bottleneck identification
 * - Status transition history analysis
 * - Workflow velocity metrics
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

const db = getFirestore();

export interface WorkflowContext {
  // Current phase distribution
  phaseDistribution: Map<string, number>; // phase -> count

  // Bottlenecks
  bottlenecks: Array<{
    status: string;
    entityType: 'pitch' | 'story';
    itemCount: number;
    averageWaitTime: number; // seconds
    items: Array<{
      entityId: string;
      title: string;
      status: string;
      daysInStatus: number;
    }>;
  }>;

  // Status transition history
  statusTransitions: Array<{
    from: string;
    to: string;
    count: number;
    averageTime: number; // seconds
  }>;

  // Workflow velocity metrics
  velocityMetrics: {
    averageTimeToComplete: number; // seconds
    averageTimePerPhase: Map<string, number>; // phase -> seconds
    completionRate: number; // 0-1
    itemsInProgress: number;
    itemsCompleted: number;
  };

  // Items by phase
  itemsByPhase: Map<string, Array<{
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    status: string;
    daysInStatus: number;
  }>>;
}

/**
 * Workflow phases for pitches
 */
const PITCH_PHASES: Record<string, string> = {
  'Pitched': 'Research & Pitch',
  'Pursue Clearance': 'Clearance',
  'Do Not Pursue Clearance': 'Terminated',
  'Killed': 'Terminated',
  'Ready to License': 'Licensing',
  'Pending Signature': 'Licensing',
  'License Cleared': 'Licensing',
  'Ready for Script': 'Ready for Production'
};

/**
 * Workflow phases for stories
 */
const STORY_PHASES: Record<string, string> = {
  'Draft': 'Script Development',
  'Initial': 'Script Development',
  'Script Writing': 'Script Development',
  'Ready for Script': 'Script Development',
  'In Progress': 'Script Development',
  'Script Review': 'Script Development',
  'Scripting Notes': 'Script Development',
  'Scripting Revision': 'Script Development',
  'Script Revisions': 'Script Development',
  'Ready for Approval': 'Script Development',
  'Script Complete': 'Script Development',
  'Needs String': 'String Phase',
  'String In Progress': 'String Phase',
  'String Complete': 'String Phase',
  'A Roll': 'Edit Phase',
  'A Roll Notes': 'Edit Phase',
  'A Roll Notes Complete': 'Edit Phase',
  'v1 Edit': 'Edit Phase',
  'v1 Notes': 'Edit Phase',
  'v1 Notes Complete': 'Edit Phase',
  'v2 Edit': 'Edit Phase',
  'v2 Notes': 'Edit Phase',
  'v2 Notes Complete': 'Edit Phase',
  'v3 Edit': 'Edit Phase',
  'v3 Notes': 'Edit Phase',
  'v3 Notes Complete': 'Edit Phase',
  'v4 Edit': 'Edit Phase',
  'v4 Notes': 'Edit Phase',
  'v4 Notes Complete': 'Edit Phase',
  'v5 Edit': 'Edit Phase',
  'v5 Notes': 'Edit Phase',
  'v5 Notes Complete': 'Edit Phase',
  'Ready for Build': 'Build Phase',
  'RC': 'Build Phase',
  'RC Notes': 'Build Phase',
  'RC Notes Complete': 'Build Phase',
  'Assembled': 'Complete',
  'Killed': 'Terminated',
  'Needs Revisit': 'Complete'
};

/**
 * Gather workflow context for an organization
 */
export async function gatherWorkflowContext(
  organizationId: string,
  options?: {
    includeBottlenecks?: boolean;
    includeVelocity?: boolean;
  }
): Promise<WorkflowContext> {
  const {
    includeBottlenecks = true,
    includeVelocity = true
  } = options || {};

  const now = new Date();

  // Fetch all pitches and stories
  const [pitchesSnapshot, storiesSnapshot] = await Promise.all([
    db
      .collection('clipShowPitches')
      .where('organizationId', '==', organizationId)
      .get(),
    db
      .collection('clipShowStories')
      .where('organizationId', '==', organizationId)
      .get()
  ]);

  const pitches: any[] = [];
  const stories: any[] = [];

  pitchesSnapshot.forEach(doc => {
    pitches.push({ id: doc.id, ...doc.data() });
  });

  storiesSnapshot.forEach(doc => {
    stories.push({ id: doc.id, ...doc.data() });
  });

  // Build phase distribution
  const phaseDistribution = new Map<string, number>();
  const itemsByPhase = new Map<string, Array<{
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    status: string;
    daysInStatus: number;
  }>>();

  pitches.forEach(pitch => {
    const status = pitch.status || 'Unknown';
    const phase = PITCH_PHASES[status] || 'Unknown';
    
    phaseDistribution.set(phase, (phaseDistribution.get(phase) || 0) + 1);
    
    if (!itemsByPhase.has(phase)) {
      itemsByPhase.set(phase, []);
    }

    const updatedAt = pitch.updatedAt?.toDate ? pitch.updatedAt.toDate() : new Date(pitch.updatedAt || pitch.createdAt || now);
    const daysInStatus = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

    itemsByPhase.get(phase)!.push({
      entityType: 'pitch',
      entityId: pitch.id,
      title: pitch.clipTitle || 'Untitled',
      status,
      daysInStatus
    });
  });

  stories.forEach(story => {
    const status = story.status || 'Unknown';
    const phase = STORY_PHASES[status] || 'Unknown';
    
    phaseDistribution.set(phase, (phaseDistribution.get(phase) || 0) + 1);
    
    if (!itemsByPhase.has(phase)) {
      itemsByPhase.set(phase, []);
    }

    const updatedAt = story.updatedAt?.toDate ? story.updatedAt.toDate() : new Date(story.updatedAt || story.createdAt || now);
    const daysInStatus = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

    itemsByPhase.get(phase)!.push({
      entityType: 'story',
      entityId: story.id,
      title: story.title || story.clipTitle || 'Untitled',
      status,
      daysInStatus
    });
  });

  // Identify bottlenecks
  const bottlenecks: WorkflowContext['bottlenecks'] = [];
  if (includeBottlenecks) {
    const statusWaitTimes = new Map<string, {
      totalWaitTime: number;
      itemCount: number;
      items: Array<{
        entityId: string;
        title: string;
        status: string;
        daysInStatus: number;
      }>;
      entityType: 'pitch' | 'story';
    }>();

    pitches.forEach(pitch => {
      const status = pitch.status || 'Unknown';
      if (!isCompleteStatus(status, 'pitch')) {
        const updatedAt = pitch.updatedAt?.toDate ? pitch.updatedAt.toDate() : new Date(pitch.updatedAt || pitch.createdAt || now);
        const daysInStatus = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        const waitTime = daysInStatus * 24 * 60 * 60; // seconds

        if (!statusWaitTimes.has(`pitch:${status}`)) {
          statusWaitTimes.set(`pitch:${status}`, {
            totalWaitTime: 0,
            itemCount: 0,
            items: [],
            entityType: 'pitch'
          });
        }

        const data = statusWaitTimes.get(`pitch:${status}`)!;
        data.totalWaitTime += waitTime;
        data.itemCount++;
        data.items.push({
          entityId: pitch.id,
          title: pitch.clipTitle || 'Untitled',
          status,
          daysInStatus
        });
      }
    });

    stories.forEach(story => {
      const status = story.status || 'Unknown';
      if (!isCompleteStatus(status, 'story')) {
        const updatedAt = story.updatedAt?.toDate ? story.updatedAt.toDate() : new Date(story.updatedAt || story.createdAt || now);
        const daysInStatus = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        const waitTime = daysInStatus * 24 * 60 * 60; // seconds

        if (!statusWaitTimes.has(`story:${status}`)) {
          statusWaitTimes.set(`story:${status}`, {
            totalWaitTime: 0,
            itemCount: 0,
            items: [],
            entityType: 'story'
          });
        }

        const data = statusWaitTimes.get(`story:${status}`)!;
        data.totalWaitTime += waitTime;
        data.itemCount++;
        data.items.push({
          entityId: story.id,
          title: story.title || story.clipTitle || 'Untitled',
          status,
          daysInStatus
        });
      }
    });

    // Find statuses with high wait times
    statusWaitTimes.forEach((data, key) => {
      if (data.itemCount >= 2) { // At least 2 items
        const averageWaitTime = data.totalWaitTime / data.itemCount;
        const averageDays = averageWaitTime / (24 * 60 * 60);

        // Consider it a bottleneck if average wait time is > 7 days
        if (averageDays > 7) {
          const [, status] = key.split(':');
          bottlenecks.push({
            status,
            entityType: data.entityType,
            itemCount: data.itemCount,
            averageWaitTime,
            items: data.items.slice(0, 10) // Top 10 items
          });
        }
      }
    });
  }

  // Status transitions (simplified - would need history tracking)
  const statusTransitions: WorkflowContext['statusTransitions'] = [];
  // In a real implementation, you'd analyze actual status change history

  // Workflow velocity metrics
  const velocityMetrics: WorkflowContext['velocityMetrics'] = {
    averageTimeToComplete: 0,
    averageTimePerPhase: new Map(),
    completionRate: 0,
    itemsInProgress: 0,
    itemsCompleted: 0
  };

  if (includeVelocity) {
    const completedPitches = pitches.filter(p => isCompleteStatus(p.status, 'pitch'));
    const completedStories = stories.filter(s => isCompleteStatus(s.status, 'story'));
    const inProgressPitches = pitches.filter(p => !isCompleteStatus(p.status, 'pitch'));
    const inProgressStories = stories.filter(s => !isCompleteStatus(s.status, 'story'));

    velocityMetrics.itemsCompleted = completedPitches.length + completedStories.length;
    velocityMetrics.itemsInProgress = inProgressPitches.length + inProgressStories.length;
    velocityMetrics.completionRate = (pitches.length + stories.length) > 0 ?
      velocityMetrics.itemsCompleted / (pitches.length + stories.length) : 0;

    // Calculate average time to complete (simplified)
    let totalTime = 0;
    let completedCount = 0;

    completedPitches.forEach(pitch => {
      const createdAt = pitch.createdAt?.toDate ? pitch.createdAt.toDate() : new Date(pitch.createdAt || 0);
      const updatedAt = pitch.updatedAt?.toDate ? pitch.updatedAt.toDate() : new Date(pitch.updatedAt || createdAt);
      totalTime += (updatedAt.getTime() - createdAt.getTime()) / 1000;
      completedCount++;
    });

    completedStories.forEach(story => {
      const createdAt = story.createdAt?.toDate ? story.createdAt.toDate() : new Date(story.createdAt || 0);
      const updatedAt = story.updatedAt?.toDate ? story.updatedAt.toDate() : new Date(story.updatedAt || createdAt);
      totalTime += (updatedAt.getTime() - createdAt.getTime()) / 1000;
      completedCount++;
    });

    velocityMetrics.averageTimeToComplete = completedCount > 0 ? totalTime / completedCount : 0;
  }

  return {
    phaseDistribution,
    bottlenecks: bottlenecks.sort((a, b) => b.averageWaitTime - a.averageWaitTime),
    statusTransitions,
    velocityMetrics,
    itemsByPhase
  };
}

/**
 * Check if a status represents a completed item
 */
function isCompleteStatus(status: string, entityType: 'pitch' | 'story'): boolean {
  if (entityType === 'pitch') {
    return status === 'Killed' || status === 'Do Not Pursue Clearance' || status === 'Ready for Script';
  } else {
    return status === 'Assembled' || status === 'Killed';
  }
}










