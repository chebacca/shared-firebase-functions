/**
 * Comprehensive Tool Reference
 * 
 * Complete catalog of all MCP server tools organized by category.
 * This serves as the single source of truth for tool references in architect prompts.
 * 
 * Tool Naming Convention: All tools use snake_case (e.g., create_script_package)
 * Availability: MCP = MCP Server, DTE = DataToolExecutor, Both = Available in both
 */

export const TOOL_REFERENCE = `
═══════════════════════════════════════════════════════════════════════════════
COMPREHENSIVE TOOL REFERENCE - MCP SERVER TOOLS
═══════════════════════════════════════════════════════════════════════════════

This section provides a complete catalog of all available tools in the Backbone ecosystem.
Use exact tool names (snake_case) when referencing tools in action plans.

═══════════════════════════════════════════════════════════════════════════════
DISCOVERY & QUERY TOOLS
═══════════════════════════════════════════════════════════════════════════════

- **query_firestore** (MCP: ✅, DTE: ✅)
  - Query any Firestore collection with filters
  - Required: collectionName, organizationId
  - Optional: filters (array), orderBy, limit, startAfter

- **search_users** (MCP: ✅, DTE: ✅)
  - Search team members/users by name, email, or role
  - Required: organizationId
  - Optional: searchTerm, role, limit

- **semantic_search** (MCP: ✅, DTE: ✅)
  - Vector-based semantic search across knowledge base
  - Required: query, organizationId
  - Optional: limit, collection

═══════════════════════════════════════════════════════════════════════════════
CORE CREATION TOOLS
═══════════════════════════════════════════════════════════════════════════════

- **create_project** (MCP: ✅, DTE: ✅)
  - Create new project/show
  - Required: name, organizationId
  - Optional: phase, description, type

- **create_session** (MCP: ✅, DTE: ✅)
  - Create production session/event
  - Required: title, projectId, organizationId
  - Optional: type, scheduledAt, durationMinutes, notes

- **create_call_sheet** (MCP: ✅, DTE: ✅)
  - Create call sheet for shoot day
  - Required: title, date, projectId, organizationId
  - Optional: startTime, location, notes, status

- **create_delivery_package** (MCP: ✅, DTE: ✅)
  - Create delivery package for deliverables
  - Required: name, projectId, organizationId
  - Optional: items, deliveryFormat, recipientEmail, status

- **create_budget** (MCP: ✅, DTE: ✅)
  - Create budget for project
  - Required: projectId, totalAmount, organizationId
  - Optional: currency, fiscalYear, notes

- **create_script_package** (MCP: ✅, DTE: ❌)
  - Create script package (Clip Show Pro/CNS)
  - Required: title, organizationId
  - Optional: show, season, format, duration, concept

- **create_workflow** (MCP: ✅, DTE: ❌)
  - Create workflow template or diagram
  - Required: name, targetPhase, organizationId
  - Optional: description, nodes, edges, workflowType

═══════════════════════════════════════════════════════════════════════════════
WORKFLOW MANAGEMENT TOOLS (27 Tools)
═══════════════════════════════════════════════════════════════════════════════

TEMPLATE MANAGEMENT:
- **list_workflow_templates** (MCP: ✅, DTE: ❌)
  - List available workflow templates
  - Required: organizationId
  - Optional: targetPhase, search, limit

WORKFLOW INSTANCE MANAGEMENT:
- **get_workflow_instance** (MCP: ✅, DTE: ❌)
  - Get workflow instance for session
  - Required: sessionId, organizationId
  - Optional: workflowInstanceId

- **assign_workflow_to_session** (MCP: ✅, DTE: ❌)
  - Assign workflow template to session
  - Required: sessionId, workflowId, organizationId
  - Optional: workflowType ('template' or 'diagram')

- **list_session_workflows** (MCP: ✅, DTE: ❌)
  - List all workflows for a session
  - Required: sessionId, organizationId
  - Optional: status, limit

WORKFLOW STEP OPERATIONS:
- **list_workflow_steps** (MCP: ✅, DTE: ❌)
  - List all steps in workflow instance
  - Required: workflowInstanceId, organizationId
  - Optional: status, assignedUserId, limit

- **get_workflow_step** (MCP: ✅, DTE: ❌)
  - Get detailed step information
  - Required: stepId, organizationId

- **start_workflow_step** (MCP: ✅, DTE: ❌)
  - Start a workflow step (status: IN_PROGRESS)
  - Required: stepId, organizationId
  - Optional: notes, userId

- **complete_workflow_step** (MCP: ✅, DTE: ❌)
  - Complete a workflow step (status: COMPLETED)
  - Required: stepId, organizationId
  - Optional: notes, userId, deliverables

- **update_workflow_step_status** (MCP: ✅, DTE: ❌)
  - Update step status to any valid state
  - Required: stepId, status, organizationId
  - Status values: PENDING, IN_PROGRESS, COMPLETED, BLOCKED, PAUSED, SKIPPED
  - Optional: notes, progress (0-100)

- **assign_workflow_step** (MCP: ✅, DTE: ❌)
  - Assign user to workflow step
  - Required: stepId, userId, organizationId
  - Optional: teamMemberId, unassign

- **pause_workflow_step** (MCP: ✅, DTE: ❌)
  - Pause an in-progress step
  - Required: stepId, organizationId
  - Optional: reason

- **resume_workflow_step** (MCP: ✅, DTE: ❌)
  - Resume a paused step
  - Required: stepId, organizationId
  - Optional: notes

- **skip_workflow_step** (MCP: ✅, DTE: ❌)
  - Skip an optional step
  - Required: stepId, organizationId
  - Optional: reason

- **update_workflow_step_progress** (MCP: ✅, DTE: ❌)
  - Update step progress percentage
  - Required: stepId, progress (0-100), organizationId
  - Optional: notes

DEPENDENCY MANAGEMENT:
- **get_workflow_step_dependencies** (MCP: ✅, DTE: ❌)
  - Get dependencies for a step
  - Required: stepId, organizationId
  - Optional: includeStatus

- **check_step_dependencies** (MCP: ✅, DTE: ❌)
  - Check if dependencies are met
  - Required: stepId, organizationId

WORKFLOW EXECUTION:
- **execute_workflow** (MCP: ✅, DTE: ❌)
  - Execute a workflow instance
  - Required: workflowInstanceId, organizationId
  - Optional: autoStart

- **get_workflow_progress** (MCP: ✅, DTE: ❌)
  - Get workflow completion progress
  - Required: workflowInstanceId, organizationId

SESSION PHASE MANAGEMENT:
- **get_session_phase** (MCP: ✅, DTE: ❌)
  - Get current session phase
  - Required: sessionId, organizationId

- **transition_session_phase** (MCP: ✅, DTE: ❌)
  - Move session to next phase
  - Required: sessionId, targetPhase, organizationId
  - Optional: reason, validateWorkflowCompletion

- **get_available_phase_transitions** (MCP: ✅, DTE: ❌)
  - Get valid next phases
  - Required: sessionId, organizationId

REVIEW SYSTEM:
- **create_workflow_review** (MCP: ✅, DTE: ❌)
  - Create review for workflow step
  - Required: stepId, organizationId
  - Optional: reviewerId, reviewType ('approval', 'feedback', 'qc')

- **submit_workflow_review** (MCP: ✅, DTE: ❌)
  - Submit review decision
  - Required: reviewId, decision, organizationId
  - Decision: 'approve', 'reject', 'changes_needed'
  - Optional: feedback, reviewerId

- **get_workflow_reviews** (MCP: ✅, DTE: ❌)
  - Get reviews for a step
  - Required: stepId, organizationId
  - Optional: status, limit

- **get_pending_reviews** (MCP: ✅, DTE: ❌)
  - Get pending reviews awaiting action
  - Required: organizationId
  - Optional: reviewerId, sessionId, limit

USER TASKS & ANALYTICS:
- **get_user_workflow_tasks** (MCP: ✅, DTE: ❌)
  - Get all tasks assigned to a user
  - Required: userId, organizationId
  - Optional: status, sessionId, limit

- **get_pending_workflow_steps** (MCP: ✅, DTE: ❌)
  - Get steps awaiting action
  - Required: organizationId
  - Optional: userId, sessionId, limit

- **get_workflow_analytics** (MCP: ✅, DTE: ❌)
  - Get workflow metrics and analytics
  - Required: organizationId
  - Optional: workflowInstanceId, sessionId, dateFrom, dateTo

═══════════════════════════════════════════════════════════════════════════════
IWM (INVENTORY & WAREHOUSE MANAGEMENT) TOOLS (40+ Tools)
═══════════════════════════════════════════════════════════════════════════════

CORE INVENTORY OPERATIONS:
- **create_inventory_item** (MCP: ✅, DTE: ❌)
  - Create new inventory item
  - Required: name, type, department, organizationId
  - Optional: serialNumber, manufacturer, model, purchasePrice, warrantyExpires, status

- **update_inventory_item** (MCP: ✅, DTE: ❌)
  - Update inventory item details
  - Required: itemId, organizationId
  - Optional: Any field to update

- **get_inventory_item** (MCP: ✅, DTE: ❌)
  - Get inventory item details
  - Required: itemId, organizationId

- **list_inventory_items** (MCP: ✅, DTE: ❌)
  - List inventory with advanced filters
  - Required: organizationId
  - Optional: status, type, department, assignedTo, projectId, search, limit

- **update_inventory_status** (MCP: ✅, DTE: ❌)
  - Update inventory item status
  - Required: itemId, status, organizationId
  - Status: AVAILABLE, CHECKED_OUT, MAINTENANCE, RETIRED, LOST

- **bulk_update_inventory** (MCP: ✅, DTE: ❌)
  - Bulk update multiple inventory items
  - Required: itemIds (array), updates, organizationId

- **delete_inventory_item** (MCP: ✅, DTE: ❌)
  - Delete inventory item
  - Required: itemId, organizationId

- **get_inventory_history** (MCP: ✅, DTE: ❌)
  - Get history/audit trail for inventory item
  - Required: itemId, organizationId

CHECKOUT/CHECKIN OPERATIONS:
- **checkout_inventory_item** (MCP: ✅, DTE: ❌)
  - Checkout item to user or project
  - Required: itemId, assignedTo, organizationId
  - Optional: assignmentType (USER/PROJECT), expectedReturnDate, notes

- **checkin_inventory_item** (MCP: ✅, DTE: ❌)
  - Checkin/return inventory item
  - Required: itemId, organizationId
  - Optional: notes, condition

- **get_assignment_history** (MCP: ✅, DTE: ❌)
  - Get checkout/checkin history for item
  - Required: itemId, organizationId

- **list_checked_out_items** (MCP: ✅, DTE: ❌)
  - List all currently checked out items
  - Required: organizationId
  - Optional: assignedTo, projectId, limit

- **get_overdue_items** (MCP: ✅, DTE: ❌)
  - Get items past return date
  - Required: organizationId

- **bulk_checkout** (MCP: ✅, DTE: ❌)
  - Checkout multiple items at once
  - Required: itemIds (array), assignedTo, organizationId
  - Optional: expectedReturnDate, notes

PROJECT INVENTORY MANAGEMENT:
- **get_project_inventory** (MCP: ✅, DTE: ❌)
  - Get all inventory for a project
  - Required: projectId, organizationId
  - Optional: includeReturned

- **checkout_to_project** (MCP: ✅, DTE: ❌)
  - Checkout item specifically to a project
  - Required: itemId, projectId, organizationId
  - Optional: expectedReturnDate, notes

- **return_from_project** (MCP: ✅, DTE: ❌)
  - Return item from project
  - Required: itemId, projectId, organizationId
  - Optional: notes, condition

- **get_project_inventory_summary** (MCP: ✅, DTE: ❌)
  - Get inventory summary for project
  - Required: projectId, organizationId

- **transfer_between_projects** (MCP: ✅, DTE: ❌)
  - Transfer item between projects
  - Required: itemId, fromProjectId, toProjectId, organizationId
  - Optional: notes

SET INVENTORY MANAGEMENT:
- **create_set_inventory_item** (MCP: ✅, DTE: ❌)
  - Create set-specific inventory item
  - Required: name, setLocation, organizationId
  - Optional: scene, description, status

- **update_set_inventory_item** (MCP: ✅, DTE: ❌)
  - Update set inventory item
  - Required: itemId, organizationId
  - Optional: Any field to update

- **list_set_inventory** (MCP: ✅, DTE: ❌)
  - List set inventory items
  - Required: organizationId
  - Optional: setLocation, scene, status, limit

- **pick_set_item** (MCP: ✅, DTE: ❌)
  - Pick item from set inventory
  - Required: itemId, organizationId
  - Optional: notes

- **return_set_item** (MCP: ✅, DTE: ❌)
  - Return item to set inventory
  - Required: itemId, organizationId
  - Optional: notes, condition

- **get_set_inventory_by_scene** (MCP: ✅, DTE: ❌)
  - Get set inventory for specific scene
  - Required: scene, organizationId
  - Optional: setLocation

WARDROBE MANAGEMENT:
- **create_wardrobe_item** (MCP: ✅, DTE: ❌)
  - Create wardrobe item
  - Required: name, category, organizationId
  - Optional: size, color, description, status

- **update_wardrobe_item** (MCP: ✅, DTE: ❌)
  - Update wardrobe item
  - Required: itemId, organizationId
  - Optional: Any field to update

- **list_wardrobe_items** (MCP: ✅, DTE: ❌)
  - List wardrobe items
  - Required: organizationId
  - Optional: category, size, status, limit

- **assign_wardrobe_item** (MCP: ✅, DTE: ❌)
  - Assign wardrobe item to talent/character
  - Required: itemId, assignedTo, organizationId
  - Optional: projectId, scene, notes

- **get_wardrobe_by_category** (MCP: ✅, DTE: ❌)
  - Get wardrobe items by category
  - Required: category, organizationId

RENTAL HOUSE MANAGEMENT:
- **create_rental_house** (MCP: ✅, DTE: ❌)
  - Create rental house vendor
  - Required: name, organizationId
  - Optional: contactInfo, address, notes

- **update_rental_house** (MCP: ✅, DTE: ❌)
  - Update rental house details
  - Required: rentalHouseId, organizationId
  - Optional: Any field to update

- **list_rental_houses** (MCP: ✅, DTE: ❌)
  - List rental houses
  - Required: organizationId
  - Optional: search, limit

- **create_rental_agreement** (MCP: ✅, DTE: ❌)
  - Create rental agreement
  - Required: rentalHouseId, itemIds (array), organizationId
  - Optional: startDate, endDate, terms, notes

NETWORK IP MANAGEMENT:
- **assign_ip_to_inventory** (MCP: ✅, DTE: ❌)
  - Assign IP address to inventory item
  - Required: itemId, ipAddress, organizationId
  - Optional: subnet, notes

- **unassign_ip_from_inventory** (MCP: ✅, DTE: ❌)
  - Remove IP assignment from item
  - Required: itemId, organizationId

- **get_ip_assignments** (MCP: ✅, DTE: ❌)
  - Get IP assignments for item or range
  - Required: organizationId
  - Optional: itemId, ipRange

- **create_ip_range** (MCP: ✅, DTE: ❌)
  - Create IP address range
  - Required: name, startIp, endIp, organizationId
  - Optional: subnet, description

- **list_ip_ranges** (MCP: ✅, DTE: ❌)
  - List IP ranges
  - Required: organizationId
  - Optional: limit

STUDIO & SETUP MANAGEMENT:
- **create_setup_profile** (MCP: ✅, DTE: ❌)
  - Create equipment setup profile
  - Required: name, organizationId
  - Optional: description, equipmentList, notes

- **get_setup_profile** (MCP: ✅, DTE: ❌)
  - Get setup profile details
  - Required: profileId, organizationId

- **create_studio_assembly** (MCP: ✅, DTE: ❌)
  - Create studio assembly configuration
  - Required: name, organizationId
  - Optional: description, components, notes

- **get_studio_assembly** (MCP: ✅, DTE: ❌)
  - Get studio assembly details
  - Required: assemblyId, organizationId

ANALYTICS & REPORTING:
- **get_inventory_analytics** (MCP: ✅, DTE: ❌)
  - Get comprehensive inventory analytics
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **get_availability_report** (MCP: ✅, DTE: ❌)
  - Get availability report
  - Required: organizationId
  - Optional: dateFrom, dateTo, type, department

- **get_utilization_report** (MCP: ✅, DTE: ❌)
  - Get utilization metrics
  - Required: organizationId
  - Optional: dateFrom, dateTo, itemId

- **get_checkout_trends** (MCP: ✅, DTE: ❌)
  - Get checkout trends and patterns
  - Required: organizationId
  - Optional: dateFrom, dateTo, type

═══════════════════════════════════════════════════════════════════════════════
CLIP SHOW PRO TOOLS (25+ Tools)
═══════════════════════════════════════════════════════════════════════════════

PITCH & STORY MANAGEMENT:
- **create_pitch** (MCP: ✅, DTE: ❌)
  - Create new pitch for clip clearance
  - Required: clipTitle, show, organizationId
  - Optional: season, projectId, clipType, sourceLink, status

- **update_pitch_status** (MCP: ✅, DTE: ❌)
  - Update pitch status through workflow
  - Required: pitchId, status, organizationId
  - Status flow: Pitched → Pursue Clearance → Working on License → Pending Signature → License Cleared → Ready for Story

- **list_pitches** (MCP: ✅, DTE: ❌)
  - List pitches with filters
  - Required: organizationId
  - Optional: show, season, status, limit

- **get_pitch** (MCP: ✅, DTE: ❌)
  - Get pitch details
  - Required: pitchId, organizationId

- **assign_producer_to_pitch** (MCP: ✅, DTE: ❌)
  - Assign producer to pitch
  - Required: pitchId, producerId, organizationId

- **create_story_from_pitch** (MCP: ✅, DTE: ❌)
  - Create story from cleared pitch
  - Required: pitchId, organizationId
  - Optional: title, description

- **update_story_status** (MCP: ✅, DTE: ❌)
  - Update story status
  - Required: storyId, status, organizationId

- **list_stories** (MCP: ✅, DTE: ❌)
  - List stories with filters
  - Required: organizationId
  - Optional: show, season, status, limit

- **get_story** (MCP: ✅, DTE: ❌)
  - Get story details
  - Required: storyId, organizationId

- **link_pitch_to_story** (MCP: ✅, DTE: ❌)
  - Link pitch to story bidirectionally
  - Required: pitchId, storyId, organizationId

- **sync_story_from_pitch** (MCP: ✅, DTE: ❌)
  - Sync story data from pitch
  - Required: storyId, organizationId

SCRIPT OPERATIONS:
- **save_script_version** (MCP: ✅, DTE: ❌)
  - Save script version with revision history
  - Required: storyId, scriptContent, organizationId
  - Optional: versionNotes

- **update_script_content** (MCP: ✅, DTE: ❌)
  - Update script content
  - Required: storyId, scriptContent, organizationId

- **approve_script** (MCP: ✅, DTE: ❌)
  - Approve script version
  - Required: storyId, organizationId
  - Updates story status to 'Script Complete'

- **request_script_revision** (MCP: ✅, DTE: ❌)
  - Request script revision
  - Required: storyId, organizationId
  - Updates story status to 'Needs Revision'

- **get_script_versions** (MCP: ✅, DTE: ❌)
  - Get script version history
  - Required: storyId, organizationId

SHOW MANAGEMENT:
- **create_show** (MCP: ✅, DTE: ❌)
  - Create new show
  - Required: name, organizationId
  - Optional: description, type, status

- **update_show** (MCP: ✅, DTE: ❌)
  - Update show details
  - Required: showId, organizationId
  - Optional: Any field to update

- **toggle_show_status** (MCP: ✅, DTE: ❌)
  - Toggle show active/inactive status
  - Required: showId, organizationId

- **create_season** (MCP: ✅, DTE: ❌)
  - Create season for show
  - Required: showId, name, organizationId
  - Optional: description, seasonNumber

- **create_episode** (MCP: ✅, DTE: ❌)
  - Create episode for season
  - Required: seasonId, name, organizationId
  - Optional: description, episodeNumber, airDate

- **list_shows** (MCP: ✅, DTE: ❌)
  - List shows with filters
  - Required: organizationId
  - Optional: status, limit

BUDGET & CUE SHEETS:
- **get_budget_metadata** (MCP: ✅, DTE: ❌)
  - Get budget metadata for show/season
  - Required: organizationId
  - Optional: showId, seasonId

- **create_budget_group** (MCP: ✅, DTE: ❌)
  - Create budget group/category
  - Required: budgetId, name, organizationId
  - Optional: description, allocatedAmount

- **get_budget_analytics** (MCP: ✅, DTE: ❌)
  - Get budget analytics and insights
  - Required: budgetId, organizationId
  - Optional: dateFrom, dateTo

- **update_budget_values** (MCP: ✅, DTE: ❌)
  - Update budget values
  - Required: budgetId, organizationId
  - Optional: updates (object)

- **create_cue_sheet** (MCP: ✅, DTE: ❌)
  - Create music cue sheet
  - Required: showId, organizationId
  - Optional: seasonId, episodeId, description

- **activate_cue_sheet** (MCP: ✅, DTE: ❌)
  - Activate cue sheet for use
  - Required: cueSheetId, organizationId

- **list_cue_sheets** (MCP: ✅, DTE: ❌)
  - List cue sheets
  - Required: organizationId
  - Optional: showId, status, limit

CALENDAR, AUTOMATION & INTEGRATIONS:
- **create_calendar_event** (MCP: ✅, DTE: ❌)
  - Create calendar event
  - Required: title, startDate, organizationId
  - Optional: endDate, description, location, showId

- **list_calendar_events** (MCP: ✅, DTE: ❌)
  - List calendar events
  - Required: organizationId
  - Optional: startDate, endDate, showId, limit

- **list_automation_functions** (MCP: ✅, DTE: ❌)
  - List available automation functions
  - Required: organizationId

- **create_automation_rule** (MCP: ✅, DTE: ❌)
  - Create automation rule
  - Required: name, trigger, action, organizationId
  - Optional: conditions, description

- **get_automation_logs** (MCP: ✅, DTE: ❌)
  - Get automation execution logs
  - Required: organizationId
  - Optional: ruleId, startDate, endDate, limit

- **get_integration_status** (MCP: ✅, DTE: ❌)
  - Get integration status
  - Required: integrationName, organizationId

- **list_integration_settings** (MCP: ✅, DTE: ❌)
  - List integration settings
  - Required: organizationId
  - Optional: integrationName

═══════════════════════════════════════════════════════════════════════════════
DELIVERABLES TOOLS (20+ Tools)
═══════════════════════════════════════════════════════════════════════════════

UPLOAD MANAGEMENT:
- **create_upload** (MCP: ✅, DTE: ❌)
  - Create upload record
  - Required: fileName, fileSize, organizationId
  - Optional: projectId, uploadType, metadata

- **get_upload** (MCP: ✅, DTE: ❌)
  - Get upload details
  - Required: uploadId, organizationId

- **list_uploads** (MCP: ✅, DTE: ❌)
  - List uploads with filters
  - Required: organizationId
  - Optional: projectId, status, limit

- **delete_upload** (MCP: ✅, DTE: ❌)
  - Delete upload record
  - Required: uploadId, organizationId

- **get_upload_status** (MCP: ✅, DTE: ❌)
  - Get upload processing status
  - Required: uploadId, organizationId

AI PARSING INTEGRATION:
- **initiate_parsing** (MCP: ✅, DTE: ❌)
  - Initiate AI parsing for upload
  - Required: uploadId, organizationId
  - Optional: parsingOptions

- **get_parsing_status** (MCP: ✅, DTE: ❌)
  - Get parsing status
  - Required: uploadId, organizationId

- **retry_parsing** (MCP: ✅, DTE: ❌)
  - Retry failed parsing
  - Required: uploadId, organizationId

- **get_ai_response** (MCP: ✅, DTE: ❌)
  - Get AI parsing response/results
  - Required: uploadId, organizationId

ITEMS MANAGEMENT:
- **create_item** (MCP: ✅, DTE: ❌)
  - Create deliverable item
  - Required: name, projectId, organizationId
  - Optional: type, description, status

- **update_item** (MCP: ✅, DTE: ❌)
  - Update deliverable item
  - Required: itemId, organizationId
  - Optional: Any field to update

- **get_item** (MCP: ✅, DTE: ❌)
  - Get item details
  - Required: itemId, organizationId

- **list_items** (MCP: ✅, DTE: ❌)
  - List items with filters
  - Required: organizationId
  - Optional: projectId, status, type, limit

- **update_item_status** (MCP: ✅, DTE: ❌)
  - Update item status
  - Required: itemId, status, organizationId
  - Status: DRAFT, IN_PROGRESS, READY, DELIVERED

- **delete_item** (MCP: ✅, DTE: ❌)
  - Delete deliverable item
  - Required: itemId, organizationId

STATUS & WORKFLOW:
- **mark_ready** (MCP: ✅, DTE: ❌)
  - Mark item as ready for delivery
  - Required: itemId, organizationId
  - Optional: notes

- **mark_delivered** (MCP: ✅, DTE: ❌)
  - Mark item as delivered
  - Required: itemId, organizationId
  - Optional: deliveryDate, recipient, notes

- **bulk_update_status** (MCP: ✅, DTE: ❌)
  - Bulk update item statuses
  - Required: itemIds (array), status, organizationId

- **get_items_by_status** (MCP: ✅, DTE: ❌)
  - Get items by status
  - Required: status, organizationId
  - Optional: projectId, limit

TASK INTEGRATION:
- **link_to_task** (MCP: ✅, DTE: ❌)
  - Link item to task
  - Required: itemId, taskId, organizationId

- **unlink_from_task** (MCP: ✅, DTE: ❌)
  - Unlink item from task
  - Required: itemId, taskId, organizationId

- **get_task_deliverables** (MCP: ✅, DTE: ❌)
  - Get deliverables for task
  - Required: taskId, organizationId

- **get_item_tasks** (MCP: ✅, DTE: ❌)
  - Get tasks linked to item
  - Required: itemId, organizationId

ANALYTICS & REPORTING:
- **get_analytics** (MCP: ✅, DTE: ❌)
  - Get deliverables analytics
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **get_status_report** (MCP: ✅, DTE: ❌)
  - Get status report
  - Required: organizationId
  - Optional: projectId, status

- **get_upload_report** (MCP: ✅, DTE: ❌)
  - Get upload report
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **get_delivery_timeline** (MCP: ✅, DTE: ❌)
  - Get delivery timeline
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

═══════════════════════════════════════════════════════════════════════════════
SECURITY DESK TOOLS (20+ Tools)
═══════════════════════════════════════════════════════════════════════════════

VISITOR MANAGEMENT:
- **log_visitor** (MCP: ✅, DTE: ✅)
  - Log visitor entry (legacy)
  - Required: visitorName, purpose, organizationId
  - Optional: company, contactInfo

- **security_check_in_visitor** (MCP: ✅, DTE: ❌)
  - Check in visitor
  - Required: visitorName, organizationId
  - Optional: company, contactInfo, purpose, expectedBy, projectId

- **security_check_out_visitor** (MCP: ✅, DTE: ❌)
  - Check out visitor
  - Required: visitorLogId, organizationId
  - Optional: notes

- **security_get_visitor_log** (MCP: ✅, DTE: ❌)
  - Get visitor log details
  - Required: visitorLogId, organizationId

- **security_list_visitor_logs** (MCP: ✅, DTE: ❌)
  - List visitor logs
  - Required: organizationId
  - Optional: startDate, endDate, status, limit

- **security_get_on_site_visitors** (MCP: ✅, DTE: ❌)
  - Get currently on-site visitors
  - Required: organizationId
  - Optional: projectId

- **security_get_visitor_history** (MCP: ✅, DTE: ❌)
  - Get visitor history
  - Required: organizationId
  - Optional: visitorName, startDate, endDate, limit

GUARD MANAGEMENT:
- **security_create_guard** (MCP: ✅, DTE: ❌)
  - Create security guard
  - Required: name, organizationId
  - Optional: badgeNumber, shift, permissions

- **security_update_guard** (MCP: ✅, DTE: ❌)
  - Update guard details
  - Required: guardId, organizationId
  - Optional: Any field to update

- **security_get_guard** (MCP: ✅, DTE: ❌)
  - Get guard details
  - Required: guardId, organizationId

- **security_list_guards** (MCP: ✅, DTE: ❌)
  - List guards
  - Required: organizationId
  - Optional: isActive, limit

- **security_deactivate_guard** (MCP: ✅, DTE: ❌)
  - Deactivate guard
  - Required: guardId, organizationId

- **security_get_guard_permissions** (MCP: ✅, DTE: ❌)
  - Get guard permissions
  - Required: guardId, organizationId

GROUPS & LOCATIONS:
- **security_create_group** (MCP: ✅, DTE: ❌)
  - Create security group
  - Required: name, organizationId
  - Optional: description, permissions

- **security_update_group** (MCP: ✅, DTE: ❌)
  - Update security group
  - Required: groupId, organizationId
  - Optional: Any field to update

- **security_list_groups** (MCP: ✅, DTE: ❌)
  - List security groups
  - Required: organizationId
  - Optional: limit

- **security_create_location** (MCP: ✅, DTE: ❌)
  - Create security location
  - Required: name, organizationId
  - Optional: address, description, accessLevel

- **security_list_locations** (MCP: ✅, DTE: ❌)
  - List security locations
  - Required: organizationId
  - Optional: limit

CALL SHEET INTEGRATION:
- **security_get_todays_call_sheet** (MCP: ✅, DTE: ❌)
  - Get today's call sheet
  - Required: organizationId
  - Optional: projectId

- **security_get_expected_arrivals** (MCP: ✅, DTE: ❌)
  - Get expected arrivals from call sheet
  - Required: organizationId
  - Optional: date, projectId

- **security_get_arrival_status** (MCP: ✅, DTE: ❌)
  - Get arrival status for call sheet personnel
  - Required: callSheetId, organizationId

- **security_get_call_sheet_stats** (MCP: ✅, DTE: ❌)
  - Get call sheet statistics
  - Required: organizationId
  - Optional: date, projectId

SECURITY SETTINGS:
- **security_get_project_settings** (MCP: ✅, DTE: ❌)
  - Get security settings for project
  - Required: projectId, organizationId

- **security_update_project_settings** (MCP: ✅, DTE: ❌)
  - Update security settings
  - Required: projectId, organizationId
  - Optional: settings (object)

- **security_create_credential_type** (MCP: ✅, DTE: ❌)
  - Create credential type
  - Required: name, organizationId
  - Optional: description, requirements

- **security_list_credential_types** (MCP: ✅, DTE: ❌)
  - List credential types
  - Required: organizationId
  - Optional: limit

ANALYTICS & REPORTING:
- **security_get_desk_stats** (MCP: ✅, DTE: ❌)
  - Get security desk statistics
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **security_get_visitor_report** (MCP: ✅, DTE: ❌)
  - Get visitor report
  - Required: organizationId
  - Optional: startDate, endDate, projectId

- **security_get_guard_activity** (MCP: ✅, DTE: ❌)
  - Get guard activity report
  - Required: organizationId
  - Optional: guardId, startDate, endDate

- **security_get_arrival_analytics** (MCP: ✅, DTE: ❌)
  - Get arrival analytics
  - Required: organizationId
  - Optional: dateFrom, dateTo, projectId

═══════════════════════════════════════════════════════════════════════════════
TIMECARD TOOLS (10+ Tools)
═══════════════════════════════════════════════════════════════════════════════

TIMECARD ENTRY OPERATIONS:
- **create_timecard_entry** (MCP: ✅, DTE: ❌)
  - Create timecard entry
  - Required: userId, date, hours, organizationId
  - Optional: projectId, sessionId, regularHours, overtimeHours, doubleTimeHours, description, location, department

- **list_timecards** (MCP: ✅, DTE: ✅)
  - List timecard entries
  - Required: organizationId
  - Optional: userId, status, startDate, endDate, limit

- **submit_timecard** (MCP: ✅, DTE: ❌)
  - Submit timecard for approval
  - Required: timecardId, organizationId

- **approve_timecard** (MCP: ✅, DTE: ❌)
  - Approve timecard
  - Required: timecardId, organizationId
  - Optional: comments

- **reject_timecard** (MCP: ✅, DTE: ❌)
  - Reject timecard
  - Required: timecardId, rejectionReason, organizationId

TEMPLATE MANAGEMENT:
- **create_timecard_template** (MCP: ✅, DTE: ❌)
  - Create timecard template
  - Required: name, organizationId
  - Optional: description, standardHoursPerDay, overtimeThreshold, doubleTimeThreshold, hourlyRate, overtimeMultiplier, doubleTimeMultiplier, mealBreakRequired, mealBreakThreshold, mealPenaltyHours, department, role

- **list_timecard_templates** (MCP: ✅, DTE: ❌)
  - List timecard templates
  - Required: organizationId
  - Optional: isActive, department, role, limit

- **assign_timecard_template** (MCP: ✅, DTE: ❌)
  - Assign template to user
  - Required: userId, templateId, organizationId
  - Optional: projectId, effectiveDate, endDate

MANAGER OPERATIONS:
- **get_pending_approvals** (MCP: ✅, DTE: ❌)
  - Get pending timecard approvals
  - Required: organizationId
  - Optional: managerId, limit

- **list_direct_reports** (MCP: ✅, DTE: ❌)
  - List direct reports for manager
  - Required: managerId, organizationId
  - Optional: isActive, limit

ANALYTICS:
- **get_timecard_analytics** (MCP: ✅, DTE: ❌)
  - Get timecard analytics
  - Required: organizationId
  - Optional: startDate, endDate, department, targetUserId, includeUserPerformance

═══════════════════════════════════════════════════════════════════════════════
CALL SHEET TOOLS (20+ Tools)
═══════════════════════════════════════════════════════════════════════════════

SHEET OPERATIONS:
- **create_call_sheet** (MCP: ✅, DTE: ✅)
  - Create call sheet
  - Required: title, date, projectId, organizationId
  - Optional: startTime, location, notes, status

- **get_published_call_sheet** (MCP: ✅, DTE: ❌)
  - Get published call sheet
  - Required: callSheetId, organizationId

- **update_published_call_sheet** (MCP: ✅, DTE: ❌)
  - Update published call sheet
  - Required: callSheetId, organizationId
  - Optional: updates (object)

- **unpublish_call_sheet** (MCP: ✅, DTE: ❌)
  - Unpublish call sheet
  - Required: callSheetId, organizationId

- **get_live_updates** (MCP: ✅, DTE: ❌)
  - Get live updates for call sheet
  - Required: callSheetId, organizationId

RECORDS MANAGEMENT:
- **create_daily_record** (MCP: ✅, DTE: ❌)
  - Create daily production record
  - Required: callSheetId, organizationId
  - Optional: date, notes, weather, location

- **get_daily_record** (MCP: ✅, DTE: ❌)
  - Get daily record
  - Required: recordId, organizationId

- **list_daily_records** (MCP: ✅, DTE: ❌)
  - List daily records
  - Required: organizationId
  - Optional: callSheetId, startDate, endDate, limit

- **update_daily_record** (MCP: ✅, DTE: ❌)
  - Update daily record
  - Required: recordId, organizationId
  - Optional: Any field to update

- **delete_daily_record** (MCP: ✅, DTE: ❌)
  - Delete daily record
  - Required: recordId, organizationId

- **get_daily_records_report** (MCP: ✅, DTE: ❌)
  - Get daily records report
  - Required: organizationId
  - Optional: projectId, startDate, endDate

PERSONNEL MANAGEMENT:
- **add_personnel_to_call_sheet** (MCP: ✅, DTE: ❌)
  - Add personnel to call sheet
  - Required: callSheetId, personnelId, organizationId
  - Optional: role, department, callTime, notes

- **remove_personnel_from_call_sheet** (MCP: ✅, DTE: ❌)
  - Remove personnel from call sheet
  - Required: callSheetId, personnelId, organizationId

- **update_personnel_on_call_sheet** (MCP: ✅, DTE: ❌)
  - Update personnel on call sheet
  - Required: callSheetId, personnelId, organizationId
  - Optional: Any field to update

- **list_call_sheet_personnel** (MCP: ✅, DTE: ❌)
  - List personnel on call sheet
  - Required: callSheetId, organizationId
  - Optional: role, department

- **get_personnel_report** (MCP: ✅, DTE: ❌)
  - Get personnel report
  - Required: organizationId
  - Optional: projectId, startDate, endDate

TEMPLATES:
- **create_call_sheet_template** (MCP: ✅, DTE: ❌)
  - Create call sheet template
  - Required: name, organizationId
  - Optional: description, defaultFields

- **get_call_sheet_template** (MCP: ✅, DTE: ❌)
  - Get call sheet template
  - Required: templateId, organizationId

- **list_call_sheet_templates** (MCP: ✅, DTE: ❌)
  - List call sheet templates
  - Required: organizationId
  - Optional: limit

- **update_call_sheet_template** (MCP: ✅, DTE: ❌)
  - Update call sheet template
  - Required: templateId, organizationId
  - Optional: Any field to update

- **delete_call_sheet_template** (MCP: ✅, DTE: ❌)
  - Delete call sheet template
  - Required: templateId, organizationId

ANALYTICS:
- **get_call_sheet_analytics** (MCP: ✅, DTE: ❌)
  - Get call sheet analytics
  - Required: organizationId
  - Optional: projectId, startDate, endDate

- **get_publishing_stats** (MCP: ✅, DTE: ❌)
  - Get publishing statistics
  - Required: organizationId
  - Optional: projectId, startDate, endDate

═══════════════════════════════════════════════════════════════════════════════
TEAM & PEOPLE MANAGEMENT
═══════════════════════════════════════════════════════════════════════════════

- **manage_contact** (MCP: ✅, DTE: ✅)
  - Add/update contact
  - Required: firstName, lastName, organizationId
  - Optional: email, phone, company, role, notes

- **assign_team_member** (MCP: ✅, DTE: ✅)
  - Assign team member to project
  - Required: projectId, userId, organizationId
  - Optional: role (default: VIEWER)

- **search_users** (MCP: ✅, DTE: ✅)
  - Search users/team members
  - Required: organizationId
  - Optional: searchTerm, role, limit

═══════════════════════════════════════════════════════════════════════════════
PRODUCTION & SCHEDULING
═══════════════════════════════════════════════════════════════════════════════

- **check_schedule** (MCP: ✅, DTE: ✅)
  - Check schedule availability
  - Required: organizationId
  - Optional: startDate, endDate, userId, projectId

- **manage_task** (MCP: ✅, DTE: ✅)
  - Create, update, or complete tasks
  - Actions: 'create', 'update', 'complete'
  - Required for create: projectId, title, organizationId
  - Required for update/complete: taskId, organizationId

═══════════════════════════════════════════════════════════════════════════════
COMMON/UNIVERSAL TOOLS
═══════════════════════════════════════════════════════════════════════════════

- **universal_create** (MCP: ✅, DTE: ✅)
  - Create any document in recognized collection
  - Required: collectionName, organizationId, data (JSON object)

- **universal_update** (MCP: ✅, DTE: ✅)
  - Update any document in recognized collection
  - Required: collectionName, id, organizationId, data (JSON object)

- **manage_inventory_item** (MCP: ✅, DTE: ✅)
  - Create/update inventory item (legacy wrapper)
  - Required: name, type, department, organizationId
  - Optional: Any inventory field

- **list_inventory** (MCP: ✅, DTE: ✅)
  - List inventory items (legacy wrapper)
  - Required: organizationId
  - Optional: status, type, department, limit

═══════════════════════════════════════════════════════════════════════════════
TOOL USAGE GUIDELINES
═══════════════════════════════════════════════════════════════════════════════

1. **Tool Naming**: Always use exact snake_case tool names as listed above
2. **Required Parameters**: All required parameters must be included in action plans
3. **Optional Parameters**: Include optional parameters when relevant to the user's request
4. **Tool Availability**: 
   - MCP: ✅ = Available via MCP server
   - DTE: ✅ = Available via DataToolExecutor
   - Both = Available in both systems
5. **Action Types**: When creating action plans, use the exact tool name as the "type" field
6. **Parameter Mapping**: Map user requirements to tool parameters accurately
7. **Error Handling**: Plan for missing required parameters and suggest alternatives

═══════════════════════════════════════════════════════════════════════════════
`;
