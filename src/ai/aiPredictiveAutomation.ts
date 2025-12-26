/**
 * AI Predictive Automation Firebase Function
 * 
 * Predicts next actions based on historical workflow patterns
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import {
  fetchCurrentPitch,
  fetchCurrentStory,
  fetchWorkflowHistory
} from './utils/workflowDataFetcher';
import {
  getValidNextStatuses,
  analyzeStatusTransitionPatterns
} from './utils/workflowUnderstanding';
import { getAIApiKey, callAIProvider } from './utils/aiHelpers';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

interface PredictiveAutomationRequest {
  organizationId: string;
  entityType: 'pitch' | 'story';
  entityId: string;
  preferredProvider?: 'openai' | 'claude' | 'gemini' | 'grok';
}

interface PredictiveAction {
  action: string;
  description: string;
  confidence: number; // 0-1
  rationale: string;
  estimatedTimeToComplete?: number; // in seconds
  data?: any;
}

interface PredictiveAutomationResponse {
  success: boolean;
  predictions?: PredictiveAction[];
  context?: {
    currentStatus: string;
    workflowStage: string;
    similarCompletedItems?: number;
  };
  error?: string;
}

/**
 * AI Predictive Automation - Main function
 */
export const aiPredictiveAutomation = onCall(async (request): Promise<PredictiveAutomationResponse> => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { organizationId, entityType, entityId, preferredProvider } = request.data as PredictiveAutomationRequest;

    if (!organizationId || !entityType || !entityId) {
      throw new HttpsError('invalid-argument', 'OrganizationId, entityType, and entityId are required');
    }

    // Get API key
    // Get API key
    const provider = preferredProvider || 'gemini';
    const apiKeyData = await getAIApiKey(organizationId, provider, userId);
    if (!apiKeyData) {
      throw new HttpsError(
        'failed-precondition',
        `No ${provider} API key configured. Please configure in Integration Settings.`
      );
    }

    // Fetch current entity
    const entity = entityType === 'pitch'
      ? await fetchCurrentPitch(entityId, organizationId)
      : await fetchCurrentStory(entityId, organizationId);

    if (!entity) {
      throw new HttpsError('not-found', `${entityType} not found`);
    }

    // Fetch workflow history
    const workflowHistory = await fetchWorkflowHistory(entityId, entityType, organizationId, 50);

    // Analyze patterns for similar items
    const statusTransitions = await analyzeStatusTransitionPatterns(organizationId, entityType);
    const similarTransitions = statusTransitions.filter(t => t.from === entity.status);

    // Get valid next statuses
    const validNextStatuses = getValidNextStatuses(entity.status, entityType);

    // Build context for AI
    const contextPrompt = `Predict next actions for a ${entityType} in production workflow.

Current State:
- Status: ${entity.status}
- Title: ${entity.clipTitle || entity.title || 'Untitled'}
- Recent Actions: ${workflowHistory.slice(0, 5).map(a => `${a.action} at ${a.timestamp?.toDate().toLocaleString()}`).join(', ')}

Common Next Steps from Similar Items:
${similarTransitions.slice(0, 5).map(t => `- ${t.to} (${t.count} times)`).join('\n')}

Valid Next Statuses: ${validNextStatuses.join(', ')}

Based on this real workflow data, predict the most likely next 3-5 actions the user should take.
For each action, provide:
- Action name (e.g., "Update status to X", "Assign writer", "Request clearance")
- Description
- Confidence level (0-1 based on pattern frequency)
- Rationale (why this action makes sense)
- Estimated time impact

Format as JSON array.`;

    // Call AI provider
    const messages = [
      { role: 'system', content: 'You are a workflow prediction expert. Analyze real workflow patterns and predict likely next actions.' },
      { role: 'user', content: contextPrompt }
    ];

    const aiResponse = await callAIProvider(provider, apiKeyData.apiKey, apiKeyData.model, messages);

    // Parse AI response
    let predictions: PredictiveAction[] = [];
    try {
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      predictions = JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse AI predictions:', error);
      // Fallback: create predictions from valid next statuses
      predictions = validNextStatuses.slice(0, 3).map((status, idx) => {
        const transition = similarTransitions.find(t => t.to === status);
        return {
          action: `Update status to "${status}"`,
          description: `Move ${entityType} to ${status} status`,
          confidence: transition ? Math.min(transition.count / 10, 0.9) : 0.5,
          rationale: transition
            ? `This transition happened ${transition.count} times in similar items`
            : 'This is a valid next status in the workflow',
          data: {
            entityType,
            entityId,
            newStatus: status
          }
        };
      });
    }

    return {
      success: true,
      predictions,
      context: {
        currentStatus: entity.status,
        workflowStage: entity.status, // Simplified
        similarCompletedItems: similarTransitions.reduce((sum, t) => sum + t.count, 0)
      }
    };
  } catch (error) {
    console.error('AI Predictive Automation error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `Failed to generate predictions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

