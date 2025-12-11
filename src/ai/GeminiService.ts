/**
 * Gemini AI Service
 * 
 * Provides intelligent agent responses using Google's Gemini API.
 * Handles context optimization, prompt engineering, and response formatting.
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';
import { GlobalContext } from './contextAggregation/GlobalContextService';

// Define secret for Gemini API key
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Preview context modes
export type PreviewContextMode = 'none' | 'script' | 'projects' | 'callsheet' | 'media' | 'pdf' | 'graph';

export interface AgentResponse {
    response: string;
    suggestedContext: PreviewContextMode;
    contextData: any;
    followUpSuggestions: string[];
    reasoning: string;
}

/**
 * Gemini Service Class
 */
export class GeminiService {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;

    constructor(apiKey: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        // Use gemini-2.5-flash - the correct model name from the API
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    /**
     * Generate intelligent agent response
     */
    async generateAgentResponse(
        message: string,
        globalContext: GlobalContext,
        currentMode: PreviewContextMode = 'none'
    ): Promise<AgentResponse> {
        try {
            console.log('🧠 [Gemini Service] Starting response generation...');
            console.log('📝 [Gemini Service] User message:', message);
            console.log('🎯 [Gemini Service] Current mode:', currentMode);

            // Build optimized context summary
            const contextSummary = this.buildContextSummary(globalContext);
            console.log('📊 [Gemini Service] Context summary:', contextSummary);

            // Build system prompt
            const systemPrompt = this.buildSystemPrompt(contextSummary);
            console.log('🎨 [Gemini Service] System prompt length:', systemPrompt.length, 'chars');

            // Build user prompt
            const userPrompt = `Current View: ${currentMode}\nUser Message: ${message}\n\nAnalyze the user's intent and provide a helpful response. Determine the best view mode for their request.`;
            console.log('💬 [Gemini Service] User prompt:', userPrompt);

            // Call Gemini API
            console.log('🚀 [Gemini Service] Calling Gemini API...');
            const result = await this.model.generateContent([
                { text: systemPrompt },
                { text: userPrompt }
            ]);

            const responseText = result.response.text();
            console.log('✅ [Gemini Service] Raw API response:', responseText);
            console.log('📏 [Gemini Service] Response length:', responseText.length, 'chars');

            // Parse response and extract structured data
            const parsedResponse = this.parseAgentResponse(responseText, globalContext);
            console.log('🎯 [Gemini Service] Parsed response:', JSON.stringify(parsedResponse, null, 2));

            return parsedResponse;

        } catch (error) {
            console.error('❌ [Gemini Service] Error generating response:', error);
            console.error('❌ [Gemini Service] Error details:', JSON.stringify(error, null, 2));

            // Fallback response
            return {
                response: "I'm having trouble processing your request right now. Please try again.",
                suggestedContext: currentMode,
                contextData: null,
                followUpSuggestions: ['Try rephrasing your question', 'Check system status'],
                reasoning: 'Error occurred during AI processing'
            };
        }
    }

    /**
     * Build optimized context summary
     * Reduces token usage while preserving key information
     */
    private buildContextSummary(globalContext: GlobalContext): string {
        // Defensive check - ensure globalContext exists
        if (!globalContext) {
            return `
        CONTEXT SUMMARY:
        - Organization: Unknown
        - Dashboard Projects: 0
        - Active Licenses: 0
        - Team Members: 0
        - Velocity: 0% completion rate (0 items completed)
        
        
        SYSTEM CAPABILITIES:
        - Can switch views: "media" (Gallery), "script" (Script Editor), "graph" (Knowledge Graph)
        - Can filter data based on user intent
        - Can suggest follow-up actions
        `;
        }

        const velocityMetrics = globalContext.clipShow?.velocityMetrics;
        const totalItems = (velocityMetrics?.itemsCompleted || 0) + (velocityMetrics?.itemsInProgress || 0);

        return `
        CONTEXT SUMMARY:
        - Organization: ${globalContext.organizationId || 'Unknown'}
        - Dashboard Projects: ${globalContext.dashboard?.activeProjects || 0}
        - Active Licenses: ${globalContext.licensing?.activeLicenses || 0}
        - Team Members: ${globalContext.callSheet?.activePersonnel || 0}
        - Velocity: ${velocityMetrics?.completionRate || 0}% completion rate (${velocityMetrics?.itemsCompleted || 0} items completed)
        
        
        SYSTEM CAPABILITIES:
        - Can switch views: "media" (Gallery), "script" (Script Editor), "graph" (Knowledge Graph)
        - Can filter data based on user intent
        - Can suggest follow-up actions
        `;
    }

    private buildSystemPrompt(contextSummary: string): string {
        return `You are the Master Agent for the BACKBONE production ecosystem.
        
        Your goal is to help users navigate their production data, find assets, and understand the state of their projects.
        
        ${contextSummary}
        
        RESPONSE GUIDELINES:
        1. Always be helpful, concise, and professional.
        2. IF changing context (view mode), explain WHY in the "reasoning" field.
        3. "media" view is best for: assets, pitches, dailies, visual content.
        4. "script" view is best for: screenplays, story documents, revisions.
        5. "graph" view is best for: relationships, connecting items, overview of project structure.
        6. If the user asks for "projects", "media" view is usually best to visualize them as cards.
        
        RESPONSE FORMAT:
        You must respond with a JSON object containing:
        {
          "response": "Your natural language response to the user",
          "suggestedContext": "none" | "media" | "script" | "graph",
          "contextData": { ...any specific data IDs to filter by... },
          "followUpSuggestions": ["suggestion 1", "suggestion 2"],
          "reasoning": "Brief explanation of why you chose this view"
        }
        
        EXAMPLE:
        User: "Show me the scripts for the new commercial"
        Response:
        {
          "response": "I found several scripts related to the new commercial. usage. Switching to script view.",
          "suggestedContext": "script",
          "reasoning": "User explicitly asked for scripts",
          "followUpSuggestions": ["Filter by draft", "Show only final versions"]
        }
        `;
    }

    /**
     * Parse Gemini response into structured format
     */
    private parseAgentResponse(responseText: string, globalContext: GlobalContext): AgentResponse {
        try {
            console.log('🔍 [Gemini Service] Parsing response...');
            console.log('📄 [Gemini Service] Response text to parse:', responseText.substring(0, 200) + '...');

            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                console.log('✅ [Gemini Service] Found JSON in response');
                console.log('📦 [Gemini Service] JSON match:', jsonMatch[0].substring(0, 200) + '...');

                const parsed = JSON.parse(jsonMatch[0]);
                console.log('✅ [Gemini Service] Successfully parsed JSON:', parsed);

                // Validate and return
                const result = {
                    response: parsed.response || responseText,
                    suggestedContext: this.validateContextMode(parsed.suggestedContext),
                    contextData: parsed.contextData || null,
                    followUpSuggestions: Array.isArray(parsed.followUpSuggestions)
                        ? parsed.followUpSuggestions.slice(0, 3)
                        : [],
                    reasoning: parsed.reasoning || 'AI analysis'
                };
                console.log('🎯 [Gemini Service] Validated result:', result);
                return result;
            }

            // Fallback: treat entire response as natural language
            console.warn('⚠️ [Gemini Service] No JSON found in response, using fallback');
            return {
                response: responseText,
                suggestedContext: 'none',
                contextData: null,
                followUpSuggestions: [],
                reasoning: 'Natural language response without structured format'
            };

        } catch (error) {
            console.error('❌ [Gemini Service] Error parsing response:', error);
            console.error('❌ [Gemini Service] Failed to parse:', responseText.substring(0, 500));

            return {
                response: responseText,
                suggestedContext: 'none',
                contextData: null,
                followUpSuggestions: [],
                reasoning: 'Failed to parse structured response'
            };
        }
    }

    /**
     * Validate context mode
     */
    private validateContextMode(mode: string): PreviewContextMode {
        const validModes: PreviewContextMode[] = ['none', 'script', 'projects', 'callsheet', 'media', 'pdf', 'graph'];
        return validModes.includes(mode as PreviewContextMode) ? mode as PreviewContextMode : 'none';
    }

    /**
     * Interpret user intent (quick classification)
     */
    async interpretUserIntent(message: string): Promise<PreviewContextMode> {
        const lowerMessage = message.toLowerCase();

        // Quick keyword-based classification for common patterns
        if (lowerMessage.includes('script') || lowerMessage.includes('story')) return 'script';
        if (lowerMessage.includes('project') || lowerMessage.includes('folder')) return 'projects';
        if (lowerMessage.includes('call sheet') || lowerMessage.includes('schedule')) return 'callsheet';
        if (lowerMessage.includes('media') || lowerMessage.includes('video') || lowerMessage.includes('clip')) return 'media';
        if (lowerMessage.includes('pdf') || lowerMessage.includes('document')) return 'pdf';
        if (lowerMessage.includes('graph') || lowerMessage.includes('backbone') || lowerMessage.includes('relationship')) return 'graph';

        // Default to none (Mission Control)
        return 'none';
    }
}

/**
 * Create Gemini Service instance
 * Uses Firebase secret for API key
 */
export function createGeminiService(): GeminiService {
    const apiKey = geminiApiKey.value();

    if (!apiKey) {
        throw new Error('GEMINI_API_KEY secret not configured');
    }

    return new GeminiService(apiKey);
}

/**
 * Export for use in Cloud Functions
 */
export { geminiApiKey };
