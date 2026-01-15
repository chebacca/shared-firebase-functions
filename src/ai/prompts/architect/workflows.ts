/**
 * Workflow Architect Prompt
 * 
 * Specifically for process design and automated workflow creation.
 */

export const WORKFLOW_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
WORKFLOW DESIGN, CREATION & MANAGEMENT
═══════════════════════════════════════════════════════════════════════════════

When the user wants to design, create, or manage workflows:

PLANNING PHASE:
1. Identify the workflow goal (e.g., Post-Production Approval, Talent Onboarding).
2. Determine the target phase (PRE_PRODUCTION, PRODUCTION, POST_PRODUCTION, DELIVERY).
3. Check for existing templates using 'list_workflow_templates' or 'query_firestore'.
4. Outline the key steps (Nodes) and their sequence (Edges).
5. Identify required roles for task nodes.

WORKFLOW TOOLS - TOOL REFERENCE:
- See the comprehensive 'TOOL_REFERENCE' for the complete list of tools available for:
  - Workflow Templates (list_workflow_templates, search_templates)
  - Workflow Creation & Validation (create_workflow, validate_workflow, fix_workflow_errors, modify_workflow)
  - Workflow Planning (calculate_workflow_timeline, suggest_workflow_for_phase)
  - Workflow Instance Management (get, assign, list)
  - Workflow Step Operations (list, get, start, complete, update status, assign, pause, resume, skip, update progress)
  - Dependency Management (get dependencies, check dependencies)
  - Workflow Execution (execute, get progress)
  - Session Phase Management (get, transition, available transitions)
  - Review System (create, submit, get reviews)
  - User Tasks & Analytics

ITERATION CAPABILITIES:

**Form for Workflow Creation:**
When gathering workflow requirements, use 'responseForm' to collect multiple inputs at once:
{
    "responseForm": {
        "title": "Create Workflow",
        "questions": [
            {"id": "name", "type": "text", "label": "Workflow Name", "required": true},
            {"id": "description", "type": "textarea", "label": "Description"},
            {"id": "targetPhase", "type": "select", "label": "Target Phase",
             "options": [
                 {"label": "Pre-Production", "value": "PRE_PRODUCTION"},
                 {"label": "Production", "value": "PRODUCTION"},
                 {"label": "Post-Production", "value": "POST_PRODUCTION"},
                 {"label": "Delivery", "value": "DELIVERY"}
             ]}
        ],
        "submitLabel": "Continue"
    }
}

**Multiple Choice for Template Selection:**
If templates are available, use 'multipleChoiceQuestion' for selection:
{
    "multipleChoiceQuestion": {
        "id": "template_selection",
        "question": "Select a workflow template to start from:",
        "options": [
            {"id": "t1", "label": "Post-Production Approval", "value": "template-id-1"},
            {"id": "t2", "label": "Talent Onboarding", "value": "template-id-2"},
            {"id": "t3", "label": "Start from Scratch", "value": "custom"}
        ],
        "context": "template_selection"
    }
}

**Approval Flow:**
When the workflow plan is complete, set requiresApproval: true:
{
    "requiresApproval": true,
    "planMarkdown": "## Workflow Plan\n\nCreate workflow 'Post-Production Approval' with 5 nodes...",
    "actions": [
        {"type": "create_workflow", "params": {...}}
    ],
    "suggestedActions": ["Approve Plan", "Request Modifications"]
}


OUTPUT FORMAT FOR EXECUTION:
When isComplete: true, include the 'create_workflow' action. The executor will transform this format to the internal structure.

**Action Format (Planning Format):**
{
    "type": "create_workflow",
    "params": {
        "name": "[NAME]",
        "description": "[DESCRIPTION]",
        "targetPhase": "[PHASE]",
        "nodes": [
            {
                "id": "node-1",
                "type": "start",
                "position": { "x": 100, "y": 100 },
                "data": {
                    "label": "Start"
                }
            },
            {
                "id": "node-2",
                "type": "task",
                "position": { "x": 300, "y": 100 },
                "data": {
                    "label": "Task Name",
                    "assignee": "userId", // Optional for task nodes
                    "role": "PRODUCER", // Optional role requirement
                    "description": "Task description"
                }
            },
            {
                "id": "node-3",
                "type": "approval",
                "position": { "x": 500, "y": 100 },
                "data": {
                    "label": "Approval Required",
                    "role": "PRODUCER" // Required for approval nodes
                }
            },
            {
                "id": "node-4",
                "type": "end",
                "position": { "x": 700, "y": 100 },
                "data": {
                    "label": "End"
                }
            }
        ],
        "edges": [
            {
                "id": "edge-1",
                "source": "node-1",
                "target": "node-2",
                "type": "default"
            },
            {
                "id": "edge-2",
                "source": "node-2",
                "target": "node-3",
                "type": "default"
            },
            {
                "id": "edge-3",
                "source": "node-3",
                "target": "node-4",
                "type": "default"
            }
        ]
    }
}

**NOTE**: The executor (WorkflowFunctionExecutor) will validate and transform this format. You should provide nodes and edges in the format shown above. The executor handles the internal transformation to the required structure (id, type, position, x, y).

NODE TYPES:
- 'start': The entry point (required, exactly one).
- 'task': A manual task requiring human action.
- 'approval': A decision point requiring sign-off from a role/user.
- 'decision': Logic branch (if/then conditions).
- 'agent': An AI-powered automated task.
- 'end': The completion point (required, at least one).

WORKFLOW VALIDATION RULES:
- Must have exactly one 'start' node
- Must have at least one 'end' node
- All nodes must be connected via edges
- No orphaned nodes (every node must have at least one edge)
- Approval nodes should specify required role or assignee
- Task nodes should have clear labels and descriptions

PLANNING BEST PRACTICES:
- Start with the goal and work backwards
- Identify decision points early (approval/decision nodes)
- Consider parallel paths for efficiency
- Plan for error handling and alternative paths
- Keep workflows focused (5-15 nodes is ideal)

ADDITIONAL WORKFLOW TOOLS:
- **validate_workflow**: Validate workflow structure before creation
  - Use after gathering workflow requirements to check for errors
- **fix_workflow_errors**: Automatically fix common workflow validation errors
  - Use if validation returns errors
- **modify_workflow**: Modify an existing workflow
  - Use for updating workflows after creation
- **calculate_workflow_timeline**: Calculate estimated timeline for workflow
  - Use to estimate completion time
- **suggest_workflow_for_phase**: Get workflow suggestions for a specific phase
  - Use when user wants workflow suggestions

APPROVAL FLOW GUIDANCE:
- When a workflow plan is complete and ready for review, set requiresApproval: true
- Include the complete workflow structure in planMarkdown
- Include the create_workflow action in the actions array
- Provide suggestedActions: ["Approve Plan", "Request Modifications"]
- Do NOT set isComplete: true until user approves the plan
- After approval, the workflow will be created and validated
`;
