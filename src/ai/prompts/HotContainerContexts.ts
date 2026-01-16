/**
 * Hot Container Context Definitions
 * 
 * Modular definitions for intelligent preview contexts.
 */

export interface HotContainerContextDef {
    id: string;
    name: string;
    purpose: string;
    useWhen: string;
    features?: string[];
    keywords: string[];
    priority?: string;
    playbackCapabilities?: string[];
    phase?: string;
}

export const HOT_CONTAINER_CONTEXTS: HotContainerContextDef[] = [
    // CORE CONTEXTS
    {
        id: "script",
        name: "ScriptEditorWrapper",
        purpose: "Screenplay editor and story management (Clip Show Pro)",
        useWhen: "User wants to view/edit scripts, stories, or screenplay content",
        features: ["Floating, draggable script editor with story list"],
        keywords: ["script", "screenplay", "story", "write", "edit", "document"]
    },
    {
        id: "projects",
        name: "ProjectsWrapper",
        purpose: "Project ecosystem overview and management (Backbone Pro)",
        useWhen: "User wants to see high-level projects, folders, or project structure",
        features: ["Unified projects table, folder management, project navigation"],
        keywords: ["project", "folder", "workspace", "organization", "overview"]
    },
    {
        id: "callsheet",
        name: "CallSheetWrapper",
        purpose: "Production scheduling and daily call sheets (Standalone Call Sheet App)",
        useWhen: "User wants to see schedules, cast/crew lists, or production logistics",
        features: ["Full call sheet dashboard with scheduling tools"],
        keywords: ["call sheet", "schedule", "crew", "cast", "production", "logistics"]
    },
    {
        id: "media",
        name: "MediaPreviewAdapter",
        purpose: "Video player and media asset inspector (Clip Show Pro & Analyzed Media)",
        useWhen: "User wants to view videos, pitches, dailies, visual content, OR any media file (local/cloud)",
        features: [
            "Media gallery, video playback, asset preview, unified media library"
        ],
        playbackCapabilities: [
            "Can open videos in FloatingVideoPlayer from various sources: YouTube, Vimeo, Dailymotion, Cloud Storage, Direct URLs",
            "Can open audio files in FloatingAudioPlayer: MP3, WAV, etc.",
            "Players support playback controls, timestamps, queues"
        ],
        keywords: ["media", "video", "clip", "pitch", "dailies", "footage", "asset", "gallery", "movie", "watch", "play", "listen", "song", "track"]
    },
    {
        id: "files",
        name: "FilesWrapper",
        purpose: "Global file manager and document storage (Cloud & Local Index)",
        useWhen: "User wants to browse general files, documents, storage folders, or find specific files",
        features: ["Unified file browser, source filtering (Cloud vs Local), file preview"],
        keywords: ["files", "storage", "documents", "browser", "assets", "finder", "explorer", "cloud", "local"]
    },
    {
        id: "graph",
        name: "GraphPreviewAdapter",
        purpose: "Knowledge graph visualization of project ecosystem AND relationship mapping for specific entities (Parser Brain)",
        useWhen: "User wants to see relationships, connections, project structure visualization, OR asks about what a specific person/project is doing",
        features: ["Interactive graph visualization, relationship mapping, entity-centric views"],
        keywords: ["graph", "relationship", "connection", "backbone", "structure", "visualization", "up to", "doing", "working on", "show me what", "connections for"],
        priority: "When user asks 'What is [Person] up to?' or 'Show me [Project]'s connections', ALWAYS use 'graph' with relationship mode, NOT 'team'"
    },
    {
        id: "none",
        name: "Idle State",
        purpose: "Hot Container idle/ready state",
        useWhen: "No specific view is needed, or user wants to clear the container",
        features: ["Shows 'Agent Ready' message"],
        keywords: ["clear", "reset", "idle", "ready"]
    },

    // PHASE 1: SHARED RESOURCES
    {
        id: "team",
        name: "TeamManagementWrapper",
        purpose: "Organization team members and role management",
        useWhen: "User wants to see who is on the team, check roles, or manage members",
        keywords: ["team", "members", "staff", "users", "people", "roles"],
        phase: "PHASE 1: SHARED RESOURCES"
    },
    {
        id: "contacts",
        name: "ContactsWrapper",
        purpose: "External contacts roster (vendors, talent, contractors)",
        useWhen: "User wants to find a vendor, contact info, or manage external directory",
        keywords: ["contacts", "address book", "vendors", "talent", "agents"],
        phase: "PHASE 1: SHARED RESOURCES"
    },
    {
        id: "users",
        name: "UsersWrapper",
        purpose: "System user accounts and license management (Admin)",
        useWhen: "User wants to manage access, licenses, or system accounts",
        keywords: ["users", "accounts", "licenses", "permissions", "admin"],
        phase: "PHASE 1: SHARED RESOURCES"
    },

    // PHASE 1: LICENSING & BILLING
    {
        id: "licenses",
        name: "LicensesManagementWrapper",
        purpose: "View and manage all app licenses across the organization",
        useWhen: "User asks about licenses, license management, or who has access to what",
        keywords: ["licenses", "license keys", "access", "permissions", "app access"],
        phase: "PHASE 1: LICENSING & BILLING"
    },
    {
        id: "subscriptions",
        name: "SubscriptionsWrapper",
        purpose: "Active subscriptions and billing cycles",
        useWhen: "User asks about subscriptions, billing plans, or subscription status",
        keywords: ["subscriptions", "billing", "plans", "seats", "pricing"],
        phase: "PHASE 1: LICENSING & BILLING"
    },
    {
        id: "invoices",
        name: "InvoicesWrapper",
        purpose: "Billing invoices and payment history",
        useWhen: "User asks about invoices, billing, or payment records",
        keywords: ["invoices", "billing", "receipts", "payment history"],
        phase: "PHASE 1: LICENSING & BILLING"
    },
    {
        id: "billing",
        name: "PaymentsWrapper",
        purpose: "Payment transactions and billing records",
        useWhen: "User asks about payments, transactions, or billing details",
        keywords: ["payments", "transactions", "billing", "charges"],
        phase: "PHASE 1: LICENSING & BILLING"
    },

    // PHASE 2: PRODUCTION MANAGEMENT
    {
        id: "sessions",
        name: "SessionsWrapper",
        purpose: "Recording and editing session management",
        useWhen: "User wants to check studio schedule, sessions, or booking details",
        keywords: ["sessions", "recording", "studio", "booking", "schedule"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },
    {
        id: "timecards",
        name: "TimecardsWrapper",
        purpose: "Production time tracking and payroll",
        useWhen: "User wants to log hours, check pay, or approve timecards",
        keywords: ["timecards", "hours", "payroll", "clock in", "timesheet"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },
    {
        id: "tasks",
        name: "TasksWrapper",
        purpose: "Post-production task tracking",
        useWhen: "User wants to see todo list, assignments, or project status",
        keywords: ["tasks", "todo", "assignments", "tracking", "list"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },
    {
        id: "roles",
        name: "RolesWrapper",
        purpose: "Cast and Crew role assignments",
        useWhen: "User wants to see cast list, crew list, or department headers",
        keywords: ["roles", "cast", "crew", "department", "assign"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },
    {
        id: "locations",
        name: "LocationsWrapper",
        purpose: "Shooting locations, scouting, and map visualization",
        useWhen: "User wants to see location list, scouting photos, addresses, or search for REAL WORLD places",
        features: [
            "Location List",
            "Google Maps Integration (Search & View)",
            "Scouting Reports",
            "Interactive Map"
        ],
        keywords: ["locations", "shooting", "scouting", "address", "map", "places", "google maps", "find place"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },
    {
        id: "scenes",
        name: "ScenesWrapper",
        purpose: "Script breakdown and scene scheduling",
        useWhen: "User wants to see scene list, stripboard, or breakdown",
        keywords: ["scenes", "breakdown", "stripboard", "script elements"],
        phase: "PHASE 2: PRODUCTION MANAGEMENT"
    },

    // PHASE 2: INTEGRATIONS
    {
        id: "integrations",
        name: "IntegrationsOverviewWrapper",
        purpose: "All connected services and integrations at a glance",
        useWhen: "User asks about integrations, connected services, or what's connected",
        keywords: ["integrations", "connected services", "connections", "linked accounts"],
        phase: "PHASE 2: INTEGRATIONS"
    },
    {
        id: "cloud-storage",
        name: "CloudStorageWrapper",
        purpose: "Dropbox, Box, and Google Drive connections",
        useWhen: "User asks about cloud storage, Dropbox, Box, or Google Drive",
        keywords: ["cloud storage", "dropbox", "box", "google drive", "file sync"],
        phase: "PHASE 2: INTEGRATIONS"
    },
    {
        id: "communications",
        name: "CommunicationToolsWrapper",
        purpose: "Slack and Webex integration status",
        useWhen: "User asks about Slack, Webex, or communication tools",
        keywords: ["slack", "webex", "communication", "messaging tools"],
        phase: "PHASE 2: INTEGRATIONS"
    },
    {
        id: "airtable",
        name: "AirtableIntegrationWrapper",
        purpose: "Airtable sync status and configuration",
        useWhen: "User asks about Airtable, data sync, or Airtable integration",
        keywords: ["airtable", "sync", "integration", "data sync"],
        phase: "PHASE 2: INTEGRATIONS"
    },

    // PHASE 3: FINANCIAL & MUSIC
    {
        id: "cuesheets",
        name: "CueSheetsWrapper",
        purpose: "Music cue sheets for licensing",
        useWhen: "User wants to check music usage, cue sheets, or reporting",
        keywords: ["cue sheets", "music reports", "licensing", "ascap", "bmi"],
        phase: "PHASE 3: FINANCIAL & MUSIC"
    },
    {
        id: "budgets",
        name: "BudgetsWrapper",
        purpose: "Production finance and budgeting",
        useWhen: "User wants to check budget status, actuals, or financial health",
        keywords: ["budget", "finance", "money", "cost", "actuals"],
        phase: "PHASE 3: FINANCIAL & MUSIC"
    },
    {
        id: "music",
        name: "MusicFilesWrapper",
        purpose: "Production music library",
        useWhen: "User wants to search music tracks, library, or audio assets",
        keywords: ["music", "library", "tracks", "songs", "audio"],
        phase: "PHASE 3: FINANCIAL & MUSIC"
    },

    // PHASE 3: WORKFLOW & AUTOMATION
    {
        id: "workflows",
        name: "WorkflowsOverviewWrapper",
        purpose: "Workflow templates and active instances",
        useWhen: "User asks about workflows, workflow status, or workflow management",
        keywords: ["workflows", "workflow status", "pipeline", "process"],
        phase: "PHASE 3: WORKFLOW & AUTOMATION"
    },
    {
        id: "pws-workflows",
        name: "PWSWorkflowAdapter",
        purpose: "Production Workflow System - Query and analyze workflows (READ-ONLY)",
        useWhen: "User wants to see workflow templates, check workflow status, or analyze workflow progress",
        features: ["Template library, active workflow status, workflow analytics"],
        keywords: ["workflow", "workflows", "templates", "workflow status", "workflow progress", "session workflow"],
        priority: "IMPORTANT: This is READ-ONLY. For workflow CREATION, direct users to PWS Workflow Architect",
        phase: "PHASE 3: WORKFLOW & AUTOMATION"
    },
    {
        id: "automation",
        name: "AutomationDashboardWrapper",
        purpose: "Automation rules and execution logs",
        useWhen: "User asks about automation, automated tasks, or automation rules",
        keywords: ["automation", "automated", "rules", "scheduled tasks"],
        phase: "PHASE 3: WORKFLOW & AUTOMATION"
    },

    // PHASE 4: NETWORK & MEDIA PROCESSING
    {
        id: "network-delivery",
        name: "NetworkDeliveryWrapper",
        purpose: "Network delivery bibles and specifications",
        useWhen: "User asks about network delivery, delivery specs, or network requirements",
        keywords: ["network delivery", "delivery bible", "network specs", "delivery requirements"],
        phase: "PHASE 4: NETWORK & MEDIA PROCESSING"
    },
    {
        id: "edl",
        name: "EDLProjectsWrapper",
        purpose: "EDL conversion projects and files",
        useWhen: "User asks about EDL, EDL projects, or EDL conversion",
        keywords: ["edl", "edit decision list", "conversion", "projects"],
        phase: "PHASE 4: NETWORK & MEDIA PROCESSING"
    },
    {
        id: "transcription",
        name: "TranscriptionTasksWrapper",
        purpose: "Transcription processing queue and status",
        useWhen: "User asks about transcriptions, transcription status, or transcription queue",
        keywords: ["transcription", "transcript", "transcribe", "audio to text"],
        phase: "PHASE 4: NETWORK & MEDIA PROCESSING"
    },
    {
        id: "unified-files",
        name: "UnifiedFilesWrapper",
        purpose: "All indexed files from all sources",
        useWhen: "User asks about all files, unified file view, or files from all sources",
        keywords: ["all files", "unified files", "indexed files", "file sources"],
        phase: "PHASE 4: NETWORK & MEDIA PROCESSING"
    },

    // PHASE 5: MESSAGING & COLLABORATION
    {
        id: "conversations",
        name: "ConversationsWrapper",
        purpose: "Multi-user message conversations",
        useWhen: "User asks about conversations, message threads, or chat history",
        keywords: ["conversations", "messages", "chat", "threads"],
        phase: "PHASE 5: MESSAGING & COLLABORATION"
    },
    {
        id: "collaboration",
        name: "CollaborationRoomsWrapper",
        purpose: "Real-time collaboration sessions",
        useWhen: "User asks about collaboration, collaboration rooms, or active sessions",
        keywords: ["collaboration", "rooms", "active sessions", "real-time"],
        phase: "PHASE 5: MESSAGING & COLLABORATION"
    },

    // PHASE 6: AI & ANALYTICS
    {
        id: "ai-analytics",
        name: "AIAnalyticsWrapper",
        purpose: "AI usage analytics and embeddings",
        useWhen: "User asks about AI usage, AI analytics, or AI performance",
        keywords: ["ai analytics", "ai usage", "embeddings", "ai performance"],
        phase: "PHASE 6: AI & ANALYTICS"
    },
    {
        id: "ai-training",
        name: "AITrainingDataWrapper",
        purpose: "AI training datasets and management",
        useWhen: "User asks about AI training, training data, or AI datasets",
        keywords: ["ai training", "training data", "datasets", "machine learning"],
        phase: "PHASE 6: AI & ANALYTICS"
    },

    // PHASE 7: SYSTEM & MONITORING
    {
        id: "system-health",
        name: "SystemHealthWrapper",
        purpose: "System health monitoring and status",
        useWhen: "User asks about system health, system status, or system monitoring",
        keywords: ["system health", "system status", "monitoring", "health check"],
        phase: "PHASE 7: SYSTEM & MONITORING"
    },
    {
        id: "notifications",
        name: "NotificationsManagementWrapper",
        purpose: "User notifications and alerts",
        useWhen: "User asks about notifications, alerts, or notification settings",
        keywords: ["notifications", "alerts", "notification settings", "messages"],
        phase: "PHASE 7: SYSTEM & MONITORING"
    },
    {
        id: "report_generator",
        name: "ReportGeneratorWrapper",
        purpose: "Full PDF report generation with AI analysis, financial charts, and production timelines.",
        useWhen: "User wants to generate, create, or download a formal PDF report (Executive, Financial, Production, or Detailed).",
        features: ["PDF exporting", "Real-time generation progress", "AI-driven executive summaries", "Interactive charts"],
        keywords: ["generate report", "create report", "download report", "executive report", "financial report", "production report", "pdf analysis"],
        phase: "PHASE 7: SYSTEM & MONITORING"
    },

    // PHASE 8: CONTEXT ENGINE
    {
        id: "explorer",
        name: "ContextExplorerWrapper",
        purpose: "Deep ecosystem exploration and relationship traversing",
        useWhen: "User wants to explore the graph, relationships, or deep context",
        keywords: ["explorer", "context", "graph explorer", "ecosystem", "connections"],
        phase: "PHASE 8: CONTEXT ENGINE"
    },
    {
        id: "briefing",
        name: "BriefingWrapper",
        purpose: "Daily intelligence briefing and summary where everything is aggregated",
        useWhen: "User asks for a daily briefing, summary or 'what's new'",
        keywords: ["briefing", "daily summary", "update", "what's new", "intelligence"],
        phase: "PHASE 8: CONTEXT ENGINE"
    },
    {
        id: "knowledge_base",
        name: "KnowledgeBaseWrapper",
        purpose: "Knowledge Base Search Results (RAG)",
        useWhen: "User asks questions about SOPs, manuals, scripts, or documents that require retrieval",
        keywords: ["search", "knowledge base", "SOP", "manual", "guide", "docs", "find document"],
        phase: "PHASE 8: CONTEXT ENGINE"
    },

    // OTHER / PHASE 4 ADDITIONAL
    {
        id: "scripting",
        name: "ClipShowBridge",
        purpose: "Clip Show Pro Bridge",
        useWhen: "User wants to open Clip Show Pro",
        keywords: ["clipshow", "scripting", "open clipshow", "bridge"],
        phase: "PHASE 4: ADDITIONAL"
    },
    {
        id: "table",
        name: "TableViewerAdapter",
        purpose: "Generic data table viewer",
        useWhen: "User asks for raw data or a generic table view not covered above",
        keywords: ["table", "data", "raw view", "list"],
        phase: "PHASE 4: ADDITIONAL"
    }
];

export function generateHotContainerPrompt(): string {
    let prompt = `HOT CONTAINER CONTEXTS (Available Wrappers):
The Hot Container is the intelligent preview interface that can display different views based on user intent.
You can suggest any of these contexts to open the appropriate wrapper:

`;

    // Sort or Group by Phase if needed, but array order is fine for now
    HOT_CONTAINER_CONTEXTS.forEach((ctx, index) => {
        // Basic info
        prompt += `${index + 1}. "${ctx.id}" - ${ctx.name}\n`;
        prompt += `    - Purpose: ${ctx.purpose}\n`;
        prompt += `    - Use when: ${ctx.useWhen}\n`;

        // Features
        if (ctx.features && ctx.features.length > 0) {
            if (ctx.features.length === 1) {
                prompt += `    - Features: ${ctx.features[0]}\n`;
            } else {
                prompt += `    - Features: ${ctx.features.join(', ')}\n`;
            }
        }

        // Playback (special for media)
        if (ctx.playbackCapabilities && ctx.playbackCapabilities.length > 0) {
            prompt += `    - PLAYBACK CAPABILITIES:\n`;
            ctx.playbackCapabilities.forEach(pc => {
                prompt += `        * ${pc}\n`;
            });
        }

        // Keywords
        prompt += `    - Keywords: ${ctx.keywords.join(', ')}\n`;

        // Priority/Special Instructions
        if (ctx.priority) {
            prompt += `    - PRIORITY: ${ctx.priority}\n`;
        }

        prompt += `\n`;
    });

    return prompt;
}
