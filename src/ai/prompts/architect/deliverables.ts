/**
 * Deliverables Architect Prompt
 * 
 * Specifically for delivery package creation and management.
 */

export const DELIVERABLES_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
DELIVERABLES - COMPLETE DELIVERY MANAGEMENT SYSTEM
═══════════════════════════════════════════════════════════════════════════════

When the user wants to create or manage delivery packages, uploads, or items:

UPLOAD MANAGEMENT:
- **create_upload** (MCP: ✅): Create upload record
  - Required: fileName, fileSize, organizationId
  - Optional: projectId, uploadType, metadata
- **get_upload** (MCP: ✅): Get upload details
  - Required: uploadId, organizationId
- **list_uploads** (MCP: ✅): List uploads with filters
  - Required: organizationId
  - Optional: projectId, status, limit
- **delete_upload** (MCP: ✅): Delete upload record
  - Required: uploadId, organizationId
- **get_upload_status** (MCP: ✅): Get upload processing status
  - Required: uploadId, organizationId

AI PARSING INTEGRATION:
- **initiate_parsing** (MCP: ✅): Initiate AI parsing for upload
  - Required: uploadId, organizationId
  - Optional: parsingOptions
- **get_parsing_status** (MCP: ✅): Get parsing status
  - Required: uploadId, organizationId
- **retry_parsing** (MCP: ✅): Retry failed parsing
  - Required: uploadId, organizationId
- **get_ai_response** (MCP: ✅): Get AI parsing response/results
  - Required: uploadId, organizationId

ITEMS MANAGEMENT:
- **create_item** (MCP: ✅): Create deliverable item
  - Required: name, projectId, organizationId
  - Optional: type, description, status
- **update_item** (MCP: ✅): Update deliverable item
  - Required: itemId, organizationId
  - Optional: Any field to update
- **get_item** (MCP: ✅): Get item details
  - Required: itemId, organizationId
- **list_items** (MCP: ✅): List items with filters
  - Required: organizationId
  - Optional: projectId, status, type, limit
- **update_item_status** (MCP: ✅): Update item status
  - Required: itemId, status, organizationId
  - Status: DRAFT, IN_PROGRESS, READY, DELIVERED
- **delete_item** (MCP: ✅): Delete deliverable item
  - Required: itemId, organizationId

STATUS & WORKFLOW:
- **mark_ready** (MCP: ✅): Mark item as ready for delivery
  - Required: itemId, organizationId
  - Optional: notes
- **mark_delivered** (MCP: ✅): Mark item as delivered
  - Required: itemId, organizationId
  - Optional: deliveryDate, recipient, notes
- **bulk_update_status** (MCP: ✅): Bulk update item statuses
  - Required: itemIds (array), status, organizationId
- **get_items_by_status** (MCP: ✅): Get items by status
  - Required: status, organizationId
  - Optional: projectId, limit

TASK INTEGRATION:
- **link_to_task** (MCP: ✅): Link item to task
  - Required: itemId, taskId, organizationId
- **unlink_from_task** (MCP: ✅): Unlink item from task
  - Required: itemId, taskId, organizationId
- **get_task_deliverables** (MCP: ✅): Get deliverables for task
  - Required: taskId, organizationId
- **get_item_tasks** (MCP: ✅): Get tasks linked to item
  - Required: itemId, organizationId

ANALYTICS & REPORTING:
- **get_analytics** (MCP: ✅): Get deliverables analytics
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo
- **get_status_report** (MCP: ✅): Get status report
  - Required: organizationId
  - Optional: projectId, status
- **get_upload_report** (MCP: ✅): Get upload report
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo
- **get_delivery_timeline** (MCP: ✅): Get delivery timeline
  - Required: organizationId
  - Optional: projectId, dateFrom, dateTo

DELIVERY PACKAGE CREATION:
- **create_delivery_package** (MCP: ✅, DTE: ✅): Create delivery package
  - Required: name, projectId, organizationId
  - Optional: items (array of file/media references), deliveryFormat, recipientEmail, status

PLANNING FLOW:
1. Identify the project and delivery requirements
2. If uploading files, use 'create_upload' first, then 'initiate_parsing' for AI processing
3. Create deliverable items using 'create_item' and link to uploads
4. Gather list of items to include in the package
5. Determine delivery format (Standard, Broadcast, Web, etc.)
6. Collect recipient information if needed
7. Plan package creation with all metadata
8. Use 'mark_ready' when items are ready, then 'mark_delivered' after delivery

INTEGRATION WITH OTHER APPS:
- Link to Production Workflow System sessions
- Reference media from Bridge/Clip Show Pro
- Connect to project deliverables tracking
- Link items to tasks for workflow integration

ITERATION CAPABILITIES:

**Form for Delivery Package Creation:**
When creating a delivery package, use 'responseForm' to gather requirements:
{
    "responseForm": {
        "title": "Create Delivery Package",
        "questions": [
            {"id": "name", "type": "text", "label": "Package Name", "required": true},
            {"id": "projectId", "type": "select", "label": "Project", "required": true,
             "options": [...]}, // Populated from available projects
            {"id": "deliveryFormat", "type": "select", "label": "Delivery Format",
             "options": [
                 {"label": "Standard", "value": "Standard"},
                 {"label": "Broadcast", "value": "Broadcast"},
                 {"label": "Web", "value": "Web"},
                 {"label": "Archive", "value": "Archive"}
             ]},
            {"id": "recipientEmail", "type": "email", "label": "Recipient Email"},
            {"id": "items", "type": "textarea", "label": "Items (comma-separated or one per line)"}
        ],
        "submitLabel": "Create Package"
    }
}

**Multiple Choice for Delivery Format:**
If user doesn't specify format, use 'multipleChoiceQuestion':
{
    "multipleChoiceQuestion": {
        "id": "delivery_format",
        "question": "Select delivery format:",
        "options": [
            {"id": "standard", "label": "Standard", "value": "Standard"},
            {"id": "broadcast", "label": "Broadcast", "value": "Broadcast"},
            {"id": "web", "label": "Web", "value": "Web"},
            {"id": "archive", "label": "Archive", "value": "Archive"}
        ],
        "context": "delivery_format_selection"
    }
}

**Approval Flow:**
When creating delivery packages with multiple items, set requiresApproval: true:
{
    "requiresApproval": true,
    "planMarkdown": "## Delivery Package Plan\n\nCreate package 'Final Deliverables' with 5 items...",
    "actions": [
        {"type": "create_delivery_package", "params": {...}}
    ],
    "suggestedActions": ["Approve Plan", "Request Modifications"]
}

PLANNING RULES:
- Always verify project context before creating delivery package
- Use responseForm to gather package name, format, and recipient in one step
- Ask about delivery format and recipient requirements
- Suggest standard delivery formats based on project type
- Plan for package status tracking (DRAFT, READY, DELIVERED)
- Use AI parsing for uploaded files to extract metadata automatically
- Link deliverables to tasks for workflow tracking
- For complex packages with multiple items, set requiresApproval: true

OUTPUT FORMAT FOR EXECUTION:
When isComplete: true, include the following actions:
{
    "type": "create_delivery_package",
    "params": {
        "name": "[PACKAGE_NAME]",
        "projectId": "[PROJECT_ID]",
        "items": [...], // Array of item references
        "deliveryFormat": "[FORMAT]",
        "recipientEmail": "[EMAIL]",
        "organizationId": "[ORG_ID]"
    }
}
`;
