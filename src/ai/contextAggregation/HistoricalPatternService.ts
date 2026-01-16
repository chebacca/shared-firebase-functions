/**
 * Historical Pattern Service
 * 
 * Analyzes historical data to learn patterns:
 * - Average time spent in each status
 * - Common workflow paths
 * - Success patterns
 * - User behavior patterns
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

// Initialize getDb() lazily
const getDb = () => getFirestore();

export interface HistoricalPatterns {
  // Average time spent in each status
  averageTimeInStatus: Map<string, number>; // status -> average seconds

  // Common workflow paths (status transitions)
  commonPaths: Array<{
    from: string;
    to: string;
    count: number;
    averageTime: number; // seconds
    successRate: number; // 0-1
  }>;

  // Success patterns (what leads to completed stories)
  successPatterns: Array<{
    pattern: string[]; // sequence of statuses
    count: number;
    averageTotalTime: number; // seconds
    successRate: number; // 0-1
  }>;

  // User behavior patterns
  userBehaviorPatterns: Map<string, {
    userId: string;
    averageTimeToComplete: number; // seconds
    commonActions: Array<{ action: string; count: number }>;
    preferredStatuses: string[];
  }>;

  // Status frequency analysis
  statusFrequency: Map<string, number>; // status -> count

  // Bottleneck analysis
  bottlenecks: Array<{
    status: string;
    averageWaitTime: number; // seconds
    itemCount: number;
    entityType: 'pitch' | 'story';
  }>;
}

/**
 * Gather historical patterns for an organization
 */
export async function gatherHistoricalPatterns(
  organizationId: string,
  options?: {
    lookbackDays?: number;
    minSamples?: number; // Minimum samples needed for a pattern to be considered
  }
): Promise<HistoricalPatterns> {
  const {
    lookbackDays = 90,
    minSamples = 3
  } = options || {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  // Fetch all pitches and stories with their history
  const [pitchesSnapshot, storiesSnapshot] = await Promise.all([
    getDb()
      .collection('clipShowPitches')
      .where('organizationId', '==', organizationId)
      .get(),
    getDb()
      .collection('clipShowStories')
      .where('organizationId', '==', organizationId)
      .get()
  ]);

  const pitches: any[] = [];
  const stories: any[] = [];

  pitchesSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const pitchData = doc.data();
    const pitch = { id: doc.id, ...pitchData };
    const createdAt = pitchData.createdAt?.toDate ? pitchData.createdAt.toDate() : new Date(pitchData.createdAt || 0);
    if (createdAt >= cutoffDate) {
      pitches.push(pitch);
    }
  });

  storiesSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
    const storyData = doc.data();
    const story = { id: doc.id, ...storyData };
    const createdAt = storyData.createdAt?.toDate ? storyData.createdAt.toDate() : new Date(storyData.createdAt || 0);
    if (createdAt >= cutoffDate) {
      stories.push(story);
    }
  });

  // Fetch workflow history for all entities
  const workflowHistoryMap = new Map<string, any[]>();

  // For pitches, we'll use status change timestamps from the pitch itself
  // For stories, same approach
  // In a real implementation, you'd query a workflowHistory collection

  // Analyze time in status for pitches
  const pitchTimeInStatus = new Map<string, number[]>();
  pitches.forEach(pitch => {
    const status = pitch.status;
    if (status) {
      const createdAt = pitch.createdAt?.toDate ? pitch.createdAt.toDate() : new Date(pitch.createdAt || 0);
      const updatedAt = pitch.updatedAt?.toDate ? pitch.updatedAt.toDate() : new Date(pitch.updatedAt || createdAt);
      const timeInStatus = (updatedAt.getTime() - createdAt.getTime()) / 1000; // seconds

      if (!pitchTimeInStatus.has(status)) {
        pitchTimeInStatus.set(status, []);
      }
      pitchTimeInStatus.get(status)!.push(timeInStatus);
    }
  });

  // Analyze time in status for stories
  const storyTimeInStatus = new Map<string, number[]>();
  stories.forEach(story => {
    const status = story.status;
    if (status) {
      const createdAt = story.createdAt?.toDate ? story.createdAt.toDate() : new Date(story.createdAt || 0);
      const updatedAt = story.updatedAt?.toDate ? story.updatedAt.toDate() : new Date(story.updatedAt || createdAt);
      const timeInStatus = (updatedAt.getTime() - createdAt.getTime()) / 1000; // seconds

      if (!storyTimeInStatus.has(status)) {
        storyTimeInStatus.set(status, []);
      }
      storyTimeInStatus.get(status)!.push(timeInStatus);
    }
  });

  // Calculate average time in status
  const averageTimeInStatus = new Map<string, number>();

  pitchTimeInStatus.forEach((times, status) => {
    if (times.length >= minSamples) {
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
      averageTimeInStatus.set(`pitch:${status}`, avg);
    }
  });

  storyTimeInStatus.forEach((times, status) => {
    if (times.length >= minSamples) {
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
      averageTimeInStatus.set(`story:${status}`, avg);
    }
  });

  // Analyze status transitions (common paths)
  const transitionMap = new Map<string, {
    count: number;
    totalTime: number;
    successCount: number;
  }>();

  // For pitches: analyze status progression
  pitches.forEach(pitch => {
    // In a real implementation, you'd track status changes over time
    // For now, we'll use the current status as a proxy
    const status = pitch.status;
    if (status) {
      const key = `pitch:${status}`;
      const existing = transitionMap.get(key) || { count: 0, totalTime: 0, successCount: 0 };
      existing.count++;
      if (isSuccessStatus(status, 'pitch')) {
        existing.successCount++;
      }
      transitionMap.set(key, existing);
    }
  });

  // For stories: analyze status progression
  stories.forEach(story => {
    const status = story.status;
    if (status) {
      const key = `story:${status}`;
      const existing = transitionMap.get(key) || { count: 0, totalTime: 0, successCount: 0 };
      existing.count++;
      if (isSuccessStatus(status, 'story')) {
        existing.successCount++;
      }
      transitionMap.set(key, existing);
    }
  });

  // Build common paths array
  const commonPaths: HistoricalPatterns['commonPaths'] = [];
  transitionMap.forEach((data, key) => {
    if (data.count >= minSamples) {
      const [entityType, status] = key.split(':');
      commonPaths.push({
        from: 'Previous', // Would be actual previous status in real implementation
        to: status,
        count: data.count,
        averageTime: data.totalTime / data.count,
        successRate: data.count > 0 ? data.successCount / data.count : 0
      });
    }
  });

  // Analyze status frequency
  const statusFrequency = new Map<string, number>();
  pitches.forEach(pitch => {
    const status = pitch.status;
    if (status) {
      statusFrequency.set(`pitch:${status}`, (statusFrequency.get(`pitch:${status}`) || 0) + 1);
    }
  });
  stories.forEach(story => {
    const status = story.status;
    if (status) {
      statusFrequency.set(`story:${status}`, (statusFrequency.get(`story:${status}`) || 0) + 1);
    }
  });

  // Identify bottlenecks (statuses with long average wait times)
  const bottlenecks: HistoricalPatterns['bottlenecks'] = [];
  averageTimeInStatus.forEach((avgTime, key) => {
    const [entityType, status] = key.split(':');
    const frequency = statusFrequency.get(key) || 0;

    if (frequency >= minSamples && avgTime > 7 * 24 * 60 * 60) { // More than 7 days
      bottlenecks.push({
        status,
        averageWaitTime: avgTime,
        itemCount: frequency,
        entityType: entityType as 'pitch' | 'story'
      });
    }
  });

  // User behavior patterns (simplified - would need more data)
  const userBehaviorPatterns = new Map<string, {
    userId: string;
    averageTimeToComplete: number;
    commonActions: Array<{ action: string; count: number }>;
    preferredStatuses: string[];
  }>();

  // Success patterns (simplified)
  const successPatterns: HistoricalPatterns['successPatterns'] = [];
  const completedStories = stories.filter(s => isSuccessStatus(s.status, 'story'));
  if (completedStories.length >= minSamples) {
    // In a real implementation, you'd track the full path to completion
    successPatterns.push({
      pattern: ['Draft', 'Script Complete', 'A Roll', 'Assembled'], // Example pattern
      count: completedStories.length,
      averageTotalTime: 0, // Would calculate from actual data
      successRate: 1.0
    });
  }

  return {
    averageTimeInStatus,
    commonPaths: commonPaths.sort((a, b) => b.count - a.count),
    successPatterns,
    userBehaviorPatterns,
    statusFrequency,
    bottlenecks: bottlenecks.sort((a, b) => b.averageWaitTime - a.averageWaitTime)
  };
}

/**
 * Check if a status represents a successful completion
 */
function isSuccessStatus(status: string, entityType: 'pitch' | 'story'): boolean {
  if (entityType === 'pitch') {
    return status === 'Ready for Script' || status === 'License Cleared';
  } else {
    return status === 'Assembled';
  }
}

