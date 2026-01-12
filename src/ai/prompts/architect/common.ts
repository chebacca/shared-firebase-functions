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
- Tool: 'universal_create'
- Use for: Creating any document in a recognized collection (tasks, visitor_logs, etc.)
- Required: collectionName, organizationId, data (JSON object).

UNIVERSAL DATA UPDATES:
- Tool: 'universal_update'
- Use for: Updating specific fields in any recognized document.
- Required: collectionName, id, organizationId, data (JSON object).

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
