/**
 * Workflow Predictor
 * 
 * Predicts workflow outcomes and suggests optimizations:
 * - Predict time to completion for current items
 * - Suggest optimal next status based on patterns
 * - Identify items likely to get stuck
 * - Recommend automation rules based on patterns
 */

import { getFirestore } from 'firebase-admin/firestore';
import { gatherHistoricalPatterns } from '../contextAggregation/HistoricalPatternService';
import { gatherWorkflowContext } from '../contextAggregation/WorkflowContextService';

const db = getFirestore();

export interface WorkflowPrediction {
  entityType: 'pitch' | 'story';
  entityId: string;
  entityTitle: string;
  currentStatus: string;
  predictedTimeToComplete: number; // seconds
  confidence: number; // 0-1
  optimalNextStatus?: string;
  likelyToGetStuck: boolean;
  recommendations: string[];
}

export interface OptimizationSuggestion {
  type: 'automation' | 'workflow_change' | 'assignment';
  description: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  actionData?: any;
}

/**
 * Predict workflow outcomes for all active items
 */
export async function predictWorkflowOutcomes(
  organizationId: string
): Promise<WorkflowPrediction[]> {
  const predictions: WorkflowPrediction[] = [];

  // Gather historical patterns
  const historicalPatterns = await gatherHistoricalPatterns(organizationId);
  const workflowContext = await gatherWorkflowContext(organizationId);

  // Fetch all active pitches and stories
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
    const pitchData = doc.data();
    const pitch = { id: doc.id, ...pitchData } as any;
    if (pitchData && pitchData.status && !isCompleteStatus(pitchData.status, 'pitch')) {
      pitches.push(pitch);
    }
  });

  storiesSnapshot.forEach(doc => {
    const storyData = doc.data();
    const story = { id: doc.id, ...storyData } as any;
    if (storyData && storyData.status && !isCompleteStatus(storyData.status, 'story')) {
      stories.push(story);
    }
  });

  // Predict for pitches
  pitches.forEach(pitch => {
    const pitchData = pitch as any;
    if (pitchData.status) {
      const prediction = predictItemOutcome(
        'pitch',
        pitchData,
        historicalPatterns,
        workflowContext
      );
      if (prediction) {
        predictions.push(prediction);
      }
    }
  });

  // Predict for stories
  stories.forEach(story => {
    const storyData = story as any;
    if (storyData.status) {
      const prediction = predictItemOutcome(
        'story',
        storyData,
        historicalPatterns,
        workflowContext
      );
      if (prediction) {
        predictions.push(prediction);
      }
    }
  });

  return predictions;
}

/**
 * Predict outcome for a single item
 */
function predictItemOutcome(
  entityType: 'pitch' | 'story',
  item: any,
  historicalPatterns: any,
  workflowContext: any
): WorkflowPrediction | null {
  const status = item.status || 'Unknown';
  const statusKey = `${entityType}:${status}`;

  // Get average time in current status
  const avgTimeInStatus = historicalPatterns.averageTimeInStatus.get(statusKey);
  
  // Calculate time to completion based on historical patterns
  let predictedTimeToComplete = 0;
  let confidence = 0.5; // Default confidence

  if (avgTimeInStatus) {
    // Use historical average as baseline
    predictedTimeToComplete = avgTimeInStatus;
    confidence = 0.7;
  } else {
    // Use workflow context velocity metrics
    predictedTimeToComplete = workflowContext.velocityMetrics.averageTimeToComplete || 0;
    confidence = 0.5;
  }

  // Check if item is likely to get stuck
  const likelyToGetStuck = checkIfLikelyToGetStuck(
    status,
    entityType,
    historicalPatterns,
    workflowContext
  );

  // Suggest optimal next status
  const optimalNextStatus = suggestOptimalNextStatus(
    status,
    entityType,
    historicalPatterns
  );

  // Generate recommendations
  const recommendations = generateRecommendations(
    status,
    entityType,
    likelyToGetStuck,
    historicalPatterns
  );

  return {
    entityType,
    entityId: item.id,
    entityTitle: item.clipTitle || item.title || 'Untitled',
    currentStatus: status,
    predictedTimeToComplete,
    confidence,
    optimalNextStatus,
    likelyToGetStuck,
    recommendations
  };
}

/**
 * Check if item is likely to get stuck
 */
function checkIfLikelyToGetStuck(
  status: string,
  entityType: 'pitch' | 'story',
  historicalPatterns: any,
  workflowContext: any
): boolean {
  // Check if status is a known bottleneck
  const isBottleneck = workflowContext.bottlenecks.some((b: any) => 
    b.status === status && b.entityType === entityType
  );

  if (isBottleneck) return true;

  // Check if status has long average wait time
  const statusKey = `${entityType}:${status}`;
  const avgTime = historicalPatterns.averageTimeInStatus.get(statusKey);
  if (avgTime && avgTime > 14 * 24 * 60 * 60) { // More than 14 days
    return true;
  }

  return false;
}

/**
 * Suggest optimal next status based on patterns
 */
function suggestOptimalNextStatus(
  status: string,
  entityType: 'pitch' | 'story',
  historicalPatterns: any
): string | undefined {
  // Find most common transition from this status
  const transitions = historicalPatterns.commonPaths.filter((path: any) => 
    path.from === status || path.from === 'Previous'
  );

  if (transitions.length > 0) {
    // Sort by count and success rate
    transitions.sort((a: any, b: any) => {
      const scoreA = a.count * a.successRate;
      const scoreB = b.count * b.successRate;
      return scoreB - scoreA;
    });

    return transitions[0].to;
  }

  return undefined;
}

/**
 * Generate recommendations for the item
 */
function generateRecommendations(
  status: string,
  entityType: 'pitch' | 'story',
  likelyToGetStuck: boolean,
  historicalPatterns: any
): string[] {
  const recommendations: string[] = [];

  if (likelyToGetStuck) {
    recommendations.push(`This ${entityType} is in a status that historically has long wait times. Consider proactive follow-up.`);
  }

  // Status-specific recommendations
  if (entityType === 'pitch' && status === 'Pursue Clearance') {
    recommendations.push('Ensure clearance coordinator has all required information to proceed.');
  }

  if (entityType === 'story' && status === 'Script Writing') {
    recommendations.push('Check with writer on progress and provide any needed resources or information.');
  }

  if (entityType === 'story' && status === 'A Roll Notes') {
    recommendations.push('Review notes with editor and ensure they are clear and actionable.');
  }

  return recommendations;
}

/**
 * Generate optimization suggestions
 */
export async function generateOptimizationSuggestions(
  organizationId: string
): Promise<OptimizationSuggestion[]> {
  const suggestions: OptimizationSuggestion[] = [];

  const historicalPatterns = await gatherHistoricalPatterns(organizationId);
  const workflowContext = await gatherWorkflowContext(organizationId);

  // Suggest automation for common bottlenecks
  workflowContext.bottlenecks.forEach((bottleneck: any) => {
    if (bottleneck.itemCount >= 3) {
      suggestions.push({
        type: 'automation',
        description: `Automate notifications when items are stuck in "${bottleneck.status}" status for more than 7 days`,
        impact: 'high',
        confidence: 0.8,
        actionData: {
          status: bottleneck.status,
          entityType: bottleneck.entityType,
          thresholdDays: 7
        }
      });
    }
  });

  // Suggest workflow changes for slow transitions
  historicalPatterns.commonPaths.forEach((path: any) => {
    const days = path.averageTime / (24 * 60 * 60);
    if (days > 7 && path.count >= 5) {
      suggestions.push({
        type: 'workflow_change',
        description: `Transition from "${path.from}" to "${path.to}" takes an average of ${Math.round(days)} days. Consider process improvements.`,
        impact: 'medium',
        confidence: 0.7,
        actionData: {
          from: path.from,
          to: path.to,
          averageDays: days
        }
      });
    }
  });

  return suggestions;
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

