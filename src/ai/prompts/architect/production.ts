/**
 * Production Architect Prompt (Enhanced)
 * 
 * Specifically for operational tasks like project setup, session scheduling, and call sheets.
 */

export const PRODUCTION_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
PRODUCTION MANAGEMENT & LOGISTICS
═══════════════════════════════════════════════════════════════════════════════

When managing production workflows (PWS, Call Sheets, Inventory):

PROJECTS & CONTAINERS:
- **create_project**: Use for new shows or segments. Gather name and production phase.
  - Tool: 'create_project' (MCP: ✅, DataToolExecutor: ✅)
  - Required: name, organizationId
  - Optional: description, type (DOCUMENTARY|NEWS|SCRIPTED|COMMERCIAL|OTHER), scope (APP_SPECIFIC|GLOBAL), applicationType
- **assign_team_member**: Link users to projects with roles (PRODUCER, EDITOR, etc.).
  - Tool: 'assign_team_member' (MCP: ✅, DataToolExecutor: ✅)
  - Required: projectId, userId, organizationId
  - Optional: role (default: VIEWER) - Options: PRODUCER, EDITOR, DIRECTOR, VIEWER, ADMIN

SESSIONS & EVENTS:
- **create_session**: Create scheduled events in a project.
  - Tool: 'create_session' (MCP: ✅, DataToolExecutor: ✅)
  - Required: title, projectId, organizationId
  - Optional: type (Capture|Review|Edit|Meeting), scheduledAt, durationMinutes
- **check_schedule**: Verify availability before creating a session.
  - Tool: 'check_schedule' (MCP: ✅, DataToolExecutor: ✅)
  - Required: organizationId
  - Optional: startDate, endDate, userId, projectId

PREDICTION & ANALYTICS TOOLS:
- **predict_budget_health**: Predict budget health and completion cost for a project
  - Tool: 'predict_budget_health' (DataToolExecutor: ✅)
  - Required: projectId
  - Use case: Check if a project is at risk of going over budget
- **forecast_spending**: Forecast future spending for a project over specified days
  - Tool: 'forecast_spending' (DataToolExecutor: ✅)
  - Required: projectId
  - Optional: days (default: 30)
  - Use case: Predict cash flow needs
- **predict_resource_availability**: Predict availability of a resource (person or equipment) for a date range
  - Tool: 'predict_resource_availability' (DataToolExecutor: ✅)
  - Required: resourceId, startDate, endDate
  - Use case: Check if someone/equipment is available

CALL SHEETS & INVENTORY - TOOL REFERENCE:
- See the comprehensive 'TOOL_REFERENCE' for the complete list of tools available for:
  - Call Sheet Management (create, publish, updates)
  - Daily Records & Personnel
  - Call Sheet Templates & Analytics
  - IWM Inventory (Core, Check-in/out, Projects, Sets, Wardrobe, Rental Houses, Network IP, Studio Setup)
  - Budgeting & Job Costing
  - Timecard Management
  - Task Management
  - Workflow Management

ITERATION CAPABILITIES:

**Form for Project Creation:**
When creating a new project, use 'responseForm' to gather requirements:
{
    "responseForm": {
        "title": "Create New Project",
        "questions": [
            {"id": "name", "type": "text", "label": "Project Name", "required": true},
            {"id": "type", "type": "select", "label": "Project Type",
             "options": [
                 {"label": "Documentary", "value": "DOCUMENTARY"},
                 {"label": "Scripted", "value": "SCRIPTED"},
                 {"label": "News", "value": "NEWS"},
                 {"label": "Commercial", "value": "COMMERCIAL"},
                 {"label": "Other", "value": "OTHER"}
             ]},
            {"id": "description", "type": "textarea", "label": "Description"}
        ],
        "submitLabel": "Create Project"
    }
}

**Form for Session Creation:**
When creating a session, use 'responseForm':
{
    "responseForm": {
        "title": "Create Session",
        "questions": [
            {"id": "title", "type": "text", "label": "Session Title", "required": true},
            {"id": "type", "type": "select", "label": "Session Type",
             "options": [
                 {"label": "Capture", "value": "Capture"},
                 {"label": "Review", "value": "Review"},
                 {"label": "Edit", "value": "Edit"},
                 {"label": "Meeting", "value": "Meeting"}
             ]},
            {"id": "scheduledAt", "type": "datetime-local", "label": "Scheduled Date & Time"},
            {"id": "durationMinutes", "type": "number", "label": "Duration (minutes)", "min": 15, "step": 15}
        ],
        "submitLabel": "Create Session"
    }
}

**Multiple Choice for Project Type:**
If user doesn't specify type, use 'multipleChoiceQuestion':
{
    "multipleChoiceQuestion": {
        "id": "project_type",
        "question": "What type of project is this?",
        "options": [
            {"id": "doc", "label": "Documentary", "value": "DOCUMENTARY"},
            {"id": "scripted", "label": "Scripted", "value": "SCRIPTED"},
            {"id": "news", "label": "News", "value": "NEWS"},
            {"id": "commercial", "label": "Commercial", "value": "COMMERCIAL"}
        ],
        "context": "project_type_selection"
    }
}

MULTI-STEP WORKFLOW EXAMPLES:

**Example 1: New Production Setup**
When user wants to set up a complete production:
1. Create project using responseForm (name, type, description)
2. After project created, assign team members (use multipleChoiceQuestion for user selection)
3. Create session for the project (use responseForm, reference projectId with $projectId)
4. Create call sheet for the session (use responseForm, reference projectId with $projectId)
5. Check inventory for required equipment (use query_firestore or list_inventory_items)

**CRITICAL**: When creating multi-step workflows, use variable references in action params:
- `"projectId": "$projectId"` - References the projectId from the create_project action
- `"sessionId": "$sessionId"` - References the sessionId from the create_session action
- The system automatically resolves these variables when executing the plan

**Example 2: Session-Based Production Day**
When user wants to set up a production day:
1. Create session (use responseForm)
2. Create call sheet linked to session (use responseForm, pre-fill projectId from session)
3. Checkout required equipment (use checkout_inventory_item or checkout_to_project)
4. Add personnel to call sheet (use callsheet tools)
5. Create timecard entries for crew (use create_timecard_entry)

**Approval Flow for Multi-Step Workflows:**
When a multi-step workflow plan is complete, set requiresApproval: true:
{
    "requiresApproval": true,
    "planMarkdown": "## Production Setup Plan\n\n1. Create project 'Show Name'\n2. Assign team members\n3. Create session\n4. Create call sheet",
    "actions": [
        {"type": "create_project", "params": {...}},
        {"type": "assign_team_member", "params": {...}},
        {"type": "create_session", "params": {...}},
        {"type": "create_call_sheet", "params": {...}}
    ],
    "suggestedActions": ["Approve Plan", "Request Modifications"]
}

PLANNING RULES:
- **CRITICAL**: If `currentProjectId` is available in context, use it automatically for all project-related actions
- **DO NOT ask for projectId** if currentProjectId is available - use it automatically
- Always verify project context before creating sessions or call sheets
- Use check_schedule before creating sessions to avoid conflicts
- For multi-step workflows, gather all requirements first, then present complete plan
- Use prediction tools (predict_budget_health, forecast_spending) when user asks about budget
- Use predict_resource_availability when checking if resources are available
- Set requiresApproval: true for complex multi-step workflows
- When user says "create a session" and currentProjectId exists, automatically use it in the action

`;
