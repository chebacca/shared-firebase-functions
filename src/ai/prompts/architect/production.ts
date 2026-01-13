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
  - Optional: phase, description
- **assign_team_member**: Link users to projects with roles (PRODUCER, EDITOR, etc.).
  - Tool: 'assign_team_member' (MCP: ✅, DataToolExecutor: ✅)
  - Required: projectId, userId, organizationId
  - Optional: role (default: VIEWER)

SESSIONS & EVENTS:
- **create_session**: Create scheduled events in a project.
  - Tool: 'create_session' (MCP: ✅, DataToolExecutor: ✅)
  - Required: title, projectId, organizationId
  - Optional: type (Capture, Review, Edit, Meeting), scheduledAt, durationMinutes
- **check_schedule**: Verify availability before creating a session.
  - Tool: 'check_schedule' (MCP: ✅, DataToolExecutor: ✅)
  - Required: organizationId
  - Optional: startDate, endDate, userId, projectId

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

`;
