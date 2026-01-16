/**
 * Gemini AI Service
 * 
 * Provides intelligent agent responses using Google's Gemini API.
 * Handles context optimization, prompt engineering, and response formatting.
 */

import axios from 'axios';
import { GoogleGenerativeAI, GenerativeModel, SchemaType } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';
import { GlobalContext } from './contextAggregation/GlobalContextService';
import { workflowFunctionDeclarations } from './workflowTools';
import { WorkflowFunctionExecutor } from './workflowFunctionExecutor';
import { dataToolDeclarations } from './dataTools';
import { DataToolExecutor } from './DataToolExecutor';
import { CoreGeminiService, TranscriptionResult, NetworkBibleResult } from './CoreGeminiService';
import { constructSystemPrompt } from './prompts/SystemPrompts';

export interface AIAttachment {
  url: string;
  mimeType: string;
}
// Define secret for Gemini API key
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Preview context modes - Complete list including all God Mode integrations
export type PreviewContextMode =
  // Core
  | 'none' | 'plan_mode' | 'script' | 'projects' | 'callsheet' | 'media' | 'pdf' | 'graph'
  // Phase 1: Shared Resources
  | 'team' | 'contacts' | 'users' | 'files'
  // Phase 2: Production Management
  | 'sessions' | 'timecards' | 'tasks' | 'roles' | 'locations' | 'scenes'
  // Phase 3: Financial & Music
  | 'cuesheets' | 'budgets' | 'music'
  // Phase 4: Additional
  | 'stories' | 'table'
  // Phase 5: High-Level Dashboards
  | 'inventory' | 'cuemusic' | 'calendarevents' | 'scripting'
  // Phase 1: Licensing & Billing
  | 'licenses' | 'subscriptions' | 'invoices' | 'billing'
  // Phase 2: Integrations
  | 'integrations' | 'cloud-storage' | 'communications' | 'airtable'
  // Phase 3: Workflow & Automation
  | 'workflows' | 'automation'
  // Phase 4: Network & Media Processing
  | 'network-delivery' | 'edl' | 'transcription' | 'unified-files'
  // Phase 5: Messaging & Collaboration
  | 'conversations' | 'collaboration'
  // Phase 6: AI & Analytics
  | 'ai-analytics' | 'ai-training'
  // Phase 7: System & Monitoring
  | 'system-health' | 'notifications' | 'reports'
  // Phase 8: Context Engine
  | 'explorer' | 'briefing' | 'knowledge_base';

export interface AgentResponse {
  response: string;
  suggestedContext: PreviewContextMode;
  contextData: any;
  followUpSuggestions: string[];
  reasoning: string;
  // NEW: Dialog system fields
  intent?: string;              // User intent (e.g., 'create_pitch', 'create_script')
  suggestedDialog?: string;     // Dialog ID to open (e.g., 'clipshow_create_pitch')
  prefillData?: Record<string, any>; // Data to pre-fill in dialog
  // NEW: Workflow generation fields
  workflowData?: {
    nodes: any[];
    edges: any[];
    name?: string;
    description?: string;
  };
}

/**
 * Gemini Service Class
 */
export class GeminiService extends CoreGeminiService {
  constructor(apiKey: string) {
    super(apiKey);
  }

  /**
   * Run an Architect/Planner session
   */
  async runArchitectSession(
    message: string,
    globalContext: GlobalContext,
    parts: any[] = []
  ): Promise<AgentResponse> {
    console.log('🏛️ [Gemini Service] Starting ARCHITECT SESSION...');

    // Import the prompt dynamically (or moved to import at top)
    const { ARCHITECT_SYSTEM_PROMPT } = require('./prompts/ArchitectPrompts');

    // Build context information for the Architect
    // CRITICAL: This context is rebuilt on EVERY iteration, so projectId must be included every time
    let contextInfo = '';

    // Add current user and organization context explicitly to prevent hallucination
    contextInfo += `\n\nCURRENT USER & ORG CONTEXT (PERSISTS ACROSS ALL ITERATIONS):\n`;
    contextInfo += `- organizationId: "${globalContext.organizationId}"\n`;
    contextInfo += `- userId: "${globalContext.userId || 'N/A'}"\n`;
    contextInfo += `- timestamp: "${globalContext.timestamp}"\n`;

    // CRITICAL: Add current project context (user's selected project from Hub)
    // This MUST be included in EVERY iteration to maintain context throughout planning
    const currentProjectId = (globalContext as any).currentProjectId;
    if (currentProjectId) {
      contextInfo += `- currentProjectId: "${currentProjectId}"\n`;
      contextInfo += `\n**CRITICAL - REMEMBER THIS ACROSS ALL ITERATIONS**: `;
      contextInfo += `The user is currently working in project "${currentProjectId}". `;
      contextInfo += `This projectId persists throughout the entire planning conversation. `;
      contextInfo += `When creating sessions, tasks, call sheets, timecards, or other project-related items, `;
      contextInfo += `ALWAYS use this projectId automatically unless the user explicitly specifies a different project.\n`;
      contextInfo += `Do NOT ask for projectId - it is already known: "${currentProjectId}".\n`;

      // Try to get project name from dashboard context
      const dashboardProjects = globalContext.dashboard?.projects || [];
      const currentProject = dashboardProjects.find((p: any) => p.id === currentProjectId);
      if (currentProject) {
        contextInfo += `- Current Project Name: "${currentProject.name}"\n`;
        contextInfo += `- Remember: All project-related actions should use projectId "${currentProjectId}" (${currentProject.name})\n`;
      }
    } else {
      contextInfo += `\n**NOTE**: No current project context available. User may need to select a project.\n`;
    }

    if (globalContext.availableShows && globalContext.availableShows.shows.length > 0) {
      contextInfo = '\n\nAVAILABLE SHOWS AND SEASONS:\n';
      globalContext.availableShows.shows.forEach((show) => {
        contextInfo += `- ${show.name} (${show.seasons.length} seasons):\n`;
        show.seasons.forEach((season) => {
          contextInfo += `  - ${season.name} (ID: ${season.id})\n`;
        });
      });
      contextInfo += '\nUse this data to generate multiple-choice options for show/season selection.\n';
    }

    // Prepare history (limit to last few turns for specific plan context)
    const history = globalContext.conversationHistory || [];
    // Limit to prevent context overflow and focus on immediate planning
    const recentHistory = history.slice(-10).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Create a specific model for the Architect with system instruction and JSON mode
    // Using gemini-2.5-flash - gemini-1.5-pro is not available in v1beta API
    const architectModel = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash', // Use Flash for complex planning tasks (Pro not available in v1beta)
      systemInstruction: ARCHITECT_SYSTEM_PROMPT + contextInfo
    });

    // Start chat with Architect Persona
    const chat = architectModel.startChat({
      history: recentHistory,
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    // Send user message
    // If parts has images, we need to restructure the message
    let result;
    if (parts.length > 0) {
      result = await chat.sendMessage([...parts, { text: message }]);
    } else {
      result = await chat.sendMessage(message);
    }

    const responseText = result.response.text();
    console.log('🏛️ [Gemini Service] Architect raw output:', responseText);
    console.log('🏛️ [Gemini Service] Architect output length:', responseText.length);

    const parsed = this.parseArchitectResponse(responseText);
    console.log('🏛️ [Gemini Service] Architect parsed response:', JSON.stringify(parsed, null, 2));
    return parsed;
  }

  private parseArchitectResponse(text: string): AgentResponse {
    try {
      // First, try to extract JSON from markdown code blocks (```json ... ```)
      let jsonStr = '';
      const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        // If no code block, try to find JSON object directly
        // Improved regex to handle cases where the model might omit the opening { or include text before it
        const startIndex = text.indexOf('{');
        const endIndex = text.lastIndexOf('}');

        if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
          throw new Error('No valid JSON object delimiters found in Architect response');
        }

        jsonStr = text.substring(startIndex, endIndex + 1);
      }

      // Clean up the JSON string (remove any trailing commas, etc.)
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      // Determine context: Use architect's suggestion if provided, otherwise default to plan_mode
      let contextMode = 'plan_mode';
      if (parsed.suggestedContext && parsed.suggestedContext !== 'none') {
        contextMode = parsed.suggestedContext;
      } else if (parsed.isComplete) {
        contextMode = 'none';
      }

      return {
        response: parsed.response,
        suggestedContext: contextMode as any,
        contextData: {
          isPlan: true,
          markdown: parsed.planMarkdown,
          isComplete: parsed.isComplete,
          requiresApproval: parsed.requiresApproval || false,
          actions: parsed.actions || [], // Extract execution actions
          multipleChoiceQuestion: parsed.multipleChoiceQuestion || null, // Extract multiple choice question
          responseForm: parsed.responseForm || null, // Extract structured form
          ...parsed.contextData // Include any extra data (e.g. for user list)
        },
        followUpSuggestions: parsed.suggestedActions || [],
        reasoning: "Architect Planning Session"
      } as any; // Cast to avoid strict type issues with custom contextData

    } catch (error) {
      console.error('❌ [Gemini Service] Failed to parse Architect JSON:', error);
      console.error('❌ [Gemini Service] Raw response text:', text.substring(0, 500));
      // Even on parse error, mark as Architect response so frontend knows to treat it as planning
      return {
        response: text, // Fallback to raw text
        suggestedContext: 'plan_mode' as any, // Keep trying
        contextData: {
          isPlan: true, // Mark as plan so frontend recognizes it
          markdown: '', // Empty plan
          isComplete: false,
          requiresApproval: false,
          actions: [],
          multipleChoiceQuestion: null
        },
        followUpSuggestions: [],
        reasoning: "Failed to parse JSON - but still in Architect mode"
      } as any;
    }
  }

  /**
   * Generate intelligent agent response
   */
  async generateAgentResponse(
    message: string,
    globalContext: GlobalContext,
    currentMode: PreviewContextMode = 'none',
    attachments: AIAttachment[] = []
  ): Promise<AgentResponse> {
    try {
      console.log('🧠 [Gemini Service] Starting response generation...');
      console.log('📝 [Gemini Service] User message:', message);
      console.log(`🎯 [Gemini Service] Current mode:`, currentMode);
      console.log(`🎯 [Gemini Service] globalContext.activeMode:`, (globalContext as any).activeMode);

      // Interpret intent to see if we should auto-route to Architect
      const interpretedIntent = await this.interpretUserIntent(message);
      console.log(`🎯 [Gemini Service] Interpreted intent:`, interpretedIntent);

      // CRITICAL: Architect/Plan Mode Check - MUST happen FIRST before any other processing
      const activeModeValue = (globalContext as any).activeMode;
      const currentModeValue = currentMode as string;

      // Route to Architect if in plan_mode OR if user wants a report/analysis
      const shouldUseArchitect =
        activeModeValue === 'plan_mode' ||
        currentModeValue === 'plan_mode' ||
        interpretedIntent === 'reports';

      console.log(`🏛️ [Gemini Service] Architect routing check (FIRST):`);
      console.log(`  - globalContext.activeMode: "${activeModeValue}"`);
      console.log(`  - currentMode: "${currentModeValue}"`);
      console.log(`  - interpretedIntent: "${interpretedIntent}"`);
      console.log(`  - shouldUseArchitect: ${shouldUseArchitect}`);

      if (shouldUseArchitect) {
        console.log('🏛️ [Gemini Service] ✅ ROUTING TO ARCHITECT SESSION (early check)');
        // Prepare parts for attachments if any
        const parts: any[] = [];
        if (attachments && attachments.length > 0) {
          for (const att of attachments) {
            try {
              const base64Data = await this.fetchAttachment(att.url);
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: base64Data
                }
              });
            } catch (e) {
              console.error(`❌ [Gemini Service] Failed to fetch attachment: ${att.url}`, e);
            }
          }
        }
        return await this.runArchitectSession(message, globalContext, parts);
      }

      // Check if this is a workflow building request
      // NEW: Check for explicit "Plan" vs "Graph" intent passed from Frontend Context
      if (currentMode === 'workflows') {
        const workflowAction = (globalContext as any).workflowAction || 'auto'; // 'plan', 'graph', 'auto'

        if (workflowAction === 'plan') {
          return await this.generateWorkflowPlan(message, globalContext);
        }

        if (workflowAction === 'graph_from_plan') {
          return await this.generateWorkflowGraphFromPlan(message, globalContext);
        }

        const isWorkflowRequest = this.detectWorkflowIntent(message);
        if (isWorkflowRequest) {
          return await this.generateWorkflowResponse(message, globalContext, attachments);
        }
      }

      // Build optimized context summary
      const contextSummary = this.buildContextSummary(globalContext);
      console.log('📊 [Gemini Service] Context summary:', contextSummary);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(contextSummary);
      console.log('🎨 [Gemini Service] System prompt length:', systemPrompt.length, 'chars');

      // Build user prompt
      const userPrompt = `Current View: ${currentMode}\nUser Message: ${message}\n\nAnalyze the user's intent and provide a helpful response. Determine the best view mode for their request.`;
      console.log('💬 [Gemini Service] User prompt:', userPrompt);

      // Prepare parts
      // Prepare parts
      const parts: any[] = [];

      // Process attachments
      if (attachments && attachments.length > 0) {
        console.log(`📎 [Gemini Service] Processing ${attachments.length} attachments...`);
        for (const att of attachments) {
          try {
            const base64Data = await this.fetchAttachment(att.url);
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: base64Data
              }
            });
            console.log(`📎 [Gemini Service] Added attachment: ${att.mimeType}`);
          } catch (e) {
            console.error(`❌ [Gemini Service] Failed to fetch attachment: ${att.url}`, e);
            // Continue without failing the whole request
          }
        }
      }

      // Architect check already happened at the beginning - if we reach here, we're using standard agent
      console.log(`🏛️ [Gemini Service] Using standard agent (Architect check already passed)`);


      parts.push({ text: userPrompt });

      // Call Gemini API
      // Call Gemini API with Structured Output (JSON Mode)
      console.log('🚀 [Gemini Service] Calling Gemini API (Structured Output)...');

      const generationConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            response: { type: SchemaType.STRING },
            suggestedContext: { type: SchemaType.STRING },
            // contextData can be anything, so we can't strict type it easily in Gemini schema yet,
            // but for now we'll ask for it as an OBJECT if possible, or handle it in prompt.
            // Gemini SDK schema is strict. Let's omit complex 'any' fields for now and rely on prompt
            // or define a generic object structure. 
            // Actually, for flexibility, let's keep it simple or define key fields.
            intent: { type: SchemaType.STRING },
            suggestedDialog: { type: SchemaType.STRING },
            reasoning: { type: SchemaType.STRING },
            followUpSuggestions: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          },
          required: ['response', 'suggestedContext', 'reasoning']
        }
      };

      const result = await this.model.generateContent({
        systemInstruction: systemPrompt,
        contents: [{ role: 'user', parts: parts }],
        generationConfig: generationConfig as any
      });

      const responseText = result.response.text();
      console.log('✅ [Gemini Service] Raw API response:', responseText);
      console.log('📏 [Gemini Service] Response length:', responseText.length, 'chars');



      // Parse response and extract structured data
      const parsedResponse = this.parseAgentResponse(responseText, globalContext);
      console.log('🎯 [Gemini Service] Parsed response:', JSON.stringify(parsedResponse, null, 2));



      return parsedResponse;

    } catch (error) {
      // 🔥 IMPROVED: Better error logging to diagnose issues
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorName = error instanceof Error ? error.name : 'UnknownError';

      console.error('❌ [Gemini Service] Error generating response:', {
        name: errorName,
        message: errorMessage,
        stack: errorStack,
        currentMode,
        messageLength: message.length,
        hasContext: !!globalContext,
        organizationId: globalContext?.organizationId
      });

      // 🔥 IMPROVED: More helpful error message that includes the actual error
      const userFriendlyMessage = errorMessage.includes('API key')
        ? "I'm having trouble connecting to the AI service. Please check the API configuration."
        : errorMessage.includes('quota') || errorMessage.includes('rate limit')
          ? "The AI service is currently busy. Please try again in a moment."
          : errorMessage.includes('timeout')
            ? "The request took too long to process. Please try again with a shorter message."
            : "I'm having trouble processing your request right now. Please try again.";

      // Fallback response
      return {
        response: userFriendlyMessage,
        suggestedContext: currentMode,
        contextData: null,
        followUpSuggestions: ['Try rephrasing your question', 'Check system status'],
        reasoning: `Error occurred during AI processing: ${errorMessage}`
      };
    }
  }

  /**
   * Fetch attachment from URL and convert to Base64
   */
  private async fetchAttachment(url: string): Promise<string> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' });
      return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) {
      throw new Error(`Failed to fetch attachment: ${error}`);
    }
  }

  /**
   * Detect if user wants to build a workflow
   */
  private detectWorkflowIntent(message: string): boolean {
    const lower = message.toLowerCase();
    const workflowKeywords = [
      'workflow', 'create workflow', 'build workflow', 'make workflow',
      'generate workflow', 'design workflow', 'new workflow', 'workflow template',
      'post-production workflow', 'production workflow', 'approval workflow',
      'linear workflow', 'parallel workflow', 'review stages', 'workflow steps',
      'workflow plan', 'draft workflow', 'architect workflow'
    ];
    return workflowKeywords.some(keyword => lower.includes(keyword));
  }

  /**
   * NEW: Generate a textual Plan for a workflow (Step 1 of Architect)
   */
  async generateWorkflowPlan(
    message: string,
    globalContext: GlobalContext
  ): Promise<AgentResponse> {
    try {
      console.log('📝 [Gemini Service] Generating workflow plan...');

      // Get available roles
      const availableRoles = this.extractAvailableRoles(globalContext);

      // Build Prompt
      const planPrompt = `
You are an expert Post-Production Workflow Architect.
Your goal is to draft a comprehensive, text-based plan for a new workflow based on the user's request.

CONTEXT:
${this.buildContextSummary(globalContext)}

ROLES AVAILABLE:
${availableRoles.map(r => r.displayName).join(', ')}

INSTRUCTIONS:
1. Analyze the user's request.
2. Outline the necessary steps (phases, tasks, approvals).
3. Suggest appropriate roles for each step.
4. Identify critical decision points.
5. Format the output as a clean, structured MARKDOWN document.
   - Use headings for Phases.
   - Bullet points for Tasks.
   - **Bold** for Roles or Critical Actions.

DO NOT generate JSON code. Just the strategic plan in Markdown.
`;

      const parts = [
        { text: planPrompt },
        { text: `USER REQUEST: "${message}"\n\nUnknown Phase/Goal details should be inferred reasonably.` }
      ];

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: parts }]
      });

      const planText = result.response.text();

      return {
        response: planText, // The Markdown Plan
        suggestedContext: 'workflows',
        intent: 'workflow_plan_generated',
        contextData: { isPlan: true }, // Marker for frontend
        followUpSuggestions: ['Generate Graph from Plan', 'Refine Plan'],
        reasoning: 'Generated strategic workflow plan for review'
      };

    } catch (error) {
      console.error('❌ [Gemini Service] Error generating workflow plan:', error);
      throw error;
    }
  }

  /**
   * NEW: Generate Graph JSON from an approved Plan (Step 2 of Architect)
   */
  async generateWorkflowGraphFromPlan(
    planMarkdown: string,
    globalContext: GlobalContext
  ): Promise<AgentResponse> {
    try {
      console.log('🏗️ [Gemini Service] Converting plan to graph...');

      const availableRoles = this.extractAvailableRoles(globalContext);
      const systemPrompt = this.buildWorkflowSystemPrompt(availableRoles);

      const conversionPrompt = `
User has approved the following Workflow Plan. 
Convert this EXACT plan into a standard JSON Flow Graph using the Node/Edge structure defined in your system prompt.

APPROVED PLAN:
${planMarkdown}

REQUIREMENTS:
- Implement all steps from the plan.
- Assign roles as specified in the plan (map to closest available ID).
- Connect edges logically (linear or parallel).
- Return ONLY the JSON structure for the workflow data.
`;

      const parts = [
        { text: systemPrompt },
        { text: conversionPrompt }
      ];

      const result = await this.model.generateContent(parts);
      const responseText = result.response.text();

      // Parse workflow response
      const parsed = this.parseWorkflowResponse(responseText, "Generated from Plan");

      return {
        response: "I've built the workflow graph from your plan. You can now preview it on the canvas.",
        suggestedContext: 'workflows',
        intent: 'workflow_graph_generated',
        workflowData: parsed.workflowData,
        contextData: { isGraph: true },
        followUpSuggestions: ['Apply to Canvas', 'Save Template'],
        reasoning: 'Converted approved plan to executable graph'
      };

    } catch (error) {
      console.error('❌ [Gemini Service] Error generating graph from plan:', error);
      throw error;
    }
  }

  /**
   * Generate workflow-specific response with nodes and edges
   */
  private async generateWorkflowResponse(
    message: string,
    globalContext: GlobalContext,
    attachments: AIAttachment[] = []
  ): Promise<AgentResponse> {
    try {
      console.log('🔧 [Gemini Service] Generating workflow response...');

      // Get available roles from context
      const availableRoles = this.extractAvailableRoles(globalContext);

      // Build workflow-specific system prompt
      const workflowPrompt = this.buildWorkflowSystemPrompt(availableRoles);

      // Build user prompt with workflow requirements
      // Build user prompt with workflow requirements
      const userPrompt = `User Request: ${message}\n\nGenerate a workflow template based on this description. Include nodes, edges, and role assignments.`;

      // Prepare parts
      const parts: any[] = [{ text: workflowPrompt }];

      // Process attachments
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          try {
            const base64Data = await this.fetchAttachment(att.url);
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: base64Data
              }
            });
          } catch (e) {
            console.error(`❌ [Gemini Service] Failed to fetch attachment for workflow`, e);
          }
        }
      }

      parts.push({ text: userPrompt });

      // Call Gemini API
      const result = await this.model.generateContent(parts);

      const responseText = result.response.text();
      console.log('✅ [Gemini Service] Workflow response:', responseText.substring(0, 500));

      // Parse workflow response
      const parsed = this.parseWorkflowResponse(responseText, message);

      return {
        response: parsed.explanation || 'I\'ve generated a workflow based on your description. Review it below and apply it to the canvas when ready.',
        suggestedContext: 'workflows',
        contextData: {
          workflowData: parsed.workflowData
        },
        followUpSuggestions: [
          'Apply to canvas',
          'Modify workflow',
          'Save as template'
        ],
        reasoning: 'Generated workflow template from user description'
      };

    } catch (error) {
      console.error('❌ [Gemini Service] Error generating workflow:', error);
      return {
        response: 'I encountered an error generating the workflow. Please try rephrasing your request.',
        suggestedContext: 'workflows',
        contextData: null,
        followUpSuggestions: ['Try a simpler description', 'Specify number of steps'],
        reasoning: 'Error during workflow generation'
      };
    }
  }

  /**
   * Generate workflow response with function calling (multi-turn agentic)
   */
  async generateWorkflowResponseWithFunctions(
    message: string,
    globalContext: GlobalContext,
    conversationHistory: Array<{ role: string; parts: any[] }> = [],
    maxTurns: number = 5,
    attachments: AIAttachment[] = []
  ): Promise<AgentResponse> {
    try {
      console.log('🔧 [Gemini Service] Starting function calling workflow generation...');
      console.log('🔧 [Gemini Service] Message length:', message.length);
      console.log('🔧 [Gemini Service] Conversation history length:', conversationHistory.length);
      console.log('🔧 [Gemini Service] Max turns:', maxTurns);
      console.log('🔧 [Gemini Service] Function declarations count:', workflowFunctionDeclarations.length);

      // Validate API key
      if (!this.genAI) {
        throw new Error('Gemini AI client not initialized. API key may be missing.');
      }

      // Combine all tools: Workflow, Hardcoded Data Tools, and Dynamic Shared Tools
      const { sharedToolDeclarations } = await import('./dataTools');
      const allTools = [
        ...workflowFunctionDeclarations,
        ...dataToolDeclarations,
        ...sharedToolDeclarations
      ];

      // Validate function declarations
      if (!allTools || allTools.length === 0) {
        throw new Error('No function declarations available for generation');
      }

      // Create model with function declarations
      // Using gemini-2.5-flash (same as CoreGeminiService) - gemini-1.5-pro is not available in v1beta API
      let model;
      try {
        model = this.genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          tools: [{ functionDeclarations: allTools as any }]
        });
        console.log('✅ [Gemini Service] Model created successfully with gemini-2.5-flash');
      } catch (modelError: any) {
        console.error('❌ [Gemini Service] Error creating model:', modelError);
        throw new Error(`Failed to create Gemini model: ${modelError.message}`);
      }

      let turnCount = 0;
      let functionResults: any[] = [];

      // Transform conversation history from frontend format to Gemini SDK format
      // Frontend sends: { role: 'user' | 'assistant', content: string }
      // Gemini SDK expects: { role: 'user' | 'model', parts: [{ text: string }] }
      const history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      // Only process non-empty conversation history
      if (conversationHistory && conversationHistory.length > 0) {
        conversationHistory.forEach((msg: any, index: number) => {
          try {
            // Extract text content - handle multiple formats
            let text = '';
            if (typeof msg === 'string') {
              text = msg;
            } else if (msg.content && typeof msg.content === 'string') {
              text = msg.content;
            } else if (msg.text && typeof msg.text === 'string') {
              text = msg.text;
            } else if (msg.parts && Array.isArray(msg.parts) && msg.parts[0]) {
              const firstPart = msg.parts[0];
              if (firstPart && typeof firstPart === 'object' && firstPart.text) {
                text = firstPart.text;
              } else if (typeof firstPart === 'string') {
                text = firstPart;
              }
            }

            // Skip if no text found
            if (!text || text.trim().length === 0) {
              console.warn(`⚠️ [Gemini Service] Skipping message ${index} - no text content found`);
              return;
            }

            // Determine role - convert 'assistant' to 'model'
            let role: 'user' | 'model' = 'user';
            if (msg.role === 'assistant' || msg.role === 'model') {
              role = 'model';
            } else if (msg.role === 'user') {
              role = 'user';
            }

            // Create clean message object - ensure parts only contains { text: string }
            history.push({
              role,
              parts: [{ text: text.trim() }]
            });
          } catch (err: any) {
            console.error(`❌ [Gemini Service] Error processing message ${index}:`, err);
            // Skip this message and continue
          }
        });
      }

      console.log('🔧 [Gemini Service] Transformed history length:', history.length);
      if (history.length > 0) {
        console.log('🔧 [Gemini Service] First message structure:', JSON.stringify({
          role: history[0].role,
          partsIsArray: Array.isArray(history[0].parts),
          partsLength: history[0].parts.length,
          firstPart: history[0].parts[0] ? {
            type: typeof history[0].parts[0],
            keys: Object.keys(history[0].parts[0]),
            hasText: 'text' in history[0].parts[0],
            hasRole: 'role' in history[0].parts[0],
            hasParts: 'parts' in history[0].parts[0],
            textValue: typeof history[0].parts[0].text === 'string' ? history[0].parts[0].text.substring(0, 50) : 'N/A'
          } : null
        }, null, 2));

        // Validate each message in history
        history.forEach((msg: any, idx: number) => {
          if (!msg || !msg.role || !Array.isArray(msg.parts) || msg.parts.length === 0) {
            console.error(`❌ [Gemini Service] Invalid message at index ${idx}:`, JSON.stringify(msg, null, 2));
          } else if (msg.parts[0] && ('role' in msg.parts[0] || 'parts' in msg.parts[0])) {
            console.error(`❌ [Gemini Service] Message at index ${idx} has nested role/parts in parts[0]:`, JSON.stringify(msg, null, 2));
          }
        });
      }

      // Get available roles
      const availableRoles = this.extractAvailableRoles(globalContext);
      console.log('🔧 [Gemini Service] Available roles count:', availableRoles.length);

      // Get session context if available
      const sessionContext = globalContext.sessions;
      console.log('🔧 [Gemini Service] Has session context:', !!sessionContext?.currentSession);

      // Add system prompt
      let systemPrompt: string;
      try {
        systemPrompt = this.buildWorkflowSystemPrompt(availableRoles, sessionContext);
        console.log('✅ [Gemini Service] System prompt built, length:', systemPrompt.length);
      } catch (promptError: any) {
        console.error('❌ [Gemini Service] Error building system prompt:', promptError);
        throw new Error(`Failed to build system prompt: ${promptError.message}`);
      }

      // For startChat, we need to format history correctly
      // The history should be an array of content objects: { role: 'user' | 'model', parts: [{ text: string }] }
      // But we should NOT include the system prompt in history - it should be in systemInstruction
      // And we should NOT include the current user message - that will be sent via sendMessage
      const chatHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [...history];

      // Validate chat history structure before passing to startChat
      const isValidChatHistory = chatHistory.every((msg: any) => {
        return msg &&
          (msg.role === 'user' || msg.role === 'model') &&
          Array.isArray(msg.parts) &&
          msg.parts.length > 0 &&
          msg.parts[0] &&
          typeof msg.parts[0] === 'object' &&
          typeof msg.parts[0].text === 'string' &&
          !msg.parts[0].role && // Ensure no nested role
          !msg.parts[0].parts; // Ensure no nested parts
      });

      if (!isValidChatHistory && chatHistory.length > 0) {
        console.error('❌ [Gemini Service] Invalid chat history structure!');
        console.error('❌ [Gemini Service] First invalid message:', JSON.stringify(chatHistory.find((msg: any) => {
          return !(msg &&
            (msg.role === 'user' || msg.role === 'model') &&
            Array.isArray(msg.parts) &&
            msg.parts.length > 0 &&
            msg.parts[0] &&
            typeof msg.parts[0] === 'object' &&
            typeof msg.parts[0].text === 'string' &&
            !msg.parts[0].role &&
            !msg.parts[0].parts);
        }), null, 2));
        throw new Error('Invalid chat history structure for startChat');
      }

      console.log('✅ [Gemini Service] Chat history prepared, length:', chatHistory.length);
      console.log('✅ [Gemini Service] System prompt will be included in systemInstruction');

      // CRITICAL: startChat requires the first message in history to have role 'user'
      // If the history starts with a 'model' message, we need to skip leading model messages
      let validChatHistory = [...chatHistory];
      if (validChatHistory.length > 0 && validChatHistory[0].role === 'model') {
        console.warn('⚠️ [Gemini Service] History starts with model message, skipping leading model messages...');
        // Find the first user message
        const firstUserIndex = validChatHistory.findIndex(msg => msg.role === 'user');
        if (firstUserIndex > 0) {
          console.warn(`⚠️ [Gemini Service] Skipping ${firstUserIndex} leading model message(s)`);
          validChatHistory = validChatHistory.slice(firstUserIndex);
        } else if (firstUserIndex === -1) {
          // No user messages found, use empty history (current message will be the first)
          console.warn('⚠️ [Gemini Service] No user messages in history, using empty history');
          validChatHistory = [];
        }
      }

      // Final validation: ensure first message is from user if history is not empty
      if (validChatHistory.length > 0 && validChatHistory[0].role !== 'user') {
        console.error('❌ [Gemini Service] First message in history must be from user, got:', validChatHistory[0].role);
        console.error('❌ [Gemini Service] History:', JSON.stringify(validChatHistory.slice(0, 3), null, 2));
        // Use empty history as fallback
        validChatHistory = [];
      }

      console.log('✅ [Gemini Service] Final chat history length:', validChatHistory.length);
      if (validChatHistory.length > 0) {
        console.log('✅ [Gemini Service] First message role:', validChatHistory[0].role);
      }

      // For function calling with multi-turn conversations, use startChat
      // System prompt should be passed as systemInstruction, not in history
      // If history is empty, pass empty array (not undefined)
      // systemInstruction must be a Content object with role and parts
      const chat = model.startChat({
        history: validChatHistory, // Only conversation history, no system prompt or current message
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemPrompt }]
        }
      });

      console.log('✅ [Gemini Service] Chat started with history length:', chatHistory.length);

      // Track if we've sent the initial message
      let initialMessageSent = false;

      while (turnCount < maxTurns) {
        console.log(`🔄 [Gemini Service] Turn ${turnCount + 1}/${maxTurns}`);

        let result;
        let response;
        try {
          if (!initialMessageSent) {
            // Send the current user message (last item in fullHistory)
            console.log('🔧 [Gemini Service] Sending initial user message');

            // Prepare parts with attachments if they exist
            const parts: any[] = [{ text: message }];

            if (attachments && attachments.length > 0) {
              for (const att of attachments) {
                try {
                  const base64Data = await this.fetchAttachment(att.url);
                  parts.push({
                    inlineData: {
                      mimeType: att.mimeType,
                      data: base64Data
                    }
                  });
                } catch (e) {
                  console.error(`❌ [Gemini Service] Failed to fetch attachment for function calling`, e);
                }
              }
            }

            result = await chat.sendMessage(parts);
            initialMessageSent = true;
          } else {
            // After function execution, continue the chat
            // The chat object automatically includes function results in the next request
            console.log('🔧 [Gemini Service] Continuing chat after function execution');
            // Send empty message to continue - the chat will use function results from history
            result = await chat.sendMessage('');
          }

          response = result.response;
        } catch (genError: any) {
          console.error('❌ [Gemini Service] Error calling Gemini API:', genError);
          console.error('❌ [Gemini Service] Gemini API error details:', {
            name: genError?.name,
            message: genError?.message,
            code: genError?.code,
            status: genError?.status,
            statusText: genError?.statusText
          });
          throw genError; // Re-throw to be caught by outer catch
        }

        // Check if agent wants to call a function
        const functionCalls = response.functionCalls();

        if (!functionCalls || functionCalls.length === 0) {
          // Agent is done, return final response
          const text = response.text();
          console.log('✅ [Gemini Service] Function calling complete, returning final response');
          return this.parseWorkflowResponseWithFunctions(text, functionResults);
        }

        console.log(`🔧 [Gemini Service] Executing ${functionCalls.length} function call(s)`);

        // Execute function calls
        const functionResponses = [];
        for (const functionCall of functionCalls) {
          console.log(`⚙️ [Gemini Service] Executing function: ${functionCall.name}`);
          console.log(`⚙️ [Gemini Service] Function args:`, JSON.stringify(functionCall.args, null, 2).substring(0, 500));

          let functionResult;
          try {
            // Determine which executor to use
            const isDataTool = dataToolDeclarations.some(t => t.name === functionCall.name);

            if (isDataTool) {
              console.log(`⚙️ [Gemini Service] Routing to DataToolExecutor: ${functionCall.name}`);
              functionResult = await DataToolExecutor.executeTool(
                functionCall.name,
                functionCall.args,
                globalContext.organizationId,
                globalContext.userId || ''
              );
            } else {
              console.log(`⚙️ [Gemini Service] Routing to WorkflowFunctionExecutor: ${functionCall.name}`);
              functionResult = await WorkflowFunctionExecutor.executeFunction(
                functionCall.name,
                functionCall.args,
                globalContext.organizationId,
                globalContext.userId || ''
              );
            }
          } catch (execError: any) {
            console.error(`❌ [Gemini Service] Error executing function ${functionCall.name}:`, execError);
            console.error(`❌ [Gemini Service] Function execution error details:`, {
              name: execError?.name,
              message: execError?.message,
              stack: execError?.stack?.substring(0, 500)
            });
            // Return error result instead of throwing
            functionResult = {
              success: false,
              error: execError?.message || `Failed to execute function ${functionCall.name}`,
              validationErrors: []
            };
          }

          functionResults.push({
            function: functionCall.name,
            args: functionCall.args,
            result: functionResult
          });

          // Format function response for Gemini SDK chat API
          // The chat API expects function responses in a specific format
          functionResponses.push({
            functionResponse: {
              name: functionCall.name,
              response: functionResult
            }
          });

          console.log(`✅ [Gemini Service] Function ${functionCall.name} completed: ${functionResult.success ? 'success' : 'failed'}`);
        }

        // After executing functions, we need to send the function results back to the chat
        // The chat API handles this by calling sendMessage with function responses
        // But first, we need to get the model's response text (if any)
        const modelText = response.text() || '';

        // For the next turn, the chat will automatically include function results
        // when we call sendMessage again, but we need to structure it correctly
        // The chat object maintains its own history, so we just need to continue
        console.log(`✅ [Gemini Service] Function results processed, will continue in next turn`);

        turnCount++;
      }

      // Max turns reached, return with function results
      console.log(`⚠️ [Gemini Service] Max turns (${maxTurns}) reached`);
      return {
        response: "I've completed the workflow operations. Review the results below.",
        workflowData: this.extractWorkflowFromResults(functionResults),
        contextData: { functionResults, turns: turnCount },
        suggestedContext: 'workflows',
        followUpSuggestions: [],
        reasoning: `Completed ${turnCount} function calls`
      };
    } catch (error: any) {
      // Declare variables in catch scope for error logging
      let turnCount = 0;
      let functionResults: any[] = [];

      console.error('❌ [Gemini Service] Error in function calling:', error);
      console.error('❌ [Gemini Service] Error name:', error?.name);
      console.error('❌ [Gemini Service] Error message:', error?.message);
      console.error('❌ [Gemini Service] Error stack:', error?.stack);
      console.error('❌ [Gemini Service] Error code:', error?.code);
      console.error('❌ [Gemini Service] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('❌ [Gemini Service] Context at error:', {
        turnCount,
        functionResultsCount: functionResults.length,
        messageLength: message.length,
        hasGlobalContext: !!globalContext,
        organizationId: globalContext?.organizationId
      });

      // Include error details in response for debugging
      const errorMessage = error?.message || 'Unknown error';
      const errorDetails = error?.stack ? error.stack.substring(0, 500) : 'No stack trace available';

      return {
        response: `I encountered an error while processing your workflow request: ${errorMessage}. Please try again or rephrase your request.`,
        suggestedContext: 'workflows',
        contextData: {
          error: errorMessage,
          errorDetails: errorDetails,
          functionResults: functionResults.length > 0 ? functionResults : undefined
        },
        followUpSuggestions: ['Try a simpler request', 'Rephrase your workflow description', 'Check that all required fields are provided'],
        reasoning: `Error during function calling workflow generation: ${errorMessage}`
      };
    }
  }

  private extractWorkflowFromResults(functionResults: any[]): any {
    // Extract final workflow from function results
    for (let i = functionResults.length - 1; i >= 0; i--) {
      const result = functionResults[i];
      if (result.function === 'create_workflow' || result.function === 'modify_workflow') {
        return result.result.data?.workflow || result.result.data;
      }
    }
    return null;
  }

  private parseWorkflowResponseWithFunctions(text: string, functionResults: any[]): AgentResponse {
    // Parse text response and combine with function results
    const workflowData = this.extractWorkflowFromResults(functionResults);

    return {
      response: text,
      workflowData: workflowData,
      contextData: { functionResults },
      suggestedContext: 'workflows',
      followUpSuggestions: workflowData ? ['Apply to canvas', 'Save as template'] : [],
      reasoning: 'Workflow generated via function calling'
    };
  }

  /**
   * Build system prompt for workflow generation
   */
  private buildWorkflowSystemPrompt(
    availableRoles: Array<{ id: string; name: string; displayName: string }>,
    sessionContext?: any
  ): string {
    const rolesList = availableRoles.length > 0
      ? availableRoles.map(r => `${r.displayName} (${r.id})`).join(', ')
      : 'EDITOR, COLORIST, SOUND_DESIGNER, PRODUCER, POST_COORDINATOR, QC_SPECIALIST';

    // Build session context section if available
    let sessionInfo = '';
    try {
      if (sessionContext?.currentSession) {
        const session = sessionContext.currentSession;
        sessionInfo = `Session: ${session.name} | Status: ${session.status} | Phase: ${session.phase}`;
      }
    } catch (error) {
      sessionInfo = '';
    }

    return `You are a Workflow Architect AI. Generate workflows as JSON with nodes and edges for a React Flow designer.

${sessionInfo ? sessionInfo + '\n\n' : ''}Available Roles: ${rolesList}

WORKFLOW STRUCTURE:
- Nodes: id, type (start/end/task/agent/approval/decision), position {x,y}, data {label, assignedRole, taskType, estimatedHours}
- Edges: id, source, target, type
- Agent nodes: role (COORDINATOR/QC_BOT/INGEST_BOT/DELIVERY_BOT), networkMode, executionMode, skills

NODE TYPES: start (required), end (required), task, agent, approval, decision
TASK TYPES: EDITORIAL, COLOR, AUDIO, QC, INGEST, GRAPHICS, REVIEW, COMMUNICATION
AGENT ROLES: COORDINATOR (orchestration), QC_BOT (quality control), INGEST_BOT (media ingestion), DELIVERY_BOT (delivery automation)

PHASES:
1. PRE_PRODUCTION: Planning, team assignment, setup
2. PRODUCTION: On-set tasks, media capture, dailies
3. POST_PRODUCTION: Edit, color, audio, graphics, QC, review
4. DELIVERY: Final QC, export, network delivery, archive

RESPONSE FORMAT (JSON only, no markdown):
{
  "explanation": "Brief description",
  "workflowData": {
    "name": "Workflow Name",
    "description": "Description",
    "nodes": [{"id": "node-1", "type": "start", "position": {"x": 100, "y": 200}, "data": {"label": "Start"}}],
    "edges": [{"id": "edge-1-2", "source": "node-1", "target": "node-2"}]
  }
}

LAYOUT: Start at x:100, y:200. Space nodes 250px horizontally or 150px vertically. Max 5-6 nodes per row.

RULES:
- Always include ONE start node and ONE end node
- Position nodes left-to-right for linear flow
- Use appropriate roles for task types
- Match workflow to session phase/status
- Suggest AI agents when beneficial (QC_BOT for validation, INGEST_BOT for media, DELIVERY_BOT for exports)
- Return ONLY valid JSON, no markdown formatting`;
  }

  /**
   * Extract available roles from global context
   */
  private extractAvailableRoles(globalContext: GlobalContext): Array<{ id: string; name: string; displayName: string }> {
    // Default roles if context doesn't provide them
    const defaultRoles = [
      { id: 'EDITOR', name: 'Editor', displayName: 'Editor' },
      { id: 'ASSISTANT_EDITOR', name: 'Assistant Editor', displayName: 'Assistant Editor' },
      { id: 'COLORIST', name: 'Colorist', displayName: 'Colorist' },
      { id: 'SOUND_DESIGNER', name: 'Sound Designer', displayName: 'Sound Designer' },
      { id: 'PRODUCER', name: 'Producer', displayName: 'Producer' },
      { id: 'POST_COORDINATOR', name: 'Post Coordinator', displayName: 'Post Coordinator' },
      { id: 'QC_SPECIALIST', name: 'QC Specialist', displayName: 'QC Specialist' }
    ];

    // Try to extract from context if available
    // Note: TeamContext doesn't have roles property, so we use default roles
    // If roles are needed from context, they should be added to TeamContext interface

    return defaultRoles;
  }

  /**
   * Parse workflow response from AI
   */
  private parseWorkflowResponse(responseText: string, originalMessage: string): {
    explanation: string;
    workflowData: {
      name: string;
      description: string;
      nodes: any[];
      edges: any[];
    };
  } {
    try {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.workflowData) {
          return {
            explanation: parsed.explanation || 'Workflow generated successfully',
            workflowData: parsed.workflowData
          };
        }
      }

      // Fallback: Generate a simple workflow
      return {
        explanation: 'I\'ve created a basic workflow based on your description. You can modify it on the canvas.',
        workflowData: {
          name: `Workflow: ${originalMessage.substring(0, 50)}`,
          description: `Generated workflow based on: ${originalMessage}`,
          nodes: [
            { id: 'node-1', type: 'start', position: { x: 100, y: 200 }, data: { label: 'Start' } },
            { id: 'node-2', type: 'task', position: { x: 350, y: 200 }, data: { label: 'Task 1', assignedRole: 'EDITOR' } },
            { id: 'node-3', type: 'end', position: { x: 600, y: 200 }, data: { label: 'Complete' } }
          ],
          edges: [
            { id: 'edge-1-2', source: 'node-1', target: 'node-2', type: 'default' },
            { id: 'edge-2-3', source: 'node-2', target: 'node-3', type: 'default' }
          ]
        }
      };
    } catch (error) {
      console.error('❌ [Gemini Service] Error parsing workflow response:', error);
      throw error;
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

    // PWS Workflow information
    const pwsWorkflows = globalContext.pwsWorkflows;
    const workflowInfo = pwsWorkflows ? `
        - Workflow Templates: ${pwsWorkflows.statistics.totalTemplates} available
        - Active Workflows: ${pwsWorkflows.statistics.totalActiveWorkflows} sessions
        - Average Complexity: ${pwsWorkflows.statistics.averageWorkflowComplexity.toFixed(1)} nodes per workflow
        ${pwsWorkflows.statistics.mostUsedTemplate ? `- Most Used: "${pwsWorkflows.statistics.mostUsedTemplate}"` : ''}
    ` : '';

    // Budget & Inventory Information
    const budgets = globalContext.budgets;
    const budgetInfo = budgets ? `
        - Budgets: ${budgets.activeBudgets} active / ${budgets.totalBudgets} total
        - Financial Health: $${(budgets.totalSpent || 0).toLocaleString()} spent of $${(budgets.totalBudgeted || 0).toLocaleString()} budgeted
    ` : '';

    const inventory = globalContext.inventory;
    const inventoryInfo = inventory ? `
        - Inventory: ${inventory.availableItems} available, ${inventory.checkedOutItems} checked out (${inventory.totalItems} total)
        - Alerts: ${inventory.lowStockItems} low stock items
    ` : '';

    return `
        CONTEXT SUMMARY:
        - Organization: ${globalContext.organizationId || 'Unknown'}
        - Dashboard Projects: ${globalContext.dashboard?.activeProjects || 0}
        - Active Licenses: ${globalContext.licensing?.activeLicenses || 0}
        - Team Members: ${globalContext.team?.activeMembers || 0}
        - Velocity: ${velocityMetrics?.completionRate || 0}% completion rate (${velocityMetrics?.itemsCompleted || 0} items completed)
        ${workflowInfo}
        ${budgetInfo}
        ${inventoryInfo}
        
        SYSTEM CAPABILITIES:
        - Can switch views: "media" (Gallery), "script" (Script Editor), "graph" (Knowledge Graph), "pws-workflows" (Workflow System)
        - Can filter data based on user intent
        - Can suggest follow-up actions
        - Can query and analyze workflows (read-only)
        - Can analyze budgets and inventory status
        - NOTE: Workflow CREATION must be done in PWS Workflow Architect, not here
        `;
  }

  private buildSystemPrompt(contextSummary: string): string {
    return constructSystemPrompt(contextSummary);
  }

  /**
   * Parse agent response to extract structured data
   * Now using native JSON parsing effectively
   */
  private parseAgentResponse(responseText: string, globalContext: GlobalContext): AgentResponse {
    try {
      console.log('🧩 [Gemini Service] Parsing structured response');
      const parsed = JSON.parse(responseText);

      // Validate context mode
      const validMode = this.validateContextMode(parsed.suggestedContext);

      return {
        response: parsed.response,
        suggestedContext: validMode,
        contextData: parsed.contextData || null,
        followUpSuggestions: parsed.followUpSuggestions || [],
        reasoning: parsed.reasoning || '',
        intent: parsed.intent,
        suggestedDialog: parsed.suggestedDialog,
        prefillData: parsed.prefillData
      };
    } catch (error) {
      console.error('❌ [Gemini Service] Error parsing JSON response:', error);
      console.error('❌ [Gemini Service] Raw Text:', responseText);

      // Fallback
      return {
        response: responseText,
        suggestedContext: 'none',
        contextData: null,
        followUpSuggestions: [],
        reasoning: 'Failed to parse JSON'
      };
    }
  }

  /**
   * Validate context mode
   */
  private validateContextMode(mode: string): PreviewContextMode {
    const validModes: PreviewContextMode[] = [
      // Core
      'none', 'plan_mode', 'script', 'projects', 'callsheet', 'media', 'pdf', 'graph',
      // Phase 1: Shared Resources
      'team', 'contacts', 'users', 'files',
      // Phase 2: Production Management
      'sessions', 'timecards', 'tasks', 'roles', 'locations', 'scenes',
      // Phase 3: Financial & Music
      'cuesheets', 'budgets', 'music',
      // Phase 4: Additional
      'stories', 'table',
      // Phase 5: High-Level Dashboards
      'inventory', 'cuemusic', 'calendarevents', 'scripting',
      // Phase 1: Licensing & Billing
      'licenses', 'subscriptions', 'invoices', 'billing',
      // Phase 2: Integrations
      'integrations', 'cloud-storage', 'communications', 'airtable',
      // Phase 3: Workflow & Automation
      'workflows', 'automation',
      // Phase 4: Network & Media Processing
      'network-delivery', 'edl', 'transcription', 'unified-files',
      // Phase 5: Messaging & Collaboration
      'conversations', 'collaboration',
      // Phase 6: AI & Analytics
      'ai-analytics', 'ai-training',
      // Phase 7: System & Monitoring
      'system-health', 'notifications', 'reports',
      // Phase 8: Context Engine
      'explorer', 'briefing', 'knowledge_base'
    ];
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
    if (lowerMessage.includes('report') || lowerMessage.includes('analyze') || lowerMessage.includes('outlook') || lowerMessage.includes('audit')) return 'reports';

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

  // CRITICAL: Expose API key to process.env so that shared library services
  // (like VectorMemory) can access it without dependency injection
  process.env.GEMINI_API_KEY = apiKey;

  return new GeminiService(apiKey);
}

/**
 * Export for use in Cloud Functions
 */
export { geminiApiKey };
