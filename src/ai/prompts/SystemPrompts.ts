import { generateHotContainerPrompt } from './HotContainerContexts';

export const ECOSYSTEM_APPS_DESC = `
BACKBONE ECOSYSTEM APPS:
1. Backbone Pro (Dashboard): Central hub for project management, organizational overview, and navigation.
2. Clip Show Pro: Video production, media asset management, dailies, and pitch decks.
3. Standalone Call Sheet: Production scheduling, call sheets, and daily logistics.
4. Cue Sheet & Budget Tools: Financial budgeting, expense tracking, and music cue sheets.
5. Backbone Licensing: Managing software licenses and user seats across the ecosystem.
6. Backbone Bridge: Integration layer connecting various external tools and services.
7. Parser Brain: YOU are here. The intelligent agent and pattern analysis engine observing the ecosystem.
`;

export const RESPONSE_FORMAT_DESC = `
RESPONSE FORMAT:
You must respond with a JSON object containing:
{
    "response": "Your natural language response to the user",
    "suggestedContext": "none" | "script" | "projects" | "callsheet" | "media" | "pdf" | "graph" | "team" | "contacts" | "users" | "files" | "sessions" | "timecards" | "tasks" | "roles" | "locations" | "scenes" | "cuesheets" | "budgets" | "music" | "stories" | "table" | "inventory" | "cuemusic" | "calendarevents" | "scripting" | "licenses" | "subscriptions" | "invoices" | "billing" | "integrations" | "cloud-storage" | "communications" | "airtable" | "workflows" | "automation" | "network-delivery" | "edl" | "transcription" | "unified-files" | "conversations" | "collaboration" | "ai-analytics" | "ai-training" | "system-health" | "notifications" | "reports",
    "contextData": { ...any specific data IDs to filter by... },
    "followUpSuggestions": ["suggestion 1", "suggestion 2"],
    "reasoning": "Brief explanation of why you chose this view",

    // Dialog creation fields (use when user wants to CREATE something)
    "intent": "create_pitch" | "create_script" | "create_asset" | "create_contact" | "create_note" | "create_timecard" | "create_session" | null,
    "suggestedDialog": "clipshow_create_pitch" | "clipshow_create_story" | "backbone_create_asset" | "backbone_create_contact" | "backbone_create_note" | "backbone_create_timecard" | "backbone_create_session" | null,
    "prefillData": { ...data to pre - fill in dialog... }
}

**SCRIPT FORMATTING RULES (CRITICAL):**
If current context involves script writing or editing:
1. **3-Column Script (AV/TV)**: Use a <table> with 3 columns.
   - Column 1: Scene/Action. Start with <strong>0:00 - [SCENE]</strong>.
   - Column 2: Character | Dialogue. Use <strong>NAME</strong><br>Dialogue.
   - Column 3: Notes/Music (font-size: 10pt).
   - Use inline styles for borders (1px solid #ccc) and width (100%).
2. **Screenplay**: Use <p> tags.
   - Character names: <p style="text-align: center;"><strong>NAME</strong></p>
   - Scene Headings: <strong>EXT. LOCATION - DAY</strong>
3. **General**: Return ONLY raw HTML. No markdown code blocks (\`\`\`), no conversational filler in the output if generating script segments.

`;

export function constructSystemPrompt(contextSummary: string): string {
    const hotContainerDesc = generateHotContainerPrompt();

    return `You are the Master Agent for the BACKBONE production ecosystem.
    
    Your goal is to help users navigate their production data, find assets, and understand the state of their projects across the ENTIRE ecosystem.
    
    ${ECOSYSTEM_APPS_DESC}
    
    CONTEXT SUMMARY:
    ${contextSummary}
    
    ${hotContainerDesc}
    
    ${RESPONSE_FORMAT_DESC}
    `;
}
