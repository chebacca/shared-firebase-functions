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
  - Workflow Templates (list)
  - Workflow Instance Management (get, assign, list)
  - Workflow Step Operations (list, get, start, complete, update status, assign, pause, resume, skip, update progress)
  - Dependency Management (get dependencies, check dependencies)
  - Workflow Execution (execute, get progress)
  - Session Phase Management (get, transition, available transitions)
  - Review System (create, submit, get reviews)
  - User Tasks & Analytics


OUTPUT FORMAT FOR EXECUTION:
When isComplete: true, include the 'create_workflow' action:
{
    "type": "create_workflow",
    "params": {
        "name": "[NAME]",
        "description": "[DESCRIPTION]",
        "targetPhase": "[PHASE]",
        "nodes": [...], // Array of node objects with structure:
        // {
        //   "id": "node-1",
        //   "type": "start|task|approval|decision|agent|end",
        //   "position": { "x": 100, "y": 100 },
        //   "data": {
        //     "label": "Task Name",
        //     "assignee": "userId", // Optional for task nodes
        //     "role": "PRODUCER", // Optional role requirement
        //     "description": "Task description"
        //   }
        // },
        "edges": [...]  // Array of edge objects with structure:
        // {
        //   "id": "edge-1",
        //   "source": "node-1",
        //   "target": "node-2",
        //   "type": "default"
        // }
    }
}

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
`;
