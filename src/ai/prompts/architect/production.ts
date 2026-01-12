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

CALL SHEETS (Complete Tool Set):

SHEET OPERATIONS:
- **create_call_sheet** (MCP: ✅, DTE: ✅): Create call sheet for shoot day
  - Required: title, date, projectId, organizationId
  - Optional: startTime, location, notes, status
- **get_published_call_sheet** (MCP: ✅): Get published call sheet
  - Required: callSheetId, organizationId
- **update_published_call_sheet** (MCP: ✅): Update published call sheet
  - Required: callSheetId, organizationId
  - Optional: updates (object)
- **unpublish_call_sheet** (MCP: ✅): Unpublish call sheet
  - Required: callSheetId, organizationId
- **get_live_updates** (MCP: ✅): Get live updates for call sheet
  - Required: callSheetId, organizationId

RECORDS MANAGEMENT:
- **create_daily_record** (MCP: ✅): Create daily production record
  - Required: callSheetId, organizationId
  - Optional: date, notes, weather, location
- **get_daily_record** (MCP: ✅): Get daily record
  - Required: recordId, organizationId
- **list_daily_records** (MCP: ✅): List daily records
  - Required: organizationId
  - Optional: callSheetId, startDate, endDate, limit
- **update_daily_record** (MCP: ✅): Update daily record
  - Required: recordId, organizationId
  - Optional: Any field to update
- **delete_daily_record** (MCP: ✅): Delete daily record
  - Required: recordId, organizationId
- **get_daily_records_report** (MCP: ✅): Get daily records report
  - Required: organizationId
  - Optional: projectId, startDate, endDate

PERSONNEL MANAGEMENT:
- **add_personnel_to_call_sheet** (MCP: ✅): Add personnel to call sheet
  - Required: callSheetId, personnelId, organizationId
  - Optional: role, department, callTime, notes
- **remove_personnel_from_call_sheet** (MCP: ✅): Remove personnel from call sheet
  - Required: callSheetId, personnelId, organizationId
- **update_personnel_on_call_sheet** (MCP: ✅): Update personnel on call sheet
  - Required: callSheetId, personnelId, organizationId
  - Optional: Any field to update
- **list_call_sheet_personnel** (MCP: ✅): List personnel on call sheet
  - Required: callSheetId, organizationId
  - Optional: role, department
- **get_personnel_report** (MCP: ✅): Get personnel report
  - Required: organizationId
  - Optional: projectId, startDate, endDate

TEMPLATES:
- **create_call_sheet_template** (MCP: ✅): Create call sheet template
  - Required: name, organizationId
  - Optional: description, defaultFields
- **get_call_sheet_template** (MCP: ✅): Get call sheet template
  - Required: templateId, organizationId
- **list_call_sheet_templates** (MCP: ✅): List call sheet templates
  - Required: organizationId
  - Optional: limit
- **update_call_sheet_template** (MCP: ✅): Update call sheet template
  - Required: templateId, organizationId
  - Optional: Any field to update
- **delete_call_sheet_template** (MCP: ✅): Delete call sheet template
  - Required: templateId, organizationId

ANALYTICS:
- **get_call_sheet_analytics** (MCP: ✅): Get call sheet analytics
  - Required: organizationId
  - Optional: projectId, startDate, endDate
- **get_publishing_stats** (MCP: ✅): Get publishing statistics
  - Required: organizationId
  - Optional: projectId, startDate, endDate

INVENTORY & ASSETS (IWM - Complete Tool Set):

CORE INVENTORY OPERATIONS:
- **create_inventory_item** (MCP: ✅): Create new inventory item
  - Required: name, type, department, organizationId
  - Optional: serialNumber, manufacturer, model, purchasePrice, warrantyExpires, status
- **update_inventory_item** (MCP: ✅): Update inventory item details
  - Required: itemId, organizationId
  - Optional: Any field to update
- **get_inventory_item** (MCP: ✅): Get inventory item details
  - Required: itemId, organizationId
- **list_inventory_items** (MCP: ✅): List inventory with advanced filters
  - Required: organizationId
  - Optional: status, type, department, assignedTo, projectId, search, limit
- **update_inventory_status** (MCP: ✅): Update inventory item status
  - Required: itemId, status, organizationId
  - Status: AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED, LOST
- **bulk_update_inventory** (MCP: ✅): Bulk update multiple inventory items
  - Required: itemIds (array), updates, organizationId
- **delete_inventory_item** (MCP: ✅): Delete inventory item
  - Required: itemId, organizationId
- **get_inventory_history** (MCP: ✅): Get history/audit trail for inventory item
  - Required: itemId, organizationId

CHECKOUT/CHECKIN OPERATIONS:
- **checkout_inventory_item** (MCP: ✅): Checkout item to user or project
  - Required: itemId, assignedTo, organizationId
  - Optional: assignmentType (USER/PROJECT), expectedReturnDate, notes
- **checkin_inventory_item** (MCP: ✅): Checkin/return inventory item
  - Required: itemId, organizationId
  - Optional: notes, condition
- **get_assignment_history** (MCP: ✅): Get checkout/checkin history for item
  - Required: itemId, organizationId
- **list_checked_out_items** (MCP: ✅): List all currently checked out items
  - Required: organizationId
  - Optional: assignedTo, projectId, limit
- **get_overdue_items** (MCP: ✅): Get items past return date
  - Required: organizationId
- **bulk_checkout** (MCP: ✅): Checkout multiple items at once
  - Required: itemIds (array), assignedTo, organizationId
  - Optional: expectedReturnDate, notes

PROJECT INVENTORY MANAGEMENT:
- **get_project_inventory** (MCP: ✅): Get all inventory for a project
  - Required: projectId, organizationId
  - Optional: includeReturned
- **checkout_to_project** (MCP: ✅): Checkout item specifically to a project
  - Required: itemId, projectId, organizationId
  - Optional: expectedReturnDate, notes
- **return_from_project** (MCP: ✅): Return item from project
  - Required: itemId, projectId, organizationId
  - Optional: notes, condition
- **get_project_inventory_summary** (MCP: ✅): Get inventory summary for project
  - Required: projectId, organizationId
- **transfer_between_projects** (MCP: ✅): Transfer item between projects
  - Required: itemId, fromProjectId, toProjectId, organizationId
  - Optional: notes

SET INVENTORY MANAGEMENT:
- **create_set_inventory_item** (MCP: ✅): Create set-specific inventory item
  - Required: name, setLocation, organizationId
  - Optional: scene, description, status
- **update_set_inventory_item** (MCP: ✅): Update set inventory item
  - Required: itemId, organizationId
  - Optional: Any field to update
- **list_set_inventory** (MCP: ✅): List set inventory items
  - Required: organizationId
  - Optional: setLocation, scene, status, limit
- **pick_set_item** (MCP: ✅): Pick item from set inventory
  - Required: itemId, organizationId
  - Optional: notes
- **return_set_item** (MCP: ✅): Return item to set inventory
  - Required: itemId, organizationId
  - Optional: notes, condition
- **get_set_inventory_by_scene** (MCP: ✅): Get set inventory for specific scene
  - Required: scene, organizationId
  - Optional: setLocation

WARDROBE MANAGEMENT:
- **create_wardrobe_item** (MCP: ✅): Create wardrobe item
  - Required: name, category, organizationId
  - Optional: size, color, description, status
- **update_wardrobe_item** (MCP: ✅): Update wardrobe item
  - Required: itemId, organizationId
  - Optional: Any field to update
- **list_wardrobe_items** (MCP: ✅): List wardrobe items
  - Required: organizationId
  - Optional: category, size, status, limit
- **assign_wardrobe_item** (MCP: ✅): Assign wardrobe item to talent/character
  - Required: itemId, assignedTo, organizationId
  - Optional: projectId, scene, notes
- **get_wardrobe_by_category** (MCP: ✅): Get wardrobe items by category
  - Required: category, organizationId

RENTAL HOUSE MANAGEMENT:
- **create_rental_house** (MCP: ✅): Create rental house vendor
  - Required: name, organizationId
  - Optional: contactInfo, address, notes
- **update_rental_house** (MCP: ✅): Update rental house details
  - Required: rentalHouseId, organizationId
  - Optional: Any field to update
- **list_rental_houses** (MCP: ✅): List rental houses
  - Required: organizationId
  - Optional: search, limit
- **create_rental_agreement** (MCP: ✅): Create rental agreement
  - Required: rentalHouseId, itemIds (array), organizationId
  - Optional: startDate, endDate, terms, notes

NETWORK IP MANAGEMENT:
- **assign_ip_to_inventory** (MCP: ✅): Assign IP address to inventory item
  - Required: itemId, ipAddress, organizationId
  - Optional: subnet, notes
- **unassign_ip_from_inventory** (MCP: ✅): Remove IP assignment from item
  - Required: itemId, organizationId
- **get_ip_assignments** (MCP: ✅): Get IP assignments for item or range
  - Required: organizationId
  - Optional: itemId, ipRange
- **create_ip_range** (MCP: ✅): Create IP address range
  - Required: name, startIp, endIp, organizationId
  - Optional: subnet, description
- **list_ip_ranges** (MCP: ✅): List IP ranges
  - Required: organizationId
  - Optional: limit

STUDIO & SETUP MANAGEMENT:
- **create_setup_profile** (MCP: ✅): Create equipment setup profile
  - Required: name, organizationId
  - Optional: description, equipmentList, notes
- **get_setup_profile** (MCP: ✅): Get setup profile details
  - Required: profileId, organizationId
- **create_studio_assembly** (MCP: ✅): Create studio assembly configuration
  - Required: name, organizationId
  - Optional: description, components, notes
- **get_studio_assembly** (MCP: ✅): Get studio assembly details
  - Required: assemblyId, organizationId

ANALYTICS & REPORTING:
- **get_inventory_analytics** (MCP: ✅): Get comprehensive inventory analytics
  - Required: organizationId
  - Optional: dateFrom, dateTo
- **get_availability_report** (MCP: ✅): Get availability report
  - Required: organizationId
  - Optional: dateFrom, dateTo, type, department
- **get_utilization_report** (MCP: ✅): Get utilization metrics
  - Required: organizationId
  - Optional: dateFrom, dateTo, itemId
- **get_checkout_trends** (MCP: ✅): Get checkout trends and patterns
  - Required: organizationId
  - Optional: dateFrom, dateTo, type

BUDGETING & FINANCIALS:
- **create_budget**: Initialize project financials.
  - Tool: 'create_budget' (MCP: ✅, DataToolExecutor: ✅)
  - Required: projectId, totalAmount, organizationId
  - Optional: currency, fiscalYear, notes
- **query_firestore**: Use on 'clipShowBudgetMetadata' to check existing budgets.
  - Tool: 'query_firestore' (MCP: ✅, DataToolExecutor: ✅)

TIME & LABOR:
- **list_timecards**: Review logged hours.
  - Tool: 'list_timecards' (MCP: ✅, DataToolExecutor: ✅)
  - Required: organizationId
  - Optional: userId, status, limit
- **universal_create**: Create 'timecard_entries' for manual logging.
  - Tool: 'universal_create' (MCP: ✅, DataToolExecutor: ✅)
  - Collection: 'timecard_entries'
  - Required: userId, projectId, date, hours, organizationId

TASK MANAGEMENT:
- **manage_task**: Create, update, or complete tasks.
  - Tool: 'manage_task' (MCP: ✅, DataToolExecutor: ✅)
  - Actions: 'create', 'update', 'complete'
  - Required for create: projectId, title, organizationId
  - Required for update/complete: taskId

WORKFLOW MANAGEMENT:
- **list_workflow_templates**: Find existing workflow templates before creating new workflows.
  - Tool: 'list_workflow_templates' (MCP: ✅, DataToolExecutor: ❌)
  - Required: organizationId
  - Optional: targetPhase, limit
  - Searches both 'workflow-templates' and 'workflowDiagrams' collections
- **assign_workflow_to_session**: Assign workflow to a session after creation.
  - Tool: 'assign_workflow_to_session' (MCP: ✅)
  - Required: sessionId, workflowId, organizationId
- **get_session_phase**: Check current session phase.
  - Tool: 'get_session_phase' (MCP: ✅)
  - Required: sessionId, organizationId
- **transition_session_phase**: Move session to next phase.
  - Tool: 'transition_session_phase' (MCP: ✅)
  - Required: sessionId, targetPhase, organizationId
- **get_user_workflow_tasks**: Get tasks assigned to a user.
  - Tool: 'get_user_workflow_tasks' (MCP: ✅)
  - Required: userId, organizationId

PLANNING FLOW:
1. Search for existing project/session/budget using 'query_firestore' or 'list_inventory_items'.
2. Check schedule availability using 'check_schedule' if creating sessions.
3. Draft the new entity structure in Markdown.
4. Propose the creation action with all required parameters.
5. For call sheets, use 'get_published_call_sheet' or 'update_published_call_sheet' for publishing.
6. For team assignments, use 'assign_team_member' after project creation.
7. For inventory operations, use appropriate IWM tools based on the specific need (checkout, project inventory, set inventory, wardrobe, etc.).
`;
