# Architect Action Execution Flow Map

## Overview

This document maps all architect action types to their execution paths, ensuring all actions can be properly executed.

## Execution Flow Architecture

```
Architect Plan (JSON)
    ↓
MasterAgentChat.handleExecutePlan()
    ↓
Action Type Switch
    ↓
[Special Cases] OR [Generic Route]
    ↓
Firebase Functions / DataToolExecutor
    ↓
Firestore / External Services
```

## Action Type Mappings

### Special Case Actions (Direct Firebase Functions)

These actions have dedicated Firebase functions and are handled specially in `MasterAgentChat.tsx`:

| Action Type | Firebase Function | Status | Notes |
|-------------|-------------------|--------|-------|
| `create_script_package` | `createScriptPackage` | ✅ | MCP tool, needs Firebase function wrapper |
| `create_workflow` | `createWorkflow` | ✅ | MCP tool, needs Firebase function wrapper |
| `create_story` | Direct Firestore | ⚠️ | Legacy, deprecated |
| `generate_script` | N/A | ⚠️ | Legacy, deprecated |
| `populate_editor` | N/A | ⚠️ | Legacy, deprecated |

### Generic Actions (via executeAIAction → DataToolExecutor)

All other actions route through `executeAIAction` which delegates to `DataToolExecutor.executeTool()`:

| Action Type | DataToolExecutor Method | MCP Tool | Status | Notes |
|-------------|------------------------|----------|--------|-------|
| `create_project` | `createProject` | ✅ | ✅ | Fully supported |
| `create_session` | `createSession` | ✅ | ✅ | Fully supported |
| `create_call_sheet` | `createCallSheet` | ✅ | ✅ | Fully supported |
| `create_delivery_package` | `createDeliveryPackage` | ✅ | ✅ | Fully supported |
| `create_budget` | `createBudget` | ✅ | ✅ | Fully supported |
| `assign_team_member` | `assignTeamMember` | ✅ | ✅ | Fully supported |
| `check_schedule` | `checkSchedule` | ✅ | ✅ | Fully supported |
| `manage_task` | `manageTask` | ✅ | ✅ | Fully supported |
| `manage_contact` | `manageContact` | ✅ | ✅ | Fully supported |
| `manage_inventory_item` | `manageInventoryItem` | ✅ | ✅ | Fully supported |
| `list_inventory` | `listInventory` | ✅ | ✅ | Fully supported |
| `list_timecards` | `listTimecards` | ✅ | ✅ | Fully supported |
| `log_visitor` | `logVisitor` | ✅ | ✅ | Fully supported |
| `universal_create` | `universalCreate` | ✅ | ✅ | Fully supported |
| `universal_update` | `universalUpdate` | ✅ | ✅ | Fully supported |
| `query_firestore` | `queryFirestore` | ✅ | ✅ | Fully supported |
| `search_users` | `searchUsers` | ✅ | ✅ | Fully supported |
| `semantic_search` | `semanticSearch` | ✅ | ✅ | Fully supported |
| `execute_app_action` | `executeAppAction` | ❌ | ✅ | Not in MCP (dynamic router) |

### Legacy Actions (executeAIAction Special Cases)

These are handled in the `executeAIAction` switch statement:

| Action Type | Handler Function | Status | Notes |
|-------------|------------------|--------|-------|
| `status_update` | `executeStatusUpdate` | ✅ | Clip Show specific |
| `reassign` | `executeReassignment` | ✅ | Clip Show specific |
| `extend_deadline` | `executeExtendDeadline` | ✅ | Clip Show specific |
| `notify_team` | `executeNotifyTeam` | ✅ | Generic notification |

## Missing Firebase Functions

The following MCP tools need Firebase function wrappers to be callable from the execution flow:

1. **`createScriptPackage`** - Currently only in MCP, needs Firebase function
2. **`createWorkflow`** - Currently only in MCP, needs Firebase function

## Execution Path Verification

### Path 1: Special Cases (create_script_package, create_workflow)
```
MasterAgentChat.handleExecutePlan()
  → switch (action.type)
  → case 'create_script_package'
  → httpsCallable('createScriptPackage')  // ⚠️ NEEDS TO BE CREATED
  → MCP tool or direct Firestore
```

### Path 2: Generic Actions
```
MasterAgentChat.handleExecutePlan()
  → switch (action.type)
  → default case
  → httpsCallable('executeAIAction')
  → executeAIAction()
  → default case (generic gateway)
  → DataToolExecutor.executeTool(actionType)
  → Tool-specific method
  → Firestore/External Service
```

### Path 3: Legacy Actions
```
MasterAgentChat.handleExecutePlan()
  → switch (action.type)
  → default case
  → httpsCallable('executeAIAction')
  → executeAIAction()
  → switch (actionType)
  → Specific handler (status_update, reassign, etc.)
  → Firestore
```

## Action Type Coverage

### ✅ Fully Supported (MCP + DataToolExecutor + Execution Flow)
- `create_project`
- `create_session`
- `create_call_sheet`
- `create_delivery_package`
- `create_budget`
- `assign_team_member`
- `check_schedule`
- `manage_task`
- `manage_contact`
- `manage_inventory_item`
- `list_inventory`
- `list_timecards`
- `log_visitor`
- `universal_create`
- `universal_update`
- `query_firestore`
- `search_users`
- `semantic_search`

### ✅ Fully Supported (MCP + Firebase Function)
- `create_script_package` - Has MCP tool AND Firebase function (`scriptTools.ts`)
- `create_workflow` - Has MCP tool AND Firebase function (`workflowCloudFunctions.ts`, updated to use `workflowDiagrams` collection)

### ⚠️ Legacy/Deprecated
- `create_story` - Legacy, should use `create_script_package`
- `generate_script` - Legacy, handled in `create_script_package`
- `populate_editor` - Legacy, handled in `create_script_package`

### ✅ Special Cases (executeAIAction handlers)
- `status_update`
- `reassign`
- `extend_deadline`
- `notify_team`
- `execute_app_action` - Dynamic router for app-specific actions

## Recommendations

1. **Create Firebase Functions for MCP Tools**:
   - Create `createScriptPackage` Firebase function that wraps MCP tool
   - Create `createWorkflow` Firebase function that wraps MCP tool

2. **Update MasterAgentChat Execution**:
   - Ensure all action types have proper error handling
   - Add retry logic for transient failures
   - Improve error messages for missing functions

3. **Documentation**:
   - Update architect prompts to reference correct action types
   - Document which actions require special handling
   - Create action type reference guide

## Testing Checklist

- [ ] Test `create_script_package` execution (needs Firebase function)
- [ ] Test `create_workflow` execution (needs Firebase function)
- [ ] Test all generic actions via `executeAIAction`
- [ ] Test error handling for missing actions
- [ ] Test error handling for invalid parameters
- [ ] Test cross-app workflows with multiple actions
- [ ] Test action dependencies (e.g., project must exist before assigning team)
