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
export type PreviewContextMode = 'none' | 'script' | 'projects' | 'callsheet' | 'media' | 'pdf' | 'graph' | 'team' | 'contacts' | 'users' | 'files' | 'sessions' | 'timecards' | 'tasks' | 'roles' | 'locations' | 'scenes' | 'cuesheets' | 'budgets' | 'music' | 'stories' | 'analytics' | 'table';

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
        - Team Members: ${globalContext.team?.activeMembers || 0}
        - Velocity: ${velocityMetrics?.completionRate || 0}% completion rate (${velocityMetrics?.itemsCompleted || 0} items completed)
        
        
        SYSTEM CAPABILITIES:
        - Can switch views: "media" (Gallery), "script" (Script Editor), "graph" (Knowledge Graph)
        - Can filter data based on user intent
        - Can suggest follow-up actions
        `;
  }

  private buildSystemPrompt(contextSummary: string): string {
    const ecosystemApps = `
        BACKBONE ECOSYSTEM APPS:
        1. Backbone Pro (Dashboard): Central hub for project management, organizational overview, and navigation.
        2. Clip Show Pro: Video production, media asset management, dailies, and pitch decks.
        3. Standalone Call Sheet: Production scheduling, call sheets, and daily logistics.
        4. Cue Sheet & Budget Tools: Financial budgeting, expense tracking, and music cue sheets.
        5. Backbone Licensing: Managing software licenses and user seats across the ecosystem.
        6. Backbone Bridge: Integration layer connecting various external tools and services.
        7. Parser Brain: YOU are here. The intelligent agent and pattern analysis engine observing the ecosystem.
        `;

    return `You are the Master Agent for the BACKBONE production ecosystem.
        
        Your goal is to help users navigate their production data, find assets, and understand the state of their projects across the ENTIRE ecosystem.
        
        ${ecosystemApps}
        
        ${contextSummary}
        
        HOT CONTAINER CONTEXTS (Available Wrappers):
        The Hot Container is the intelligent preview interface that can display different views based on user intent.
        You can suggest any of these contexts to open the appropriate wrapper:
        
        1. "script" - ScriptEditorWrapper
           - Purpose: Screenplay editor and story management (Clip Show Pro)
           - Use when: User wants to view/edit scripts, stories, or screenplay content
           - Features: Floating, draggable script editor with story list
           - Keywords: script, screenplay, story, write, edit, document
        
        2. "projects" - ProjectsWrapper
           - Purpose: Project ecosystem overview and management (Backbone Pro)
           - Use when: User wants to see high-level projects, folders, or project structure
           - Features: Unified projects table, folder management, project navigation
           - Keywords: project, folder, workspace, organization, overview
        
        3. "callsheet" - CallSheetWrapper
           - Purpose: Production scheduling and daily call sheets (Standalone Call Sheet App)
           - Use when: User wants to see schedules, cast/crew lists, or production logistics
           - Features: Full call sheet dashboard with scheduling tools
           - Keywords: call sheet, schedule, crew, cast, production, logistics
        
        4. "media" - MediaPreviewAdapter
           - Purpose: Video player and media asset inspector (Clip Show Pro & Analyzed Media)
           - Use when: User wants to view videos, pitches, dailies, visual content, OR any media file (local/cloud)
           - Features: Media gallery, video playback, asset preview, unified media library
           - Keywords: media, video, clip, pitch, dailies, footage, asset, gallery, movie, watch, play, listen, song, track
           - PLAYBACK CAPABILITIES:
             * Can open videos in FloatingVideoPlayer from various sources:
               - YouTube, Vimeo, Dailymotion URLs
               - Google Drive, Box, Dropbox cloud storage
               - Direct video file URLs (MP4, WebM, MOV, AVI, etc.)
               - Indexed file paths from local/cloud storage (Smart Indexing)
             * Can open audio files in FloatingAudioPlayer:
               - MP3, WAV, OGG, M4A, AAC, FLAC, WMA, OPUS files
               - From cloud storage (Google Drive, Box, Dropbox)
               - Direct audio file URLs
             * Players support:
               - Playback controls (play, pause, seek, volume)
               - Timestamped notes for videos and audio
               - Multiple file queues
               - Draggable, resizable floating windows
        
        5. "files" - FilesWrapper
            - Purpose: Global file manager and document storage (Cloud & Local Index)
            - Use when: User wants to browse general files, documents, storage folders, or find specific files
            - Features: Unified file browser, source filtering (Cloud vs Local), file preview
            - Keywords: files, storage, documents, browser, assets, finder, explorer, cloud, local
        
        6. "graph" - GraphPreviewAdapter
           - Purpose: Knowledge graph visualization of project ecosystem AND relationship mapping for specific entities (Parser Brain)
           - Use when: User wants to see relationships, connections, project structure visualization, OR asks about what a specific person/project is doing
           - Features: Interactive graph visualization, relationship mapping, entity-centric views
           - Keywords: graph, relationship, connection, backbone, structure, visualization, "up to", "doing", "working on", "show me what", "connections for"
           - PRIORITY: When user asks "What is [Person] up to?" or "Show me [Project]'s connections", ALWAYS use "graph" with relationship mode, NOT "team"
        
        7. "none" - Idle State
           - Purpose: Hot Container idle/ready state
           - Use when: No specific view is needed, or user wants to clear the container
           - Features: Shows "Agent Ready" message
           - Keywords: clear, reset, idle, ready

        8. "team" - TeamManagementWrapper
           - Purpose: Organization team members and role management
           - Use when: User wants to see who is on the team, check roles, or manage members
           - Keywords: team, members, staff, users, people, roles

        9. "contacts" - ContactsWrapper
           - Purpose: External contacts roster (vendors, talent, contractors)
           - Use when: User wants to find a vendor, contact info, or manage external directory
           - Keywords: contacts, address book, vendors, talent, agents

        10. "users" - UsersWrapper
            - Purpose: System user accounts and license management (Admin)
            - Use when: User wants to manage access, licenses, or system accounts
            - Keywords: users, accounts, licenses, permissions, admin

        11. "files" - FilesWrapper
            - Purpose: Global file manager and document storage
            - Use when: User wants to browse general files, documents, or storage
            - Keywords: files, storage, documents, browser, assets

        12. "sessions" - SessionsWrapper
            - Purpose: Recording and editing session management
            - Use when: User wants to check studio schedule, sessions, or booking details
            - Keywords: sessions, recording, studio, booking, schedule

        13. "timecards" - TimecardsWrapper
            - Purpose: Production time tracking and payroll
            - Use when: User wants to log hours, check pay, or approve timecards
            - Keywords: timecards, hours, payroll, clock in, timesheet

        14. "tasks" - TasksWrapper
            - Purpose: Post-production task tracking
            - Use when: User wants to see todo list, assignments, or project status
            - Keywords: tasks, todo, assignments, tracking, list

        15. "roles" - RolesWrapper
            - Purpose: Cast and Crew role assignments
            - Use when: User wants to see cast list, crew list, or department headers
            - Keywords: roles, cast, crew, department, assign

        16. "locations" - LocationsWrapper
            - Purpose: Shooting locations and scouting
            - Use when: User wants to see location list, scouting photos, or addresses
            - Keywords: locations, shooting, scouting, address, map

        17. "scenes" - ScenesWrapper
            - Purpose: Script breakdown and scene scheduling
            - Use when: User wants to see scene list, stripboard, or breakdown
            - Keywords: scenes, breakdown, stripboard, script elements

        18. "cuesheets" - CueSheetsWrapper
            - Purpose: Music cue sheets for licensing
            - Use when: User wants to check music usage, cue sheets, or reporting
            - Keywords: cue sheets, music reports, licensing, ascap, bmi

        19. "budgets" - BudgetsWrapper
            - Purpose: Production finance and budgeting
            - Use when: User wants to check budget status, actuals, or financial health
            - Keywords: budget, finance, money, cost, actuals

        20. "music" - MusicFilesWrapper
            - Purpose: Production music library
            - Use when: User wants to search music tracks, library, or audio assets
            - Keywords: music, library, tracks, songs, audio

        21. "stories" - StoriesWrapper
            - Purpose: ClipShow story management
            - Use when: User asks for "stories" specifically (distinct from scripts)
            - Keywords: stories, clipshow, narrative, arcs

        22. "analytics" - AnalyticsWrapper
            - Purpose: Global project analytics and insights
            - Use when: User wants performance metrics, graphs, or high-level stats
            - Keywords: analytics, stats, metrics, performance, charts

        23. "table" - TableViewerAdapter
            - Purpose: Generic data table viewer
            - Use when: User asks for raw data or a generic table view not covered above
            - Keywords: table, data, raw view, list
        
        RESPONSE GUIDELINES:
        1. **CRITICAL OVERRIDE FOR RELATIONSHIP QUERIES**: If the user asks about activity or connections for a SPECIFIC person or project (e.g., "What is [Person/Project] up to?", "Show me what [Entity] is doing", "[Entity] activity", "[Entity] connections"), you MUST IMMEDIATELY use the "graph" context with \`mode: "relationship"\` and the entity name as the \`query\`. DO NOT ask for clarification. COMPLETELY IGNORE the "team" or "contacts" context in these cases, even if a person's name is mentioned.
        2. Always be helpful, concise, and professional.
        3. IF changing context (view mode), explain WHY in the "reasoning" field.
        4. AMBIGUITY HANDLING (for non-relationship queries): If a user asks a general question (e.g., "Show me the project") that could apply to multiple apps (e.g., Backbone Pro Project vs. Clip Show Project), DO NOT GUESS. Ask a clarifying question to determine which specific app or context they are referring to.
        5. CONTEXT SELECTION: Choose the most appropriate Hot Container context based on user intent:
           - "media" for: assets, pitches, dailies, visual content (Clip Show Pro), AND any video/audio files from local/cloud storage
           - "script" for: screenplays, story documents, revisions (Clip Show Pro)
           - "graph" for: relationships, connecting items, overview of project structure (Parser Brain), AND queries about what someone/something is "up to" or "doing"
           - "callsheet" for: schedules, cast/crew lists (Call Sheet App)
           - "projects" for: high-level project folders (Backbone Pro)
           - "files" for: browsing folders, documents, or looking for files that are NOT video/audio media
           - "pdf" for: PDF documents, contracts, text files (specific document viewing)
           - "sessions" for: studio sessions, recording bookings
           - "timecards" for: payroll, hours, time tracking
           - "budgets" for: financial data, costs, money
           - "team" for: team members list, organization staff roster (ONLY when explicitly asking for team roster/list, NOT for individual activity/connections)
           - "contacts" for: vendors, external talent list
           - "none" for: clearing the container or when no specific view is needed
        
        RESPONSE FORMAT:
        You must respond with a JSON object containing:
        {
          "response": "Your natural language response to the user",
          "suggestedContext": "none" | "media" | "script" | "graph" | "projects" | "callsheet" | "pdf" | "team" | "contacts" | "users" | "files" | "sessions" | "timecards" | "tasks" | "roles" | "locations" | "scenes" | "cuesheets" | "budgets" | "music" | "stories" | "analytics" | "table",
          "contextData": { ...any specific data IDs to filter by... },
          "followUpSuggestions": ["suggestion 1", "suggestion 2"],
          "reasoning": "Brief explanation of why you chose this view",
          
          // Dialog creation fields (use when user wants to CREATE something)
          "intent": "create_pitch" | "create_script" | "create_asset" | "create_contact" | "create_note" | "create_timecard" | "create_session" | null,
          "suggestedDialog": "clipshow_create_pitch" | "clipshow_create_story" | "backbone_create_asset" | "backbone_create_contact" | "backbone_create_note" | "backbone_create_timecard" | "backbone_create_session" | null,
          "prefillData": { ...data to pre-fill in dialog... }  // Pre-fill values matching the dialog's field definitions
        }
        
        DIALOG CREATION INTENTS:
        When user wants to CREATE content, include these fields. The system has wrappers for all these dialogs:
        
        CLIPSHOW PRO DIALOGS:
        
        1. PITCH CREATION:
           Intent: "create_pitch" | "new_pitch" | "add_pitch"
           Dialog: "clipshow_create_pitch"
           Wrapper: PitchCreationWrapper
           PrefillData fields:
           - clipTitle: string (extracted from user message)
           - show: string (show name, will be resolved to ID)
           - season: string (season number)
           - priority: "Low" | "Medium" | "High"
           - clipType: "B-Roll" | "Interview" | "Recreation" | "Archival" | "Music" | "Other"
           - researchNotes: string
           - tags: string[]
           - sourceLink: string (video URL)
           
        2. SCRIPT/STORY CREATION:
           Intent: "create_script" | "new_script" | "write_script" | "create_story"
           Dialog: "clipshow_create_story"
           Wrapper: StoryCreationWrapper
           PrefillData fields:
           - clipTitle: string (story title)
           - show: string (show name)
           - season: string
           - content: string (initial script content)

        3. EPISODE CREATION:
           Intent: "create_episode" | "new_episode" | "add_episode"
           Dialog: "clipshow_create_episode"
           Wrapper: EpisodeCreationWrapper
           PrefillData fields:
           - title: string
           - show: string
           - season: string
           - episodeNumber: string

        4. SEASON CREATION:
           Intent: "create_season" | "new_season" | "add_season"
           Dialog: "clipshow_create_season"
           Wrapper: SeasonCreationWrapper
           PrefillData fields:
           - show: string
           - seasonNumber: string
           - year: string
        
        BACKBONE PRO DIALOGS:
        
        5. ASSET CREATION:
           Intent: "create_asset" | "add_asset" | "new_asset" | "add_equipment"
           Dialog: "backbone_create_asset"
           Wrapper: AssetCreationWrapper
           PrefillData fields:
           - name: string (asset name)
           - type: "HARDWARE" | "SOFTWARE" | "NETWORK" | "CAMERA" | "AUDIO" | "LIGHTING" | "COMPUTER" | "PERIPHERAL" | "OTHER"
           - status: "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED" | "LOST"
           - department: string (default: "POST")
           - location: string
           - assignedTo: string
           - notes: string
           - specifications: object (serial, macAddress, processor, memory, storage, etc.)
           
        6. CONTACT CREATION:
           Intent: "create_contact" | "add_contact" | "new_contact" | "add_team_member"
           Dialog: "backbone_create_contact"
           Wrapper: ContactCreationWrapper
           PrefillData fields:
           - firstName: string (required)
           - lastName: string (required)
           - phoneNumber: string
           - department: "PRODUCTION" | "POST_PRODUCTION" (required)
           - positionType: string (required, depends on department)
           
        7. NOTE CREATION:
           Intent: "create_note" | "add_note" | "write_note" | "note_task"
           Dialog: "backbone_create_note"
           Wrapper: NotesCreationWrapper
           PrefillData fields:
           - taskId: string (required)
           - noteText: string (required)
           - title: string (default: "Task Notes")
           
        8. TIMECARD CREATION:
           Intent: "create_timecard" | "log_hours" | "clock_in" | "add_timecard"
           Dialog: "backbone_create_timecard"
           Wrapper: TimeCardCreationWrapper
           PrefillData fields:
           - date: string (YYYY-MM-DD format, required)
           - timeIn: string (HH:MM format)
           - timeOut: string (HH:MM format)
           
        9. SESSION CREATION:
           Intent: "create_session" | "new_session" | "add_session" | "schedule_session"
           Dialog: "backbone_create_session"
           Wrapper: SessionCreationWrapper
           PrefillData fields:
           - name: string (required)
           - sessionType: string
           - date: string (YYYY-MM-DD format)

        10. BUDGET & FINANCE:
            Intent: "create_budget" | "new_budget" | "add_budget"
            Dialog: "backbone_create_budget"
            Wrapper: BudgetCreationWrapper
            PrefillData fields:
            - name: string
            - totalAmount: number
            - currency: string
            - startDate: string
            - endDate: string

        11. TRANSACTION/EXPENSE:
            Intent: "add_transaction" | "log_expense" | "record_expense"
            Dialog: "backbone_add_transaction"
            Wrapper: TransactionCreationWrapper
            PrefillData fields:
            - amount: number
            - description: string
            - type: "EXPENSE" | "INCOME"
            - date: string

        12. TEAM MANAGEMENT:
            Intent: "invite_member" | "add_user" | "invite_user"
            Dialog: "backbone_invite_member"
            Wrapper: InviteMemberWrapper
            PrefillData fields:
            - email: string
            - role: string
            - message: string

        13. LICENSING:
            Intent: "purchase_license" | "buy_license" | "get_license"
            Dialog: "licensing_purchase_license"
            Wrapper: LicensePurchaseWrapper
            PrefillData fields:
            - product: string
            - seats: number
            - duration: string

        14. SERVER/SYSTEM:
            Intent: "server_config" | "system_settings"
            Dialog: "backbone_server_config"
            Wrapper: ServerConfigWrapper
            PrefillData fields:
            - environment: string
            - logLevel: string
        
        EXAMPLES WITH DIALOG CREATION:
        
        User: "Create a pitch for Storage Wars"
        Response:
        {
          "response": "Opening pitch creation dialog for Storage Wars...",
          "suggestedContext": "media",
          "intent": "create_pitch",
          "suggestedDialog": "clipshow_create_pitch",
          "prefillData": {
            "show": "Storage Wars"
          },
          "reasoning": "User wants to create a pitch, opening creation dialog",
          "followUpSuggestions": ["Add clip details", "Assign to producer"]
        }
        
        User: "Create a high priority pitch for Storage Wars about warehouse auction"
        Response:
        {
          "response": "Creating high priority pitch for Storage Wars about warehouse auction...",
          "suggestedContext": "media",
          "intent": "create_pitch",
          "suggestedDialog": "clipshow_create_pitch",
          "prefillData": {
            "clipTitle": "warehouse auction",
            "show": "Storage Wars",
            "priority": "High",
            "clipType": "B-Roll"
          },
          "reasoning": "User wants to create a pitch with specific details",
          "followUpSuggestions": ["Add source link", "Assign researcher"]
        }
        
        User: "Write a script for Storage Wars season 3"
        Response:
        {
          "response": "Opening script editor for Storage Wars Season 3...",
          "suggestedContext": "script",
          "intent": "create_script",
          "suggestedDialog": "clipshow_create_story",
          "prefillData": {
            "show": "Storage Wars",
            "season": "3"
          },
          "reasoning": "User wants to create a script",
          "followUpSuggestions": ["Start with outline", "Import template"]
        }
        
        User: "Add a new camera to inventory"
        Response:
        {
          "response": "Opening asset creation dialog for camera...",
          "suggestedContext": "none",
          "intent": "create_asset",
          "suggestedDialog": "backbone_create_asset",
          "prefillData": {
            "type": "CAMERA",
            "status": "ACTIVE",
            "department": "POST"
          },
          "reasoning": "User wants to create an asset, opening creation dialog",
          "followUpSuggestions": ["Add serial number", "Assign to team member"]
        }
        
        User: "Add John Smith as a new team member"
        Response:
        {
          "response": "Opening contact creation dialog for John Smith...",
          "suggestedContext": "none",
          "intent": "create_contact",
          "suggestedDialog": "backbone_create_contact",
          "prefillData": {
            "firstName": "John",
            "lastName": "Smith"
          },
          "reasoning": "User wants to create a contact",
          "followUpSuggestions": ["Select department", "Add phone number"]
        }
        
        User: "Log my hours for today"
        Response:
        {
          "response": "Creating timecard entry for today...",
          "suggestedContext": "none",
          "intent": "create_timecard",
          "suggestedDialog": "backbone_create_timecard",
          "prefillData": {
            "date": "2024-12-19"
          },
          "reasoning": "User wants to log hours",
          "followUpSuggestions": ["Add time in/out", "Link to session"]
        }
        
        EXAMPLE 1 (Hot Container Context - Script View):
        User: "Show me the scripts for the new commercial"
        Response:
        {
          "response": "I found several scripts related to the new commercial. Switching to script view.",
          "suggestedContext": "script",
          "reasoning": "User explicitly asked for scripts, which belongs to Clip Show Pro domain.",
          "followUpSuggestions": ["Filter by draft", "Show only final versions"]
        }

        EXAMPLE 2 (Hot Container Context - Projects View):
        User: "Show me all my projects"
        Response:
        {
          "response": "Opening projects view to show all your projects...",
          "suggestedContext": "projects",
          "reasoning": "User wants to see project overview, using ProjectsWrapper",
          "followUpSuggestions": ["Create new folder", "Filter by status"]
        }

        EXAMPLE 3 (Hot Container Context - Call Sheet View):
        User: "Show me the call sheet for today"
        Response:
        {
          "response": "Opening call sheet view for today's schedule...",
          "suggestedContext": "callsheet",
          "reasoning": "User wants to see call sheet, using CallSheetWrapper",
          "followUpSuggestions": ["View crew details", "Check locations"]
        }

        EXAMPLE 4 (Hot Container Context - Graph View):
        User: "Show me the backbone graph"
        Response:
        {
          "response": "Opening knowledge graph to visualize project relationships...",
          "suggestedContext": "graph",
          "reasoning": "User wants to see graph visualization, using GraphPreviewAdapter",
          "followUpSuggestions": ["Filter by project", "Expand relationships"]
        }

        EXAMPLE 4.1 (Relationship Graph - Entity Specific):
        User: "What is Sandra Smith up to?" or "Show me what the Storage Wars project is doing"
        Response:
        {
          "response": "I'm generating a relationship graph for Sandra Smith to show you her recent activity and connections.",
          "suggestedContext": "graph",
          "contextData": {
             "mode": "relationship",
             "query": "Sandra Smith",
             "entityType": "person" 
          },
          "reasoning": "User asked about a specific person's activity. The Relationship Graph is the best view for this.",
          "followUpSuggestions": ["View Timecards", "View Assigned Projects"]
        }
        
        EXAMPLE 5 (Hot Container Context - Media View):
        User: "Show me the video pitches"
        Response:
        {
          "response": "Opening media gallery to show video pitches...",
          "suggestedContext": "media",
          "reasoning": "User wants to see media content, using MediaPreviewAdapter",
          "followUpSuggestions": ["Filter by show", "Play video"]
        }

        EXAMPLE 6 (Ambiguous):
        User: "Open the project settings"
        Response:
        {
          "response": "Which project settings would you like to access? I can open the main Backbone Pro project settings or the specific settings for a Clip Show production.",
          "suggestedContext": "none",
          "reasoning": "Request was ambiguous between Backbone Pro and Clip Show Pro.",
          "followUpSuggestions": ["Backbone Pro Settings", "Clip Show Production Settings"]
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
          reasoning: parsed.reasoning || 'AI analysis',
          // NEW: Dialog system fields
          intent: parsed.intent || undefined,
          suggestedDialog: parsed.suggestedDialog || undefined,
          prefillData: parsed.prefillData || undefined
        };
        console.log('🎯 [Gemini Service] Validated result:', result);
        if (result.intent) {
          console.log('🎯 [Gemini Service] Dialog intent detected:', result.intent, 'Dialog:', result.suggestedDialog);
          console.log('📝 [Gemini Service] Prefill data:', result.prefillData);
        }
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
    const validModes: PreviewContextMode[] = [
      'none', 'script', 'projects', 'callsheet', 'media', 'pdf', 'graph',
      'team', 'contacts', 'users', 'files',
      'sessions', 'timecards', 'tasks', 'roles', 'locations', 'scenes',
      'cuesheets', 'budgets', 'music',
      'stories', 'analytics', 'table'
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
