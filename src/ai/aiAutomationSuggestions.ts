/**
 * AI Automation Suggestions Firebase Function
 * 
 * Analyzes real automation patterns and suggests new automation rules
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import {
  fetchAutomationRules,
  fetchExecutionLogs,
  fetchWorkflowHistory
} from './utils/workflowDataFetcher';
import {
  analyzeStatusTransitionPatterns,
  identifyBottlenecks
} from './utils/workflowUnderstanding';
import { getAIApiKey, callAIProvider } from './utils/aiHelpers';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

interface AutomationSuggestionRequest {
  organizationId: string;
  preferredProvider?: 'openai' | 'claude' | 'gemini' | 'grok';
}

interface AutomationSuggestion {
  functionId: string;
  functionName: string;
  trigger: {
    type: 'status_change' | 'field_update' | 'time_based';
    condition: string;
    description: string;
  };
  action: {
    type: 'email' | 'message' | 'notification';
    recipients: string[];
    template: string;
  };
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: string;
}

interface AutomationSuggestionsResponse {
  success: boolean;
  suggestions?: AutomationSuggestion[];
  analysis?: {
    totalRules: number;
    activeRules: number;
    commonPatterns: any[];
    bottlenecks: any[];
  };
  error?: string;
}

/**
 * AI Automation Suggestions - Main function
 */
export const aiAutomationSuggestions = onCall(async (request): Promise<AutomationSuggestionsResponse> => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = request.auth.uid;
    const { organizationId, preferredProvider } = request.data as AutomationSuggestionRequest;

    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'OrganizationId is required');
    }

    // Get API key
    const provider = preferredProvider || 'gemini';
    const apiKeyData = await getAIApiKey(organizationId, provider, userId);
    if (!apiKeyData) {
      throw new HttpsError(
        'failed-precondition',
        `No ${provider} API key configured. Please configure in Integration Settings.`
      );
    }

    // Gather real data
    const automationRules = await fetchAutomationRules(organizationId);
    const executionLogs = await fetchExecutionLogs(organizationId, 200);
    const statusTransitions = await analyzeStatusTransitionPatterns(organizationId);
    const bottlenecks = await identifyBottlenecks(organizationId, 'pitch');
    const storyBottlenecks = await identifyBottlenecks(organizationId, 'story');

    // Analyze patterns
    const allBottlenecks = [...bottlenecks, ...storyBottlenecks];
    const frequentTransitions = statusTransitions
      .filter(t => t.count > 5)
      .slice(0, 10);

    // Build context for AI
    const contextPrompt = `You are analyzing automation patterns for a production management system.

Current Automation Rules: ${automationRules.length} total, ${automationRules.filter(r => r.enabled).length} active

Common Status Transitions (manual actions that could be automated):
${frequentTransitions.map(t => `- ${t.from} → ${t.to} (${t.count} times)`).join('\n')}

Workflow Bottlenecks (areas where automation could help):
${allBottlenecks.slice(0, 5).map(b => `- ${b.status}: ${b.itemCount} items waiting, avg ${Math.round(b.averageWaitTime / 3600)} hours`).join('\n')}

Existing Automation Functions Available:
- updatePitchStatus, updateClearanceStage, assignProducer, selectLicensingSpecialist, updatePitch
- updateStoryStatus, linkToStory, createStory, saveScriptVersion, updateScriptContent
- updateStory, updateTranscodingStatus, updateNLETransferStatus
- handleToggleShowStatus, handleSaveShow, handleSaveSeason

Analyze the patterns above and suggest 3-5 new automation rules that would:
1. Reduce manual work based on frequent transitions
2. Address bottlenecks where items are waiting
3. Not duplicate existing automation rules
4. Have clear, measurable impact

For each suggestion, provide:
- Target functionId and functionName
- Trigger condition (what event should trigger it)
- Action (what should happen)
- Rationale (why this would help)
- Priority (high/medium/low)
- Estimated impact

Format as JSON array.`;

    // Call AI provider
    const messages = [
      { role: 'system', content: 'You are an automation expert analyzing workflow patterns. Provide actionable automation suggestions based on real data.' },
      { role: 'user', content: contextPrompt }
    ];

    const aiResponse = await callAIProvider(provider, apiKeyData.apiKey, apiKeyData.model, messages);

    // Parse AI response (expecting JSON)
    let suggestions: AutomationSuggestion[] = [];
    try {
      // Extract JSON from response (might have markdown code blocks)
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || aiResponse.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponse;
      suggestions = JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse AI suggestions:', error);
      // Fallback: create suggestions from bottlenecks
      suggestions = allBottlenecks.slice(0, 3).map(bottleneck => ({
        functionId: bottleneck.entityType === 'pitch' ? 'updatePitchStatus' : 'updateStoryStatus',
        functionName: bottleneck.entityType === 'pitch' ? 'Update Pitch Status' : 'Update Story Status',
        trigger: {
          type: 'status_change' as const,
          condition: `When ${bottleneck.status} items exceed threshold`,
          description: `Automate progression from ${bottleneck.status} status`
        },
        action: {
          type: 'notification' as const,
          recipients: [],
          template: `Items in ${bottleneck.status} need attention`
        },
        rationale: `${bottleneck.itemCount} items are waiting in ${bottleneck.status}, causing bottleneck`,
        priority: bottleneck.averageWaitTime > 86400 ? 'high' as const : 'medium' as const,
        estimatedImpact: `Could reduce wait time by ${Math.round(bottleneck.averageWaitTime / 3600)} hours`
      }));
    }

    return {
      success: true,
      suggestions,
      analysis: {
        totalRules: automationRules.length,
        activeRules: automationRules.filter(r => r.enabled).length,
        commonPatterns: frequentTransitions,
        bottlenecks: allBottlenecks
      }
    };
  } catch (error) {
    console.error('AI Automation Suggestions error:', error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      `Failed to generate automation suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
});

