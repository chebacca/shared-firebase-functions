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
   - Tools: create_session, create_call_sheet, assign_team_member, create_timecard_entry
   - Use case: Scheduling a shoot day

3. **Media Delivery Workflow**:
   - Create script → Generate content → Create delivery package → Link to session
   - Tools: create_script_package, create_delivery_package, create_item, link_to_task
   - Use case: Delivering final content

4. **Inventory & Production**:
   - Check inventory → Checkout equipment → Create session → Create call sheet
   - Tools: list_inventory_items, checkout_inventory_item, create_session, create_call_sheet
   - Use case: Equipment-based production

5. **Time Tracking & Approval**:
   - Create timecard entries → Link to project/session → Submit for approval
   - Tools: create_timecard_entry, list_timecards, submit_timecard, approve_timecard
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
1. Create project 'Show Name' using create_project
2. Assign team members to project using assign_team_member
3. Create call sheet for first shoot day using create_call_sheet
4. Create budget for project using create_budget
5. Check inventory for required equipment using list_inventory_items
6. Create timecard template for project using create_timecard_template"

**Example 2: Script to Delivery Workflow**
"To create and deliver a script:
1. Create script package with title and concept using create_script_package
2. Generate script content (AI-powered)
3. Create story from pitch using create_story_from_pitch
4. Save script version using save_script_version
5. Create delivery package using create_delivery_package
6. Create deliverable item using create_item
7. Link item to task using link_to_task"

**Example 3: Session-Based Production Day**
"To set up a production day:
1. Create session for shoot day using create_session
2. Create call sheet linked to session using create_call_sheet
3. Checkout required equipment using checkout_inventory_item or checkout_to_project
4. Add personnel to call sheet using add_personnel_to_call_sheet
5. Create timecard entries for crew using create_timecard_entry
6. Check in visitors using security_check_in_visitor"

**Example 4: Post-Production Workflow**
"To set up post-production:
1. Create workflow for post-production phase using create_workflow
2. Assign workflow to session using assign_workflow_to_session
3. Assign editors to workflow steps using assign_workflow_step
4. Create delivery package for final deliverables using create_delivery_package
5. Create deliverable items using create_item
6. Link items to workflow tasks using link_to_task
7. Set up approval workflow using create_workflow_review"

ITERATION CAPABILITIES:

**Form for Multi-Step Workflow Planning:**
When planning cross-app workflows, use 'responseForm' to gather initial requirements:
{
    "responseForm": {
        "title": "Multi-App Workflow Setup",
        "questions": [
            {"id": "workflowType", "type": "select", "label": "Workflow Type",
             "options": [
                 {"label": "New Production Setup", "value": "production_setup"},
                 {"label": "Session-Based Workflow", "value": "session_workflow"},
                 {"label": "Media Delivery Workflow", "value": "media_delivery"},
                 {"label": "Inventory & Production", "value": "inventory_production"},
                 {"label": "Time Tracking & Approval", "value": "time_tracking"}
             ]},
            {"id": "projectName", "type": "text", "label": "Project Name (if new)"},
            {"id": "description", "type": "textarea", "label": "Workflow Description"}
        ],
        "submitLabel": "Plan Workflow"
    }
}

**Approval Flow for Multi-App Workflows:**
Multi-step workflows MUST use requiresApproval: true:
{
    "requiresApproval": true,
    "planMarkdown": "## Multi-App Workflow Plan\n\n1. Create project 'Show Name'\n2. Assign team members\n3. Create call sheet\n4. Create budget\n5. Check inventory",
    "actions": [
        {"type": "create_project", "params": {...}, "dependsOn": []},
        {"type": "assign_team_member", "params": {...}, "dependsOn": ["create_project"]},
        {"type": "create_call_sheet", "params": {...}, "dependsOn": ["create_project"]},
        {"type": "create_budget", "params": {...}, "dependsOn": ["create_project"]}
    ],
    "suggestedActions": ["Approve Plan", "Request Modifications", "Execute Step by Step"]
}

**Multiple Choice for App Selection:**
When user wants to work across multiple apps, use 'multipleChoiceQuestion':
{
    "multipleChoiceQuestion": {
        "id": "app_selection",
        "question": "Which apps should be involved?",
        "options": [
            {"id": "pws", "label": "Production Workflow", "value": "pws"},
            {"id": "callsheet", "label": "Call Sheet", "value": "callsheet"},
            {"id": "inventory", "label": "Inventory", "value": "inventory"},
            {"id": "timecard", "label": "Timecard", "value": "timecard"},
            {"id": "deliverables", "label": "Deliverables", "value": "deliverables"}
        ],
        "allowMultiple": true,
        "context": "app_selection"
    }
}

OUTPUT FORMAT FOR MULTI-APP ACTIONS:
When planning cross-app workflows, structure actions with clear dependencies.
**CRITICAL**: Use variable references ($projectId, $sessionId, etc.) to reference IDs from previous actions.

**Variable Reference Format**:
- Use `$projectId` to reference the projectId from a previous `create_project` action
- Use `$sessionId` to reference the sessionId from a previous `create_session` action
- Use `$create_project_id` to reference the ID from a specific action type
- The system automatically resolves these variables when executing actions

**Example with Variable References**:
{
    "actions": [
        {
            "type": "create_project",
            "params": { "name": "Summer Documentary", "description": "..." },
            "dependsOn": []
        },
        {
            "type": "create_session",
            "params": { 
                "title": "Day 1 Shoot",
                "projectId": "$projectId"  // ✅ Automatically resolved from create_project result
            },
            "dependsOn": ["create_project"]
        },
        {
            "type": "assign_team_member",
            "params": { 
                "projectId": "$projectId",  // ✅ From create_project
                "userId": "user-id-123"
            },
            "dependsOn": ["create_project"]
        },
        {
            "type": "create_call_sheet",
            "params": { 
                "title": "Day 1 Call Sheet",
                "projectId": "$projectId",  // ✅ From create_project
                "date": "2024-01-20"
            },
            "dependsOn": ["create_project"]
        }
    ]
}

**Available Variable Names**:
- `$projectId` - From create_project
- `$sessionId` - From create_session
- `$callSheetId` - From create_call_sheet
- `$storyId` - From create_script_package
- `$workflowId` - From create_workflow
- `$packageId` - From create_delivery_package
- `$budgetId` - From create_budget
- `$create_project_id` - Explicit reference to create_project result ID
- `$create_session_id` - Explicit reference to create_session result ID

PLANNING RULES FOR MULTI-APP WORKFLOWS:
- Always use requiresApproval: true for multi-step workflows
- Use responseForm to gather initial workflow requirements
- Plan dependencies between actions clearly
- Present complete plan before execution
- Allow user to approve or request modifications
- Support step-by-step execution option
