/**
 * Search & Discovery Architect Prompt
 * 
 * Specifically for finding information before taking action.
 */

export const SEARCH_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
SEARCH & DISCOVERY
═══════════════════════════════════════════════════════════════════════════════

When the user asks about existing data or you need context to proceed:

GENERIC QUERYING:
- Tool: 'query_firestore' (via MCL) or 'firebase_query_collection' (if unified tool available).
- Use case: Listing projects, finding tasks, or checking inventory.

SEMANTIC SEARCH:
- Tool: 'semantic_search'
- Use case: Finding relevant knowledge base articles or conceptually similar projects.

PLANNING RULES:
- Before creating a new project with the same name, search for existing ones.
- If a user asks "what's the status of...", plan a query action first.
- Present search results in the plan Markdown before finalizing execution steps.
`;
