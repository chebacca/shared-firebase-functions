# Architect Prompts Guide

## Overview

The Architect Planning Mode is a specialized AI planning system for the Backbone ecosystem that helps users build comprehensive plans before execution. Instead of immediately executing tasks, the Architect collaborates with users to clarify requirements, gather context, and create structured execution plans.

## Architecture

### Prompt Structure

The Architect system uses modular prompt files organized by domain:

```
shared-firebase-functions/src/ai/prompts/architect/
├── base.ts              # Core planning persona and JSON format
├── scripting.ts         # Script creation workflows (Clip Show Pro, CNS)
├── workflows.ts         # Workflow design (Production Workflow System)
├── production.ts       # Production management (Call Sheets, Sessions, Inventory)
├── core.ts              # Organization & people management
├── common.ts            # Universal data operations
├── search.ts            # Search & discovery
├── bridge.ts            # File management (Bridge)
├── deliverables.ts      # Delivery package management
├── licensing.ts         # License & subscription management
├── timecard.ts          # Time tracking & approval workflows
├── mobile.ts            # Mobile companion features
└── integrations.ts      # Cross-app integration patterns
```

### Assembly

All prompts are assembled in `ArchitectPrompts.ts`:

```typescript
export const ARCHITECT_SYSTEM_PROMPT = `
${ARCHITECT_BASE_PROMPT}
${SEARCH_PROMPT}
${SCRIPTING_PROMPT}
${WORKFLOW_PROMPT}
${PRODUCTION_PROMPT}
${CORE_PROMPT}
${COMMON_PROMPT}
${BRIDGE_PROMPT}
${DELIVERABLES_PROMPT}
${LICENSING_PROMPT}
${TIMECARD_PROMPT}
${MOBILE_PROMPT}
${INTEGRATIONS_PROMPT}
**FINAL ARCHITECT RULES:**
...
`;
```

## App Coverage

### ✅ Fully Covered Apps

1. **Production Workflow System** - `workflows.ts`, `production.ts`
2. **Clip Show Pro** - `scripting.ts`
3. **CNS** - `scripting.ts`
4. **Call Sheet** - `production.ts`
5. **Cuesheet/Budget** - `production.ts`
6. **IWM (Inventory)** - `production.ts`
7. **Address Book** - `core.ts`
8. **Security Desk** - `core.ts`
9. **Bridge** - `bridge.ts`
10. **Deliverables** - `deliverables.ts`
11. **Licensing Website** - `licensing.ts`
12. **Timecard Management** - `timecard.ts`
13. **Mobile Companion** - `mobile.ts`

## Output Format

The Architect MUST output valid JSON (not wrapped in markdown):

```json
{
    "response": "Conversational response to the user",
    "planMarkdown": "Current plan state in Markdown",
    "isComplete": false,
    "requiresApproval": false,
    "actions": [],
    "suggestedActions": ["Quick reply 1", "Quick reply 2"],
    "suggestedContext": "none",
    "multipleChoiceQuestion": {
        "id": "question_id",
        "question": "What would you like to do?",
        "options": [
            {"id": "o1", "label": "Option 1", "value": "value1"},
            {"id": "o2", "label": "Option 2", "value": "value2"}
        ],
        "context": "selection_context"
    },
    "contextData": {}
}
```

### Key Fields

- **`response`**: Human-readable response to the user
- **`planMarkdown`**: Current plan state (always include, even if empty)
- **`isComplete`**: `true` only when user confirms plan is ready
- **`requiresApproval`**: `true` when plan needs user approval before execution
- **`actions`**: Array of execution actions (only when `isComplete: true`)
- **`suggestedActions`**: Quick reply buttons for the user
- **`suggestedContext`**: Context mode to switch to (e.g., "users", "projects")
- **`multipleChoiceQuestion`**: Interactive selection question
- **`contextData`**: Additional data for context switching

## Planning Workflow

### 1. Initial Request

User: "Create a script for episode 1"

Architect Response:
```json
{
    "response": "I'd be happy to help you create a script! To get started, I need a few details:\n\n1. What's the title of the script?\n2. What's the concept or story idea?\n3. Which show and season is this for?",
    "planMarkdown": "## Script Creation Plan\n\n- [ ] Gather script title\n- [ ] Gather script concept\n- [ ] Identify show and season\n- [ ] Create script package",
    "isComplete": false,
    "suggestedActions": ["I'll provide details", "Cancel"]
}
```

### 2. Gathering Information

User: "It's called 'The Big Reveal', about a character discovering a secret"

Architect Response:
```json
{
    "response": "Great! I have the title and concept. Now I need to know which show and season this script belongs to. Let me show you the available shows:",
    "planMarkdown": "## Script Creation Plan\n\n- [x] Gather script title: 'The Big Reveal'\n- [x] Gather script concept: Character discovering a secret\n- [ ] Identify show and season\n- [ ] Create script package",
    "isComplete": false,
    "multipleChoiceQuestion": {
        "id": "show_selection",
        "question": "Which show is this for?",
        "options": [
            {"id": "s1", "label": "Show A", "value": "show-a-id"},
            {"id": "s2", "label": "Show B", "value": "show-b-id"}
        ],
        "context": "show_selection"
    }
}
```

### 3. Plan Completion

User: [Selects show and season]

Architect Response:
```json
{
    "response": "Perfect! I have all the information I need. Here's the plan:\n\n## Script Creation Plan\n\n1. Create script package 'The Big Reveal'\n2. Set concept: Character discovering a secret\n3. Link to Show A, Season 1\n4. Generate initial script content\n\nReady to execute?",
    "planMarkdown": "## Script Creation Plan\n\n- [x] Gather script title: 'The Big Reveal'\n- [x] Gather script concept: Character discovering a secret\n- [x] Identify show: Show A\n- [x] Identify season: Season 1\n- [ ] Create script package",
    "isComplete": true,
    "requiresApproval": true,
    "actions": [
        {
            "type": "create_script_package",
            "params": {
                "title": "The Big Reveal",
                "concept": "Character discovering a secret",
                "show": "show-a-id",
                "season": "season-1-id",
                "format": "3-column-table",
                "duration": 360,
                "autoOpen": true
            }
        }
    ],
    "suggestedActions": ["Execute Plan", "Modify Plan", "Cancel"]
}
```

## Tool References

### Available Tools

The Architect can reference tools that exist in either:
- **MCP Server** (`_backbone_mcp_server/src/tools/`)
- **DataToolExecutor** (`shared-firebase-functions/src/ai/DataToolExecutor.ts`)

See `MCP_TOOLS_REFERENCE.md` for complete tool catalog.

### Tool Usage in Prompts

When referencing tools in prompts, use this format:

```
- **tool_name**: Description
  - Tool: 'tool_name' (MCP: ✅, DataToolExecutor: ✅)
  - Required: param1, param2
  - Optional: param3, param4
```

## Action Types

### Execution Actions

When `isComplete: true`, include actions in the `actions` array:

```json
{
    "type": "action_type",
    "params": {
        "param1": "value1",
        "param2": "value2"
    }
}
```

### Supported Action Types

See `ARCHITECT_ACTION_EXECUTION_MAP.md` for complete mapping.

Common action types:
- `create_project`
- `create_session`
- `create_call_sheet`
- `create_script_package`
- `create_workflow`
- `assign_team_member`
- `manage_task`
- `universal_create`
- `universal_update`
- `execute_app_action`

## Best Practices

### 1. Context First

Always check `globalContext` before asking questions:
- Available shows, projects, users
- Current user's organization
- Recent activity

### 2. Iterative Refinement

Don't ask all questions at once. Gather information progressively:
1. High-level intent
2. Required parameters
3. Optional parameters
4. Confirmation

### 3. Multiple Choice Questions

Use for structured selections:
- Shows, seasons, episodes
- User roles
- Project types
- Status values

### 4. Plan Markdown

Keep `planMarkdown` updated throughout the conversation:
- Show progress with checkboxes
- Include gathered information
- Show next steps

### 5. Error Prevention

Validate before setting `isComplete: true`:
- All required parameters present
- Valid IDs (projectId, userId, etc.)
- Proper data types
- Organization context verified

## Cross-App Workflows

The `integrations.ts` prompt covers multi-app orchestration:

### Example: Project Setup Workflow

```
1. Create project (Production Workflow)
2. Assign team members (Production Workflow)
3. Create call sheet (Call Sheet)
4. Create budget (Cuesheet/Budget)
5. Check inventory (IWM)
```

### Planning Multi-App Actions

Structure actions with dependencies:

```json
{
    "actions": [
        {
            "type": "create_project",
            "params": {...},
            "dependsOn": []
        },
        {
            "type": "assign_team_member",
            "params": {
                "projectId": "[FROM_PREVIOUS_ACTION]"
            },
            "dependsOn": ["create_project"]
        }
    ]
}
```

## Testing

### Test Scenarios

1. **Single App Workflow**: Create script, create project, create call sheet
2. **Multi-App Workflow**: Project setup across multiple apps
3. **Error Handling**: Missing parameters, invalid IDs, permission errors
4. **Context Switching**: Switching between apps during planning
5. **Plan Modification**: User requests changes to plan

### Validation Checklist

- [ ] All required parameters gathered
- [ ] Valid organizationId in all actions
- [ ] Proper action types (exist in execution map)
- [ ] Dependencies between actions are clear
- [ ] Error messages are user-friendly
- [ ] Plan markdown is clear and complete

## Troubleshooting

### Common Issues

1. **JSON Parse Errors**: Architect must output raw JSON, not markdown-wrapped
2. **Missing Parameters**: Always validate required fields before `isComplete: true`
3. **Invalid Action Types**: Reference `ARCHITECT_ACTION_EXECUTION_MAP.md`
4. **Context Not Found**: Check `globalContext` before referencing entities

### Debugging

Enable verbose logging:
- `GeminiService.runArchitectSession()` logs full conversation
- `MasterAgentChat` logs action execution
- `executeAIAction` logs tool execution

## Version History

- **v1.0** (2025-01-XX): Initial architect prompt system
- **v1.1** (2025-01-XX): Added app-specific prompts (Bridge, Deliverables, Licensing, Timecard, Mobile)
- **v1.2** (2025-01-XX): Added cross-app integration patterns
