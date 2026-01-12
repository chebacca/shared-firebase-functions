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
- **query_firestore** (MCP: ✅, DTE: ✅): Query any Firestore collection with filters
  - Required: collectionName, organizationId
  - Optional: filters (array), orderBy, limit, startAfter
  - Use case: Listing projects, finding tasks, or checking inventory

SEMANTIC SEARCH:
- **semantic_search** (MCP: ✅, DTE: ✅): Vector-based semantic search across knowledge base
  - Required: query, organizationId
  - Optional: limit, collection
  - Use case: Finding relevant knowledge base articles or conceptually similar projects

USER SEARCH:
- **search_users** (MCP: ✅, DTE: ✅): Search team members/users by name, email, or role
  - Required: organizationId
  - Optional: searchTerm, role, limit
  - Use case: Finding team members, contacts, or users

PLANNING RULES:
- Before creating a new project with the same name, search for existing ones.
- If a user asks "what's the status of...", plan a query action first.
- Present search results in the plan Markdown before finalizing execution steps.
`;
