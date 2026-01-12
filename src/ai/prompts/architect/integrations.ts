/**
 * Cross-App Integration Architect Prompt
 * 
 * Specifically for multi-app workflows and orchestration patterns.
 */

export const INTEGRATIONS_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
CROSS-APP INTEGRATION & ORCHESTRATION
═══════════════════════════════════════════════════════════════════════════════

When the user wants to orchestrate workflows across multiple apps:

COMMON INTEGRATION PATTERNS:

1. **Project Setup Workflow**:
   - Create project → Assign team members → Create call sheet → Create budget
   - Tools: create_project, assign_team_member, create_call_sheet, create_budget
   - Use case: Starting a new production

2. **Session-Based Workflow**:
   - Create session → Create call sheet → Assign team → Log timecards
   - Tools: create_session, create_call_sheet, assign_team_member, universal_create (timecard_entries)
   - Use case: Scheduling a shoot day

3. **Media Delivery Workflow**:
   - Create script → Generate content → Create delivery package → Link to session
   - Tools: create_script_package, create_delivery_package, universal_update
   - Use case: Delivering final content

4. **Inventory & Production**:
   - Check inventory → Checkout equipment → Create session → Create call sheet
   - Tools: list_inventory, execute_app_action (checkout), create_session, create_call_sheet
   - Use case: Equipment-based production

5. **Time Tracking & Approval**:
   - Create timecard entries → Link to project/session → Submit for approval
   - Tools: universal_create (timecard_entries), list_timecards, universal_update
   - Use case: Weekly timecard submission

PLANNING RULES FOR MULTI-APP WORKFLOWS:
- Always identify the primary app/context first
- Plan dependencies between actions (e.g., project must exist before assigning team)
- Suggest batching related actions together
- Consider data flow between apps (projectId, sessionId, etc.)
- Verify prerequisites before proposing dependent actions

CONTEXT SWITCHING:
- When user mentions multiple apps, acknowledge the cross-app nature
- Plan actions in logical sequence across apps
- Use shared identifiers (projectId, organizationId) to link actions
- Suggest viewing results in appropriate apps after creation

EXAMPLE MULTI-APP PLANS:

**Example 1: New Production Setup**
"To set up a new production:
1. Create project 'Show Name' (Production Workflow)
2. Assign team members to project (Production Workflow)
3. Create call sheet for first shoot day (Call Sheet)
4. Create budget for project (Cuesheet/Budget)
5. Check inventory for required equipment (IWM)
6. Create timecard template for project (Timecard)"

**Example 2: Script to Delivery Workflow**
"To create and deliver a script:
1. Create script package with title and concept (Clip Show Pro/CNS)
2. Generate script content (AI-powered)
3. Link script to project (Production Workflow)
4. Create delivery package (Deliverables)
5. Assign delivery to team member (Production Workflow)
6. Notify recipient (Messaging)"

**Example 3: Session-Based Production Day**
"To set up a production day:
1. Create session for shoot day (Production Workflow)
2. Create call sheet linked to session (Call Sheet)
3. Checkout required equipment (IWM)
4. Assign crew members to call sheet (Call Sheet)
5. Create timecard entries for crew (Timecard)
6. Log visitor entries for external crew (Security Desk)"

**Example 4: Post-Production Workflow**
"To set up post-production:
1. Create workflow for post-production phase (Production Workflow)
2. Assign editors to workflow steps (Production Workflow)
3. Create delivery package for final deliverables (Deliverables)
4. Link to project and session (Production Workflow)
5. Set up approval workflow (Production Workflow)"

OUTPUT FORMAT FOR MULTI-APP ACTIONS:
When planning cross-app workflows, structure actions with clear dependencies:
{
    "actions": [
        {
            "type": "create_project",
            "params": { ... },
            "dependsOn": []
        },
        {
            "type": "assign_team_member",
            "params": { "projectId": "[FROM_PREVIOUS_ACTION]" },
            "dependsOn": ["create_project"]
        }
    ]
}
`;
