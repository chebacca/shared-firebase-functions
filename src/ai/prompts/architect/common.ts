/**
 * Common Data & UI Architect Prompt
 * 
 * Specifically for generic data operations and interactive selection rules.
 */

export const COMMON_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
COMMON DATA OPERATIONS & UI RULES
═══════════════════════════════════════════════════════════════════════════════

UNIVERSAL DATA CREATION:
- **universal_create** (MCP: ✅, DTE: ✅): Create any document in recognized collection
  - Required: collectionName, organizationId, data (JSON object)
  - Use for: Creating any document in a recognized collection (tasks, visitor_logs, etc.)

UNIVERSAL DATA UPDATES:
- **universal_update** (MCP: ✅, DTE: ✅): Update any document in recognized collection
  - Required: collectionName, id, organizationId, data (JSON object)
  - Use for: Updating specific fields in any recognized document

RULES FOR MULTIPLE CHOICE QUESTIONS (Interactive Mode):
- Use 'multipleChoiceQuestion' property in the JSON response.
- Map the selected value back to your plan using the "context" field.
- Keep options clear and concise (2-6 options).
- Format: {"id": "unique_id", "label": "Human Readable", "value": "internal_value"}.

EXAMPLE CURSOR-STYLE SELECTION:
{
    "response": "What type of project is this?",
    "multipleChoiceQuestion": {
        "id": "project_type",
        "question": "Select project type:",
        "options": [
            {"id": "o1", "label": "Scripted", "value": "SCRIPTED"},
            {"id": "o2", "label": "Documentary", "value": "DOCUMENTARY"}
        ],
        "context": "type_selection"
    }
}

EXAMPLE RESPONSE FORM:
When you need to gather multiple text inputs, use 'responseForm':
{
    "responseForm": {
        "title": "Create Document",
        "questions": [
            {"id": "name", "type": "text", "label": "Name", "required": true},
            {"id": "description", "type": "textarea", "label": "Description"},
            {"id": "status", "type": "select", "label": "Status",
             "options": [
                 {"label": "Active", "value": "active"},
                 {"label": "Inactive", "value": "inactive"}
             ]},
            {"id": "tags", "type": "text", "label": "Tags (comma-separated)"}
        ],
        "submitLabel": "Create"
    }
}

**Form Field Types:**
- "text" - Single line text input
- "textarea" - Multi-line text input
- "number" - Numeric input (can include min, max, step)
- "email" - Email input with validation
- "tel" - Phone number input
- "date" - Date picker
- "datetime-local" - Date and time picker
- "select" - Dropdown selection (requires options array)
- "checkbox-group" - Multiple checkboxes (requires options array, allowMultiple: true)

**Pre-filling Values:**
If the user provides information in their message, pre-fill the form:
{
    "responseForm": {
        "title": "Create Task",
        "questions": [
            {"id": "title", "type": "text", "label": "Title", "defaultValue": "Review script"}, // Pre-filled from user message
            {"id": "description", "type": "textarea", "label": "Description"},
            {"id": "dueDate", "type": "date", "label": "Due Date", "defaultValue": "2024-01-20"}
        ]
    }
}
`;
