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
CALLSHEET TOOLS (33 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **callsheet_get_call_sheet_analytics**
  - Get call sheet analytics including totals, status distribution, department distribution, average personnel per sheet, and recent activity.
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **callsheet_get_daily_records_report**
  - Get daily records report including statistics, status distribution, publishing trends, and template usage.
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **callsheet_get_personnel_report**
  - Get personnel report including statistics, usage patterns, department distribution, and most used personnel.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **callsheet_get_publishing_stats**
  - Get publishing statistics including live call sheets count, update frequency, and version distribution.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **callsheet_create_personnel**
  - Create a new personnel profile for call sheet assignments.
  - Required: organizationId, fullName, email, phone, position, department, assignmentType (INDIVIDUAL| DEPARTMENT| SUB_DEPARTMENT| ROLE)
  - Optional: subDepartment, role, notes

- **callsheet_delete_personnel**
  - Delete a personnel profile. This action cannot be undone.
  - Required: personnelId, organizationId
  - Optional: None

- **callsheet_get_personnel**
  - Get personnel details and usage statistics.
  - Required: personnelId, organizationId
  - Optional: None

- **callsheet_get_personnel_analytics**
  - Get personnel analytics including totals, department distribution, position distribution, most used personnel, and recently added.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **callsheet_list_personnel**
  - List personnel with optional filters by department, position, assignment type, active status, or search term.
  - Required: organizationId
  - Optional: department, position, assignmentType (INDIVIDUAL| DEPARTMENT| SUB_DEPARTMENT| ROLE), isActive, search, limit

- **callsheet_update_personnel**
  - Update an existing personnel profile.
  - Required: personnelId, organizationId
  - Optional: updates

- **callsheet_get_live_updates**
  - Get live update status including update count, last update time, and update history.
  - Required: publishedCallSheetId, organizationId
  - Optional: None

- **callsheet_get_published_call_sheet**
  - Get published call sheet data including version information and update history.
  - Required: publishedCallSheetId, organizationId
  - Optional: None

- **callsheet_unpublish_call_sheet**
  - Unpublish a call sheet, making it no longer live.
  - Required: publishedCallSheetId, organizationId
  - Optional: None

- **callsheet_update_published_call_sheet**
  - Update a published call sheet, incrementing version and update count.
  - Required: publishedCallSheetId, organizationId, updates
  - Optional: notifySubscribers

- **callsheet_cancel_daily_record**
  - Cancel a daily record with an optional reason.
  - Required: recordId, organizationId
  - Optional: reason

- **callsheet_create_daily_record**
  - Create a new daily production record based on a template.
  - Required: organizationId, templateId, recordDate, projectName
  - Optional: projectId, callSheetData, status (draft| published| archived| cancelled)

- **callsheet_get_daily_record**
  - Get complete daily record details including call sheet data and template reference.
  - Required: recordId, organizationId
  - Optional: None

- **callsheet_list_daily_records**
  - List daily records with optional filters by project, status, or date range.
  - Required: organizationId
  - Optional: projectId, status (draft| published| archived| cancelled), dateFrom, dateTo, limit

- **callsheet_publish_daily_record**
  - Publish a daily record, making it available to viewers.
  - Required: recordId, organizationId
  - Optional: publishLink

- **callsheet_update_daily_record**
  - Update an existing daily record.
  - Required: recordId, organizationId
  - Optional: updates

- **callsheet_archive_call_sheet**
  - Archive a call sheet, marking it as completed and stored.
  - Required: callSheetId, organizationId
  - Optional: None

- **callsheet_create_call_sheet**
  - Create a new call sheet for a production shoot. Supports personnel assignments, locations, schedule, vendors, and walkie channels.
  - Required: organizationId, title, date, location
  - Optional: projectId, status (draft| published| archived), personnel, locations, schedule, vendors, walkieChannels

- **callsheet_delete_call_sheet**
  - Delete a call sheet. This action cannot be undone.
  - Required: callSheetId, organizationId
  - Optional: None

- **callsheet_duplicate_call_sheet**
  - Duplicate an existing call sheet with optional new title and date.
  - Required: callSheetId, organizationId
  - Optional: newTitle, newDate

- **callsheet_get_call_sheet**
  - Get complete call sheet details including personnel, locations, and schedule.
  - Required: callSheetId, organizationId
  - Optional: includePersonnel, includeLocations

- **callsheet_list_call_sheets**
  - List call sheets with optional filters by project, status, date range, department, or search term.
  - Required: organizationId
  - Optional: projectId, status (draft| published| archived), dateFrom, dateTo, department, search, limit

- **callsheet_publish_call_sheet**
  - Publish a call sheet, creating a published version accessible to viewers.
  - Required: callSheetId, organizationId
  - Optional: publishLink

- **callsheet_update_call_sheet**
  - Update an existing call sheet. Provide the call sheet ID and fields to update.
  - Required: callSheetId, organizationId
  - Optional: updates

- **callsheet_create_from_template**
  - Create a new call sheet from a template with optional field overrides.
  - Required: templateId, organizationId, title, date
  - Optional: overrides

- **callsheet_create_template**
  - Create a new call sheet template with personnel, locations, schedule, vendors, and walkie channels.
  - Required: organizationId, title
  - Optional: personnel, locations, schedule, vendors, walkieChannels

- **callsheet_get_template**
  - Get template details including usage count.
  - Required: templateId, organizationId
  - Optional: None

- **callsheet_list_templates**
  - List call sheet templates with optional search filter and usage statistics.
  - Required: organizationId
  - Optional: search, limit

- **callsheet_update_template**
  - Update an existing call sheet template.
  - Required: templateId, organizationId
  - Optional: updates

═══════════════════════════════════════════════════════════════════════════════
CLIP SHOW PRO TOOLS (36 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **create_automation_rule**
  - Create an automation rule for a specific function. Rules trigger emails, messages, or notifications when automation functions are executed.
  - Required: organizationId, functionName, ruleName, emailTrigger
  - Optional: enabled, enabled, recipients, subject, body

- **get_automation_logs**
  - Get automation execution logs. Returns logs of automation rule executions with status, context data, and timestamps.
  - Required: organizationId
  - Optional: functionName, ruleName, status (success| error), limit

- **list_automation_functions**
  - List all available automation functions in Clip Show Pro. Returns the 18 automation functions organized by category (Pitching & Clearance, Stories & Scripts, Shows Management).
  - Required: organizationId
  - Optional: category (Pitching & Clearance| Stories & Scripts| Shows Management| All)

- **create_budget_group**
  - Create a budget group for a project. Budget groups organize clips and calculate costs based on templates or cost per second rates.
  - Required: projectId, organizationId, name, category (Production| Post-Production| Licensing House| Unassigned)
  - Optional: costPerSecond, clips

- **get_budget_analytics**
  - Get budget analytics and metrics for projects. Returns budget health, cost per second/clip, utilization rates, and trends.
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **get_budget_metadata**
  - Get budget summary and metadata for a project. Returns budget allocations, usage, and budget group information.
  - Required: projectId, organizationId
  - Optional: None

- **update_budget_values**
  - Update budget allocations for a project. Updates production, post-production, licensing house, and unassigned budget values.
  - Required: projectId, organizationId
  - Optional: productionBudget, postProductionBudget, licensingHouseBudget, unassignedBudget

- **create_calendar_event**
  - Create a calendar event in Clip Show Pro. Events can be linked to projects and stories, and assigned to team members.
  - Required: organizationId, title, startDate
  - Optional: endDate, projectId, storyId, description, assignedTo

- **list_calendar_events**
  - List calendar events for an organization. Returns events with their dates, project/story associations, and assignments. Supports filtering by project, story, and date range.
  - Required: organizationId
  - Optional: projectId, storyId, startDate, endDate, limit

- **activate_cue_sheet**
  - Activate or deactivate a cue sheet. Active cue sheets are used in production workflows.
  - Required: cueSheetId, organizationId
  - Optional: activate

- **create_cue_sheet**
  - Create a new cue sheet for a project. Cue sheets track music usage and licensing for production.
  - Required: projectId, organizationId, name
  - Optional: description, isActive

- **list_cue_sheets**
  - List cue sheets for an organization. Returns cue sheets with their status, project information, and music file counts.
  - Required: organizationId
  - Optional: projectId, isActive, limit

- **get_integration_status**
  - Get integration connection status for an organization. Returns connection status for Google Drive, Box, Dropbox, Airtable, Slack, and Email integrations.
  - Required: organizationId
  - Optional: provider (google-drive| box| dropbox| airtable| slack| email)

- **list_integration_settings**
  - List integration settings and configurations for an organization. Returns configuration details (without sensitive tokens) for all integrations.
  - Required: organizationId
  - Optional: provider (google-drive| box| dropbox| airtable| slack| email)

- **assign_producer_to_pitch**
  - Assign a producer to a pitch, or unassign if unassign is true. Validates user access and updates pitch assignment.
  - Required: pitchId, producerId, organizationId
  - Optional: unassign

- **create_pitch**
  - Create a new pitch in Clip Show Pro. Pitches represent clip ideas that go through clearance and licensing before becoming stories.
  - Required: organizationId, clipTitle, show
  - Optional: season, projectId, clipType (Quick Hit| Main Story| B-Roll| Archive| Interview), sourceLink, sourceLinks, researchNotes, categories, status (Pitched| Pursue Clearance| Do Not Pursue Clearance| Licensing Not Permitted| Killed), producerId, licensingSpecialistId

- **get_pitch**
  - Get detailed information about a specific pitch, including status, assignments, linked story, and all metadata.
  - Required: pitchId, organizationId
  - Optional: None

- **list_pitches**
  - List pitches for an organization. Returns pitches with their status, show, and project information. Supports filtering by project, status, and show.
  - Required: organizationId, status
  - Optional: projectId, show, limit

- **update_pitch_status**
  - Update the status of a pitch. Validates status transitions and updates pitch record. Status flow: Pitched → Pursue Clearance → Working on License → Pending Signature → License Cleared → Ready for Story
  - Required: pitchId, status, organizationId
  - Optional: notes

- **approve_script**
  - Approve a script version for a story. Updates story status to 'Script Complete' and marks the version as approved in revision history.
  - Required: storyId, organizationId
  - Optional: version, notes

- **get_script_versions**
  - Get script version history for a story. Returns all revisions with version numbers, dates, status, and change notes.
  - Required: storyId, organizationId
  - Optional: includeContent

- **request_script_revision**
  - Request a revision for a script version. Updates story status to 'Needs Revision' and adds revision notes to the version.
  - Required: storyId, organizationId, revisionNotes
  - Optional: version, requestedBy

- **save_script_version**
  - Save a new version of a script for a story. Maintains version history in the revisions array. Script content should be in HTML format with 3-column table structure.
  - Required: storyId, scriptContent, organizationId
  - Optional: version, changeNotes, status (draft| submitted)

- **update_script_content**
  - Update the script content for a story. Optionally saves as a new version in revision history. Updates the current scriptContent field.
  - Required: storyId, scriptContent, organizationId
  - Optional: saveAsVersion

- **create_episode**
  - Create a new episode for a season. Episodes are the individual production units within a season.
  - Required: seasonId, episodeNumber, organizationId
  - Optional: title, projectId, status (In Production| Completed| Planned)

- **create_season**
  - Create a new season for a show. Seasons contain episodes and track production status.
  - Required: showId, seasonNumber, organizationId
  - Optional: name, projectId, status (In Production| Completed| Planned)

- **create_show**
  - Create a new show in Clip Show Pro. Shows contain seasons and episodes, and are associated with projects.
  - Required: organizationId, name
  - Optional: projectId, description, isActive

- **list_shows**
  - List shows for an organization. Returns shows with their status, season counts, and project information. Supports filtering by project and active status.
  - Required: organizationId
  - Optional: projectId, isActive, limit

- **toggle_show_status**
  - Toggle a show's active/inactive status. Inactive shows are hidden from active production workflows but retain all data.
  - Required: showId, organizationId
  - Optional: None

- **update_show**
  - Update show details (name, description, project association). Does not modify seasons or episodes.
  - Required: showId, organizationId
  - Optional: name, description, projectId

- **create_story_from_pitch**
  - Create a story from a cleared pitch. This is the standard workflow: pitch is cleared (Ready for Story) → story is created. Links pitch to story bidirectionally.
  - Required: pitchId, organizationId
  - Optional: title, projectId, writerId, producerId, associateProducerId, status (Needs Script| Ready for Script| In Progress)

- **get_story**
  - Get detailed information about a specific story, including status, assignments, linked pitches, script versions, and all metadata.
  - Required: storyId, organizationId
  - Optional: includeScriptContent

- **link_pitch_to_story**
  - Link a pitch to a story (or unlink if unlink is true). Stories can have multiple pitches linked via clipPitchIds array. Updates both story and pitch records bidirectionally.
  - Required: storyId, pitchId, organizationId
  - Optional: unlink

- **list_stories**
  - List stories for an organization. Returns stories with their status, show, and project information. Supports filtering by project, status, show, and writer.
  - Required: organizationId
  - Optional: projectId, status, show, writerId, limit

- **sync_story_from_pitch**
  - Sync story data from a linked pitch. Updates story fields (show, season, clipType, sourceLink, researchNotes) with current values from the pitch. Useful when pitch data is updated after story creation.
  - Required: storyId, pitchId, organizationId
  - Optional: syncFields (show| season| clipType| sourceLink| sourceLinks| researchNotes)

- **update_story_status**
  - Update the status of a story. Supports all story statuses including script phase (Needs Script, In Progress, Script Complete) and edit phase (A Roll, v1-v5 Edit, RC, Assembled) statuses.
  - Required: storyId, status, organizationId
  - Optional: notes

═══════════════════════════════════════════════════════════════════════════════
CORE & COMMON TOOLS (8 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **list_inventory**
  - List inventory items (equipment, assets) for an organization. Useful for checking availability before checkout.
  - Required: organizationId
  - Optional: status (AVAILABLE| CHECKED_OUT| MAINTENANCE| RETIRED), search, limit

- **manage_inventory_item**
  - Add or update equipment in the inventory database.
  - Required: name, category, organizationId
  - Optional: serialNumber, tags

- **universal_create**
  - Create a document in any supported collection within the Backbone ecosystem. Enforces organization-based access and standard metadata.
  - Required: collectionName, data, organizationId
  - Optional: projectId

- **universal_update**
  - Update an existing document in any supported collection. Enforces organization-based access.
  - Required: collectionName, id, data, organizationId
  - Optional: None

- **assign_team_member**
  - Assign a team member to a project with a specific role. Essential for production workflow team management.
  - Required: projectId, userId, organizationId
  - Optional: role (PRODUCER| EDITOR| DIRECTOR| VIEWER| ADMIN)

- **create_project**
  - Create a new high-level project in Backbone. Projects act as central containers for sessions, stories, and assets.
  - Required: name, organizationId
  - Optional: description, type (DOCUMENTARY| NEWS| SCRIPTED| COMMERCIAL| OTHER), scope (APP_SPECIFIC| GLOBAL), applicationType

- **manage_contact**
  - Add or update a person in the Address Book. Essential for team management and security logging.
  - Required: firstName, lastName, organizationId
  - Optional: email, phone, role, addressBookId

- **manage_task**
  - Create, update, or complete tasks within a project. Essential for production workflow task management.
  - Required: action (create| update| complete), organizationId
  - Optional: taskId, projectId, title, assigneeId, dueDate, description

═══════════════════════════════════════════════════════════════════════════════
CREATIVE & WORKFLOW TOOLS (2 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **create_budget**
  - Create a new budget container for a project.
  - Required: projectId, totalAmount, organizationId
  - Optional: currency, fiscalYear, notes

- **create_script_package**
  - Create a complete script package: creates a Story record in Firestore and auto-generates the script content using AI.
  - Required: title, concept, organizationId
  - Optional: showId, seasonId, episodeId, duration, format (3-column-table| screenplay)

═══════════════════════════════════════════════════════════════════════════════
DELIVERABLES TOOLS (27 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **deliverable_get_analytics**
  - Get comprehensive deliverable analytics including total uploads, items, status breakdown, type distribution, and processing success rate.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **deliverable_get_delivery_timeline**
  - Get delivery timeline including status transitions, average delivery time, and bottleneck analysis.
  - Required: organizationId
  - Optional: itemId, dateFrom, dateTo

- **deliverable_get_status_report**
  - Get a detailed status report including status breakdown, items by status, status trends, and completion rates.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **deliverable_get_upload_report**
  - Get upload statistics including processing times, success/failure rates, and items extracted per upload.
  - Required: organizationId
  - Optional: userId, dateFrom, dateTo

- **deliverable_create_item**
  - Manually create a deliverable item. Can be associated with an upload or created standalone.
  - Required: organizationId, type, description
  - Optional: uploadId, specDetails, status (pending| in_progress| ready| delivered)

- **deliverable_delete_item**
  - Delete a deliverable item.
  - Required: itemId, organizationId
  - Optional: None

- **deliverable_get_item**
  - Get detailed information about a deliverable item including upload reference, task links, and status history.
  - Required: itemId, organizationId
  - Optional: None

- **deliverable_list_items**
  - List deliverable items with optional filters by upload, status, and type. Returns statistics by status and type.
  - Required: organizationId
  - Optional: uploadId, status (pending| in_progress| ready| delivered), type, limit

- **deliverable_update_item**
  - Update a deliverable item. Can update type, description, specDetails, or other fields.
  - Required: itemId, organizationId
  - Optional: updates

- **deliverable_update_item_status**
  - Update the status of a deliverable item. Adds entry to status history.
  - Required: itemId, organizationId, status (pending| in_progress| ready| delivered)
  - Optional: notes

- **deliverable_get_ai_response**
  - Get the raw AI response from document parsing. Includes parsed items preview.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_get_parsing_status**
  - Get the current parsing status including progress percentage and estimated completion time.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_initiate_parsing**
  - Manually initiate AI parsing for a deliverable upload. This triggers the MasterAgent Cloud Function to parse the document.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_retry_parsing**
  - Retry AI parsing for a failed upload. Resets the status and initiates parsing again.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_bulk_update_status**
  - Bulk update the status of multiple deliverable items. Returns count of updated items.
  - Required: organizationId, itemIds, status (pending| in_progress| ready| delivered)
  - Optional: notes

- **deliverable_get_items_by_status**
  - Get deliverable items filtered by status. Optionally filter by upload ID.
  - Required: organizationId, status (pending| in_progress| ready| delivered)
  - Optional: uploadId, limit

- **deliverable_mark_delivered**
  - Mark a deliverable item as delivered. Updates status to 'delivered' and records delivery date.
  - Required: itemId, organizationId
  - Optional: deliveryDate, notes

- **deliverable_mark_ready**
  - Mark a deliverable item as ready for delivery. Updates status to 'ready' and adds entry to status history.
  - Required: itemId, organizationId
  - Optional: notes

- **deliverable_get_item_tasks**
  - Get all tasks linked to a deliverable item. Returns task details.
  - Required: itemId, organizationId
  - Optional: None

- **deliverable_get_task_deliverables**
  - Get all deliverable items linked to a task. Returns status summary.
  - Required: taskId, organizationId
  - Optional: None

- **deliverable_link_to_task**
  - Link a deliverable item to a task. Creates bidirectional relationship between item and task.
  - Required: itemId, taskId, organizationId
  - Optional: None

- **deliverable_unlink_from_task**
  - Unlink a deliverable item from a task. Removes bidirectional relationship.
  - Required: itemId, taskId, organizationId
  - Optional: None

- **deliverable_create_upload**
  - Create a deliverable upload record. This triggers AI parsing of the document to extract deliverable items.
  - Required: organizationId, originalFilename, url, userId
  - Optional: distributorName

- **deliverable_delete_upload**
  - Delete a deliverable upload and optionally its associated deliverable items.
  - Required: uploadId, organizationId
  - Optional: deleteItems

- **deliverable_get_upload**
  - Get details of a deliverable upload including status, item count, and AI response status.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_get_upload_status**
  - Get the processing status of a deliverable upload including progress, error messages, and items extracted count.
  - Required: uploadId, organizationId
  - Optional: None

- **deliverable_list_uploads**
  - List deliverable uploads with optional filters by user, status, and date range. Returns statistics by status.
  - Required: organizationId
  - Optional: userId, status (uploading| processing| completed| error), dateFrom, dateTo, limit

═══════════════════════════════════════════════════════════════════════════════
DISCOVERY TOOLS (3 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **query_firestore**
  - Search and retrieve records from any collection. Enforces organization-based security.
  - Required: collectionPath, filters, field, operator (==| !=| >| <| >=| <=| array-contains| in| array-contains-any), value
  - Optional: None

- **search_users**
  - Find team members or contacts within an organization by name or role.
  - Required: organizationId
  - Optional: name, role

- **semantic_search**
  - Find information conceptually related to a query. Useful for policy discovery, project history, and pattern matching.
  - Required: query, organizationId
  - Optional: collections, limit

═══════════════════════════════════════════════════════════════════════════════
INVENTORY & WAREHOUSE (IWM) TOOLS (47 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **get_availability_report**
  - Get availability report for inventory items. Shows available, checked out, maintenance, and unavailable items with detailed breakdown.
  - Required: organizationId
  - Optional: type (HARDWARE| SOFTWARE| CAMERA| AUDIO| LIGHTING| COMPUTER| PERIPHERAL| NETWORK| OTHER), department

- **get_checkout_trends**
  - Get checkout trend analysis. Returns checkout patterns over time grouped by day, week, or month.
  - Required: organizationId
  - Optional: dateFrom, dateTo, groupBy (day| week| month)

- **get_inventory_analytics**
  - Get comprehensive inventory analytics including health metrics, utilization rates, status breakdown, and trends.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **get_utilization_report**
  - Get utilization metrics for inventory items. Calculates utilization rates, average checkout duration, and usage patterns.
  - Required: organizationId
  - Optional: dateFrom, dateTo

- **bulk_checkout**
  - Checkout multiple inventory items at once to the same user or project. Validates all items are available before checking out.
  - Required: organizationId, itemIds, assignedTo
  - Optional: assignmentType (USER| PROJECT), expectedReturnDate, notes, projectId

- **checkin_inventory_item**
  - Checkin/return inventory item. Updates item status to ACTIVE and marks assignment as returned. Creates return history entry.
  - Required: itemId, organizationId
  - Optional: notes, condition

- **checkout_inventory_item**
  - Checkout inventory item to a user or project. Updates item status to CHECKED_OUT and creates assignment history. Prevents double-booking by checking if item is already checked out.
  - Required: itemId, organizationId, assignedTo
  - Optional: assignmentType (USER| PROJECT), expectedReturnDate, notes, projectId

- **get_assignment_history**
  - Get checkout/checkin assignment history for an inventory item. Returns all assignments with checkout dates, return dates, and assignment details.
  - Required: itemId, organizationId
  - Optional: limit

- **get_overdue_items**
  - Get inventory items that are past their expected return date. Returns items with overdue status and days overdue.
  - Required: organizationId
  - Optional: limit

- **list_checked_out_items**
  - List all currently checked out inventory items. Supports filtering by assigned user or project.
  - Required: organizationId
  - Optional: assignedTo, projectId, limit

- **bulk_update_inventory**
  - Bulk update multiple inventory items with the same field values. Useful for updating status, department, or location for multiple items at once.
  - Required: organizationId, itemIds, updates
  - Optional: status (ACTIVE| MAINTENANCE| INACTIVE| CHECKED_OUT| RETIRED), department, location, notes

- **create_inventory_item**
  - Create a new inventory item in IWM. Supports all inventory types (HARDWARE, SOFTWARE, CAMERA, AUDIO, LIGHTING, COMPUTER, PERIPHERAL, NETWORK, OTHER) with full metadata tracking.
  - Required: organizationId, name, type (HARDWARE| SOFTWARE| CAMERA| AUDIO| LIGHTING| COMPUTER| PERIPHERAL| NETWORK| OTHER), department
  - Optional: status (ACTIVE| MAINTENANCE| INACTIVE| RETIRED), location, serialNumber, manufacturer, model, purchasePrice, purchaseDate, warrantyExpires, notes, specifications

- **delete_inventory_item**
  - Delete inventory item. By default performs soft delete (sets status to RETIRED). Use hardDelete=true for permanent deletion. Hard delete removes all history and assignments.
  - Required: itemId, organizationId
  - Optional: hardDelete

- **get_inventory_history**
  - Get action history for an inventory item. Returns all actions (CREATED, UPDATED, STATUS_CHANGED, CHECKED_OUT, CHECKED_IN, RETIRED, etc.) with timestamps and notes.
  - Required: itemId, organizationId
  - Optional: limit

- **get_inventory_item**
  - Get inventory item details. Optionally includes action history for the item.
  - Required: itemId, organizationId
  - Optional: includeHistory

- **list_inventory_items**
  - List inventory items with filters. Supports filtering by status, type, department, assignment, and project. Includes search functionality.
  - Required: organizationId
  - Optional: status (ACTIVE| MAINTENANCE| INACTIVE| CHECKED_OUT| RETIRED), type (HARDWARE| SOFTWARE| CAMERA| AUDIO| LIGHTING| COMPUTER| PERIPHERAL| NETWORK| OTHER), department, assignedTo, projectId, search, limit

- **update_inventory_item**
  - Update inventory item details. Only provided fields will be updated. Maintains existing data for fields not specified.
  - Required: itemId, organizationId
  - Optional: name, type (HARDWARE| SOFTWARE| CAMERA| AUDIO| LIGHTING| COMPUTER| PERIPHERAL| NETWORK| OTHER), department, location, serialNumber, manufacturer, model, purchasePrice, purchaseDate, warrantyExpires, notes, specifications

- **update_inventory_status**
  - Update inventory item status. Valid statuses: ACTIVE, MAINTENANCE, INACTIVE, CHECKED_OUT, RETIRED. Creates history entry for status change.
  - Required: itemId, organizationId, status (ACTIVE| MAINTENANCE| INACTIVE| CHECKED_OUT| RETIRED)
  - Optional: notes

- **assign_ip_to_inventory**
  - Assign an IP address to an inventory item. Tracks network infrastructure assignments for equipment.
  - Required: itemId, organizationId, ipAddress
  - Optional: networkId, notes

- **create_ip_range**
  - Create an IP range definition for network infrastructure. Defines available IP addresses for assignment to inventory items.
  - Required: organizationId, networkId, startIP, endIP
  - Optional: description, notes

- **get_ip_assignments**
  - Get all IP address assignments for an inventory item. Returns IP addresses, network IDs, and assignment details.
  - Required: itemId, organizationId
  - Optional: None

- **list_ip_ranges**
  - List IP ranges for an organization. Supports filtering by network ID.
  - Required: organizationId
  - Optional: networkId, limit

- **unassign_ip_from_inventory**
  - Remove IP address assignment from an inventory item. Can remove a specific assignment or all IP assignments for the item.
  - Required: itemId, organizationId
  - Optional: assignmentId

- **checkout_to_project**
  - Checkout inventory item to a project. This is a specialized version of checkout_inventory_item for project assignments. Prevents double-booking.
  - Required: itemId, projectId, organizationId
  - Optional: expectedReturnDate, notes

- **get_project_inventory**
  - Get all inventory items assigned to a project. Returns currently checked out items and optionally returned items. Prevents double-booking by showing project-specific inventory.
  - Required: projectId, organizationId
  - Optional: includeReturned

- **get_project_inventory_summary**
  - Get inventory summary for a project. Returns statistics including total items, by type, by status, overdue items, and utilization metrics.
  - Required: projectId, organizationId
  - Optional: None

- **return_from_project**
  - Return inventory item from a project. Updates item status to ACTIVE and marks project assignment as returned. Item becomes available for other projects.
  - Required: itemId, projectId, organizationId
  - Optional: notes, condition

- **transfer_between_projects**
  - Transfer inventory item from one project to another. Returns item from source project and checks it out to destination project in one operation.
  - Required: itemId, fromProjectId, toProjectId, organizationId
  - Optional: notes

- **create_rental_agreement**
  - Create a rental agreement for a set inventory or wardrobe item from a rental house. Links the agreement to the item and rental house.
  - Required: organizationId, rentalHouseId, itemId, itemType (SET_INVENTORY| WARDROBE), rentalStartDate, rentalEndDate
  - Optional: agreementNumber, deposit, insurance, insuranceAmount, terms, notes

- **create_rental_house**
  - Create a new rental house vendor. Rental houses provide set inventory and wardrobe items for production.
  - Required: organizationId, name
  - Optional: contactPerson, phone, email, address, website, notes

- **list_rental_houses**
  - List rental house vendors for an organization. Returns rental houses with contact information.
  - Required: organizationId
  - Optional: limit

- **update_rental_house**
  - Update rental house details. Only provided fields will be updated.
  - Required: rentalHouseId, organizationId
  - Optional: name, contactPerson, phone, email, address, website, notes

- **create_set_inventory_item**
  - Create a new set inventory item for production sets. Supports furniture, props, decor, and set pieces with team member assignments.
  - Required: organizationId, itemName, category (Furniture| Props| Decor| Set Pieces| Other)
  - Optional: description, color, condition (New| Excellent| Good| Fair| Poor| Damaged), setName, sceneNumbers, storageLocation, isRented, rentalHouseId, assignedToProductionDesigner, assignedToArtDirector, assignedToSetDesigner, assignedToPropMaster, notes

- **get_set_inventory_by_scene**
  - Get all set inventory items for a specific scene number. Returns items that are assigned to the scene with their status and location.
  - Required: organizationId, sceneNumber
  - Optional: setName

- **list_set_inventory**
  - List set inventory items with filters. Supports filtering by category, status, set name, and scene number.
  - Required: organizationId
  - Optional: category (Furniture| Props| Decor| Set Pieces| Other), status (IN_STORAGE| PICKED| ON_SET| IN_TRANSIT| RETURNED| DAMAGED| RETIRED), setName, sceneNumber, limit

- **pick_set_item**
  - Pick set inventory item from storage. Updates status to PICKED and records who picked it and when.
  - Required: itemId, organizationId
  - Optional: pickedBy, notes

- **return_set_item**
  - Return set inventory item to storage. Updates status to RETURNED or DAMAGED based on condition. Records return details.
  - Required: itemId, organizationId
  - Optional: returnedBy, returnCondition (New| Excellent| Good| Fair| Poor| Damaged), notes

- **update_set_inventory_item**
  - Update set inventory item details. Only provided fields will be updated.
  - Required: itemId, organizationId
  - Optional: itemName, description, category (Furniture| Props| Decor| Set Pieces| Other), color, condition (New| Excellent| Good| Fair| Poor| Damaged), setName, sceneNumbers, storageLocation, notes

- **create_setup_profile**
  - Create an equipment setup profile. Setup profiles define standard equipment configurations for reuse across productions.
  - Required: organizationId, name, equipment, inventoryId
  - Optional: description, role

- **create_studio_assembly**
  - Create a studio assembly (saved container). Studio assemblies are saved configurations of equipment layouts for reuse.
  - Required: organizationId, name, items, inventoryId, position, x, y
  - Optional: description

- **get_setup_profile**
  - Get setup profile details including equipment list and configuration settings.
  - Required: profileId, organizationId
  - Optional: None

- **get_studio_assembly**
  - Get studio assembly details including all items and layout configuration.
  - Required: assemblyId, organizationId
  - Optional: None

- **assign_wardrobe_item**
  - Assign wardrobe item to talent or character. Updates status to ASSIGNED and records assignment.
  - Required: itemId, organizationId, assignedTo
  - Optional: notes

- **create_wardrobe_item**
  - Create a new wardrobe item. Supports clothing, accessories, shoes, jewelry, and other wardrobe items with size, color, and brand tracking.
  - Required: organizationId, itemName, category (COSTUME| ACCESSORY| SHOES| JEWELRY| HAT| OUTERWEAR| UNDERWEAR| OTHER)
  - Optional: size, color, brand, condition (New| Excellent| Good| Fair| Poor| Damaged), description, assignedTo, notes

- **get_wardrobe_by_category**
  - Get wardrobe items by category. Returns items filtered by category with optional status filter.
  - Required: organizationId, category (COSTUME| ACCESSORY| SHOES| JEWELRY| HAT| OUTERWEAR| UNDERWEAR| OTHER)
  - Optional: status (AVAILABLE| PICKED| ON_SET| IN_CLEANING| RETURNED| DAMAGED| RETIRED), limit

- **list_wardrobe_items**
  - List wardrobe items with filters. Supports filtering by category, status, and assignment.
  - Required: organizationId
  - Optional: category (COSTUME| ACCESSORY| SHOES| JEWELRY| HAT| OUTERWEAR| UNDERWEAR| OTHER), status (AVAILABLE| PICKED| ON_SET| IN_CLEANING| RETURNED| DAMAGED| RETIRED), assignedTo, limit

- **update_wardrobe_item**
  - Update wardrobe item details. Only provided fields will be updated.
  - Required: itemId, organizationId
  - Optional: itemName, category (COSTUME| ACCESSORY| SHOES| JEWELRY| HAT| OUTERWEAR| UNDERWEAR| OTHER), size, color, brand, condition (New| Excellent| Good| Fair| Poor| Damaged), description, notes

═══════════════════════════════════════════════════════════════════════════════
PRODUCTION TOOLS (8 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **check_schedule**
  - Check schedule availability for sessions, meetings, or resources. Verifies conflicts before creating new sessions.
  - Required: organizationId
  - Optional: startDate, endDate, userId, projectId

- **create_call_sheet**
  - Generate a new call sheet for a shoot. This creates a record in the publishedCallSheets collection which is accessible by the standalone call sheet viewer.
  - Required: title, date, projectId, organizationId
  - Optional: startTime, location, notes

- **create_delivery_package**
  - Create a new delivery package for distribution.
  - Required: name, projectId, organizationId
  - Optional: items, recipientEmail

- **create_session**
  - Create a session (capture, review, or meeting) within a project. Essential for scheduling production events.
  - Required: title, projectId, organizationId
  - Optional: type (Capture| Review| Edit| Meeting), scheduledAt, durationMinutes

- **get_available_phase_transitions**
  - Get available phase transitions for a session. Returns valid next phases based on current phase and workflow completion status.
  - Required: sessionId, organizationId
  - Optional: None

- **get_session_phase**
  - Get the current phase of a session. Returns the phase (PRE_PRODUCTION, PRODUCTION, POST_PRODUCTION, DELIVERY, ARCHIVED) and associated status.
  - Required: sessionId, organizationId
  - Optional: None

- **list_timecards**
  - List timecard entries for an organization. Useful for reviewing logged hours and approval workflows.
  - Required: organizationId
  - Optional: userId, status (DRAFT| SUBMITTED| APPROVED| REJECTED), limit

- **transition_session_phase**
  - Transition a session to a new phase. Validates workflow completion (if enabled) and updates session status accordingly.
  - Required: sessionId, targetPhase (PRE_PRODUCTION| PRODUCTION| POST_PRODUCTION| DELIVERY| ARCHIVED), organizationId
  - Optional: reason, validateWorkflowCompletion

═══════════════════════════════════════════════════════════════════════════════
SECURITY DESK TOOLS (30 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **security_get_arrival_analytics**
  - Get arrival analytics. Returns arrival patterns, on-time vs late trends, department performance, and time-based analytics.
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

- **security_get_desk_stats**
  - Get security desk statistics. Returns on-site count, expected count, late count, on-time count, and department breakdown.
  - Required: organizationId
  - Optional: projectId, date

- **security_get_guard_activity**
  - Get guard activity report. Returns guard activity statistics, check-in/out counts, and activity timeline.
  - Required: organizationId
  - Optional: guardId, dateFrom, dateTo

- **security_get_visitor_report**
  - Get visitor report. Returns visitor statistics, check-in/out patterns, peak times, and visitor type breakdown.
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo, visitorType (TEAM_MEMBER| GUEST| VENDOR| VISITOR)

- **security_get_arrival_status**
  - Get arrival status for team members. Returns arrival status per team member with on-time vs late tracking and not arrived list.
  - Required: organizationId
  - Optional: projectId, date

- **security_get_call_sheet_stats**
  - Get call sheet statistics. Returns expected count, on-site count, late count, on-time percentage, and department breakdown.
  - Required: organizationId
  - Optional: projectId, date

- **security_get_expected_arrivals**
  - Get expected arrivals for a specific date. Returns expected arrivals list with call times and department breakdown.
  - Required: organizationId, date
  - Optional: projectId, department

- **security_get_todays_call_sheet**
  - Get today's call sheet. Returns today's call sheet data with expected arrivals and personnel list.
  - Required: organizationId
  - Optional: projectId

- **security_create_group**
  - Create security group. Creates guard group/team with lead contact and guard assignments.
  - Required: organizationId, name, leadContactId, operatingHours
  - Optional: projectId, guardIds, start, end, daysOfWeek

- **security_create_location**
  - Create security location/post. Creates a security post or location for guard assignment.
  - Required: organizationId, name, type (static_post| patrol_route| roving| monitoring_room)
  - Optional: projectId, description, requiredGuards

- **security_list_groups**
  - List security groups. Returns array of security groups with guard count per group.
  - Required: organizationId
  - Optional: projectId, limit

- **security_list_locations**
  - List security locations. Returns array of locations with statistics by type.
  - Required: organizationId
  - Optional: projectId, type (static_post| patrol_route| roving| monitoring_room), isActive, limit

- **security_update_group**
  - Update security group. Updates specified fields in group configuration.
  - Required: groupId, organizationId, updates, operatingHours
  - Optional: name, leadContactId, projectId, guardIds, start, end, daysOfWeek

- **security_create_guard**
  - Create security guard. Creates guard profile in securityGuards collection and optionally creates Firebase Auth user.
  - Required: organizationId, email, name, role (LEAD_SECURITY| SECURITY_GUARD| ADMIN| OWNER| SUPERADMIN)
  - Optional: phoneNumber, badgeNumber, licenseNumber, licenseExpiry, leadContactId, groupName, canAccessProjects, permissions

- **security_deactivate_guard**
  - Deactivate guard. Sets guard status to inactive and optionally disables Firebase Auth user.
  - Required: guardId, organizationId
  - Optional: reason

- **security_get_guard**
  - Get guard details including permissions and current shift if active.
  - Required: guardId, organizationId
  - Optional: None

- **security_get_guard_permissions**
  - Get guard permissions including access levels and project access list.
  - Required: guardId, organizationId
  - Optional: None

- **security_list_guards**
  - List guards with filters. Returns array of guards and statistics by role and status.
  - Required: organizationId
  - Optional: role (LEAD_SECURITY| SECURITY_GUARD| ADMIN| OWNER| SUPERADMIN), status (active| inactive| suspended), groupName, limit

- **security_update_guard**
  - Update guard details. Updates specified fields in guard profile.
  - Required: guardId, organizationId, updates
  - Optional: name, email, role (LEAD_SECURITY| SECURITY_GUARD| ADMIN| OWNER| SUPERADMIN), phoneNumber, badgeNumber, licenseNumber, licenseExpiry, leadContactId, groupName, canAccessProjects, permissions, status (active| inactive| suspended)

- **log_visitor**
  - Check in a visitor and create an entry in the visitor logs.
  - Required: visitorName, purpose, organizationId
  - Optional: location

- **security_create_credential_type**
  - Create credential/badge type. Adds a new credential type to project security settings.
  - Required: organizationId, projectId, name, accessLevel
  - Optional: description, color, imageUrl

- **security_get_project_settings**
  - Get project security settings. Returns security settings including credential types, wristband config, and restricted zones.
  - Required: organizationId, projectId
  - Optional: None

- **security_list_credential_types**
  - List credential types. Returns array of credential types sorted by access level.
  - Required: organizationId, projectId
  - Optional: None

- **security_update_project_settings**
  - Update project security settings. Updates credential types, wristband config, and restricted zones.
  - Required: organizationId, projectId
  - Optional: credentialTypes, wristbandDayConfig, restrictedZones

- **security_check_in_visitor**
  - Check in visitor via QR scan or manual entry. Creates visitor log entry and updates team member location status.
  - Required: organizationId, checkInUUID, guardId
  - Optional: projectId, locationStatus (on_prem| on_location| wrapped| another_location), notes

- **security_check_out_visitor**
  - Check out visitor. Updates visitor log with check-out time and final location status.
  - Required: organizationId, visitorLogId, guardId
  - Optional: locationStatus (on_prem| on_location| wrapped| another_location), notes

- **security_get_on_site_visitors**
  - Get currently on-site visitors. Returns array of on-site visitors with count by visitor type and department breakdown.
  - Required: organizationId
  - Optional: projectId, limit

- **security_get_visitor_history**
  - Get check-in/out history for a visitor. Returns array of visitor log entries with check-in/out pattern and frequency statistics.
  - Required: visitorId, organizationId
  - Optional: limit

- **security_get_visitor_log**
  - Get specific visitor log entry with complete details including check-in/out times and guard information.
  - Required: visitorLogId, organizationId
  - Optional: None

- **security_list_visitor_logs**
  - List visitor logs with filters. Returns array of visitor logs and statistics.
  - Required: organizationId
  - Optional: projectId, visitorType (TEAM_MEMBER| GUEST| VENDOR| VISITOR), dateFrom, dateTo, isOnSite, limit

═══════════════════════════════════════════════════════════════════════════════
TIMECARD MANAGEMENT TOOLS (10 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **approve_timecard**
  - Approve a submitted timecard entry. Requires manager permissions. Updates status to APPROVED and records approval details.
  - Required: timecardId, organizationId
  - Optional: comments

- **assign_timecard_template**
  - Assign a timecard template to a user. This determines the labor rules and pay rates that apply to their timecard entries. Can be scoped to a specific project or apply organization-wide.
  - Required: userId, templateId, organizationId
  - Optional: projectId, effectiveDate, endDate

- **create_timecard_entry**
  - Create a new timecard entry for tracking hours worked. Automatically calculates regular/overtime hours if not specified.
  - Required: userId, date, hours, organizationId
  - Optional: projectId, sessionId, regularHours, overtimeHours, doubleTimeHours, description, location, department, status (DRAFT| SUBMITTED| APPROVED| REJECTED)

- **create_timecard_template**
  - Create a new timecard template with labor rules and pay rates. Templates define how hours are calculated and paid for timecard entries.
  - Required: name, organizationId
  - Optional: description, standardHoursPerDay, overtimeThreshold, doubleTimeThreshold, hourlyRate, overtimeMultiplier, doubleTimeMultiplier, mealBreakRequired, mealBreakThreshold, mealPenaltyHours, department, role

- **get_pending_approvals**
  - Get timecard entries that are pending approval. Returns timecards with status SUBMITTED that are awaiting manager review. Useful for managers to see what needs their attention.
  - Required: organizationId
  - Optional: managerId, limit

- **get_timecard_analytics**
  - Get comprehensive timecard analytics including total hours, pay, compliance rates, and department breakdowns. Useful for reporting and understanding timecard trends.
  - Required: organizationId
  - Optional: startDate, endDate, department, targetUserId, includeUserPerformance

- **list_direct_reports**
  - List all employees (direct reports) that report to a specific manager. Useful for managers to see their team members and for routing timecard approvals.
  - Required: managerId, organizationId
  - Optional: isActive, limit

- **list_timecard_templates**
  - List available timecard templates for an organization. Useful for finding templates before assigning them to users or creating timecard entries.
  - Required: organizationId
  - Optional: isActive, department, role, limit

- **reject_timecard**
  - Reject a submitted timecard entry. Requires manager permissions. Updates status to REJECTED and records rejection reason.
  - Required: timecardId, rejectionReason, organizationId
  - Optional: None

- **submit_timecard**
  - Submit a draft timecard entry for manager approval. Updates status to SUBMITTED and routes to appropriate manager.
  - Required: timecardId, organizationId
  - Optional: None

═══════════════════════════════════════════════════════════════════════════════
WORKFLOW TOOLS (26 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **assign_workflow_step**
  - Assign a user to a workflow step, or unassign if unassign is true. Validates user access and updates step assignment.
  - Required: stepId, userId, organizationId
  - Optional: teamMemberId, unassign

- **assign_workflow_to_session**
  - Assign a workflow template or diagram to a session, creating a workflow instance. This links the workflow to the session and creates workflow steps.
  - Required: sessionId, workflowId, organizationId
  - Optional: workflowType (template| diagram)

- **check_step_dependencies**
  - Check if all dependencies for a workflow step are met. Returns whether the step can be started based on dependency completion.
  - Required: stepId, organizationId
  - Optional: None

- **complete_workflow_step**
  - Complete a workflow step, changing its status to COMPLETED. Records completion time, updates workflow progress, and releases dependent steps.
  - Required: stepId, organizationId
  - Optional: notes, userId, deliverables

- **create_workflow**
  - Validate and prepare a new workflow for creation. This performs structural validation and returns the sanitized workflow data.
  - Required: id, type (task| approval| start| end| decision| agent), position, x, y
  - Optional: None

- **create_workflow_review**
  - Create a review for a workflow step. Reviews are required before steps can be completed if the step requires review.
  - Required: stepId, organizationId
  - Optional: reviewerId, reviewType (approval| feedback| qc), description

- **execute_workflow**
  - Execute a workflow instance. Starts the workflow execution and optionally auto-starts steps that have met their dependencies.
  - Required: workflowInstanceId, organizationId
  - Optional: autoStart

- **get_pending_reviews**
  - Get all pending reviews awaiting action. Returns reviews that are PENDING or IN_REVIEW status.
  - Required: organizationId
  - Optional: reviewerId, sessionId, limit

- **get_pending_workflow_steps**
  - Get workflow steps that are pending action (PENDING, IN_PROGRESS, or BLOCKED status). Useful for finding steps that need attention.
  - Required: organizationId
  - Optional: userId, sessionId, limit

- **get_user_workflow_tasks**
  - Get all workflow tasks assigned to a user. Returns workflow steps assigned to the user with their status, session info, and due dates.
  - Required: userId, organizationId
  - Optional: status (PENDING| IN_PROGRESS| COMPLETED| BLOCKED| PAUSED), sessionId, limit

- **get_workflow_analytics**
  - Get analytics and metrics for workflows. Returns completion rates, average step durations, bottleneck identification, and performance statistics.
  - Required: organizationId
  - Optional: workflowInstanceId, sessionId, dateFrom, dateTo

- **get_workflow_instance**
  - Get workflow instance for a session. Returns the active workflow instance with all its details, steps, and current status.
  - Required: sessionId, organizationId
  - Optional: workflowInstanceId

- **get_workflow_progress**
  - Get progress information for a workflow instance. Returns completion percentage, step counts, and status breakdown.
  - Required: workflowInstanceId, organizationId
  - Optional: None

- **get_workflow_reviews**
  - Get all reviews for a workflow step. Returns review details including status, decision, and feedback.
  - Required: stepId, organizationId
  - Optional: status (PENDING| IN_REVIEW| APPROVED| REJECTED| CHANGES_NEEDED), limit

- **get_workflow_step**
  - Get detailed information about a specific workflow step, including status, assignments, dependencies, and progress.
  - Required: stepId, organizationId
  - Optional: None

- **get_workflow_step_dependencies**
  - Get dependencies for a workflow step. Returns list of steps this step depends on, their status, and whether they are blocking this step.
  - Required: stepId, organizationId
  - Optional: includeStatus

- **list_session_workflows**
  - List all workflow instances for a session. Returns workflow instances with their status, progress, and step counts.
  - Required: sessionId, organizationId
  - Optional: status (ACTIVE| IN_PROGRESS| COMPLETED| DRAFT| PAUSED), limit

- **list_workflow_steps**
  - List all workflow steps for a workflow instance. Returns steps with their status, assignments, and dependencies.
  - Required: workflowInstanceId, organizationId
  - Optional: status (PENDING| IN_PROGRESS| COMPLETED| BLOCKED| PAUSED| SKIPPED), assignedUserId, limit

- **list_workflow_templates**
  - List available workflow templates. Useful for finding existing templates before creating a new workflow from scratch.
  - Required: organizationId
  - Optional: targetPhase (PRE_PRODUCTION| PRODUCTION| POST_PRODUCTION| DELIVERY), limit

- **pause_workflow_step**
  - Pause a workflow step that is currently in progress. Changes status to PAUSED and records pause time.
  - Required: stepId, organizationId
  - Optional: reason

- **resume_workflow_step**
  - Resume a paused workflow step. Changes status from PAUSED back to IN_PROGRESS.
  - Required: stepId, organizationId
  - Optional: notes

- **skip_workflow_step**
  - Skip a workflow step. Changes status to SKIPPED. Only works for optional steps or steps that can be skipped.
  - Required: stepId, organizationId
  - Optional: reason

- **start_workflow_step**
  - Start a workflow step, changing its status to IN_PROGRESS. Records the start time and updates the workflow instance progress.
  - Required: stepId, organizationId
  - Optional: notes, userId

- **submit_workflow_review**
  - Submit a workflow review with a decision (approve, reject, or changes_needed). Updates review status and may unblock workflow step completion.
  - Required: reviewId, decision (approve| reject| changes_needed), organizationId
  - Optional: feedback, reviewerId

- **update_workflow_step_progress**
  - Update the progress percentage of a workflow step. Useful for tracking partial completion of long-running tasks.
  - Required: stepId, progress, organizationId
  - Optional: notes

- **update_workflow_step_status**
  - Update the status of a workflow step. Can change status to any valid state (PENDING, IN_PROGRESS, COMPLETED, BLOCKED, PAUSED, SKIPPED).
  - Required: stepId, status (PENDING| IN_PROGRESS| COMPLETED| BLOCKED| PAUSED| SKIPPED), organizationId
  - Optional: notes, progress

═══════════════════════════════════════════════════════════════════════════════
REPORTS & ANALYTICS TOOLS (3 Tools)
═══════════════════════════════════════════════════════════════════════════════

- **generate_report**
  - Generate a comprehensive PDF report for a project with AI insights and data visualizations. Use this when the user asks to create, generate, or download a report.
  - Required: organizationId, projectId, reportType (executive| detailed| financial| production)
  - Optional: dateRange, includeInsights, includeCharts

- **analyze_project**
  - Analyze project data and generate AI insights without creating a PDF file. Use this when the user asks questions about project status, risks, budget health, or needs a quick summary.
  - Required: organizationId, projectId
  - Optional: analysisType (executive| detailed| financial| production), focusAreas

- **export_report**
  - Export a generated report to an external destination (e.g., Email, Google Drive, Slack). Use this after generating a report if the user wants to share specific files.
  - Required: organizationId, reportUrl, destination (email| drive| slack)
  - Optional: recipient
`;
