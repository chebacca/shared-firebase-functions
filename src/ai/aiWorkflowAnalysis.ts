/**
 * AI Workflow Analysis Firebase Function
 * 
 * Analyzes real workflow patterns and provides insights
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  analyzeStatusTransitionPatterns,
  identifyBottlenecks
} from './utils/workflowUnderstanding';
import { fetchRecentPitches, fetchRecentStories, fetchExecutionLogs } from './utils/workflowDataFetcher';
import { getAIApiKey, callAIProvider } from './utils/aiHelpers';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

interface WorkflowAnalysisRequest {
  organizationId: string;
  entityType?: 'pitch' | 'story' | 'all';
  preferredProvider?: 'openai' | 'claude' | 'gemini' | 'grok';
}

interface WorkflowAnalysisResponse {
  success: boolean;
  analysis?: {
    patterns: any[];
    bottlenecks: any[];
    insights: string;
    recommendations: string[];
  };
  error?: string;
}

/**
 * AI Workflow Analysis - Main function
 */
export const aiWorkflowAnalysis = onCall(
  { memory: '512MiB' }, // Avoid container healthcheck timeout on cold start
  async (request): Promise<WorkflowAnalysisResponse> => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { organizationId, entityType = 'all', preferredProvider } = request.data as WorkflowAnalysisRequest;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'OrganizationId is required');
    }

    // Get API key
    const provider = preferredProvider || 'openai';
    const apiKeyData = await getAIApiKey(organizationId, provider, userId);
    if (!apiKeyData) {
      throw new HttpsError(
        'failed-precondition',
        `No ${provider} API key configured. Please configure in Integration Settings.`
      );
    }

    // Gather real data
    const statusTransitions = await analyzeStatusTransitionPatterns(
      organizationId,
      entityType === 'all' ? undefined : entityType
    );
    
    const bottlenecks = entityType === 'all' || entityType === 'pitch'
      ? await identifyBottlenecks(organizationId, 'pitch')
      : [];
    const storyBottlenecks = entityType === 'all' || entityType === 'story'
      ? await identifyBottlenecks(organizationId, 'story')
      : [];
    
    const allBottlenecks = [...bottlenecks, ...storyBottlenecks];
    const executionLogs = await fetchExecutionLogs(organizationId, 100);

    // Build context for AI
    const contextPrompt = `Analyze workflow patterns for a production management system.

Status Transition Patterns:
${statusTransitions.slice(0, 15).map(t => `- ${t.from} → ${t.to}: ${t.count} times`).join('\n')}

Workflow Bottlenecks:
${allBottlenecks.slice(0, 10).map(b => `- ${b.status} (${b.entityType}): ${b.itemCount} items, avg wait ${Math.round(b.averageWaitTime / 3600)} hours`).join('\n')}

Recent Automation Executions: ${executionLogs.length} in recent history

Provide:
1. Key insights about workflow efficiency
2. Main bottlenecks and their causes
3. 3-5 actionable recommendations to improve workflow
4. Areas where automation could help most

Be specific and reference the actual data patterns above.`;

    // Call AI provider
    const messages = [
      { role: 'system', content: 'You are a workflow optimization expert. Analyze real workflow data and provide actionable insights.' },
      { role: 'user', content: contextPrompt }
    ];

    const aiResponse = await callAIProvider(provider, apiKeyData.apiKey, apiKeyData.model, messages);

    // Extract recommendations (try to parse as JSON or extract bullet points)
    const recommendations: string[] = [];
    const recommendationMatches = aiResponse.match(/\d+\.\s*([^\n]+)/g);
    if (recommendationMatches) {
      recommendations.push(...recommendationMatches.map(m => m.replace(/^\d+\.\s*/, '')));
    } else {
      // Fallback: extract lines that look like recommendations
      const lines = aiResponse.split('\n').filter(line => 
        line.trim().startsWith('-') || 
        line.trim().startsWith('•') ||
        line.trim().match(/^\d+\./)
      );
      recommendations.push(...lines.slice(0, 5).map(l => l.replace(/^[-•\d.\s]+/, '').trim()));
    }

    return {
      success: true,
      analysis: {
        patterns: statusTransitions,
        bottlenecks: allBottlenecks,
        insights: aiResponse,
        recommendations: recommendations.length > 0 ? recommendations : [
          'Review bottlenecks with longest wait times',
          'Consider automating frequent status transitions',
          'Monitor automation execution logs for errors'
        ]
      }
    };
  } catch (error) {
    console.error('AI Workflow Analysis error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `Failed to analyze workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

