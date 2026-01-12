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
`;
