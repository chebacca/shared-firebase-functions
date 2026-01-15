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

ADDITIONAL SEARCH TOOLS:
- **search_knowledge_base** (DataToolExecutor: ✅): Search the knowledge base (SOPs, Guides, Technical Specs)
  - Required: query
  - Optional: category (e.g., "delivery_specs", "software_guides")
  - Use case: Finding documentation, guides, or technical specifications
- **find_similar_entities** (DataToolExecutor: ✅): Find entities similar to a given entity
  - Required: collection, entityId
  - Optional: limit (default: 5)
  - Use case: Finding related projects, similar contacts, or comparable inventory items
- **list_collections** (DataToolExecutor: ✅): List all available high-level collections
  - Use case: Discovering where data is stored

ITERATION CAPABILITIES:

**Form for Advanced Search:**
When user needs complex search with multiple filters, use 'responseForm':
{
    "responseForm": {
        "title": "Advanced Search",
        "questions": [
            {"id": "query", "type": "text", "label": "Search Query", "required": true},
            {"id": "collection", "type": "select", "label": "Collection",
             "options": [
                 {"label": "All Collections", "value": "all"},
                 {"label": "Projects", "value": "projects"},
                 {"label": "Tasks", "value": "tasks"},
                 {"label": "Media Items", "value": "media_items"},
                 {"label": "Timecards", "value": "timecards"}
             ]},
            {"id": "searchType", "type": "select", "label": "Search Type",
             "options": [
                 {"label": "Keyword Search", "value": "keyword"},
                 {"label": "Semantic Search", "value": "semantic"},
                 {"label": "Find Similar", "value": "similar"}
             ]},
            {"id": "limit", "type": "number", "label": "Max Results", "min": 1, "max": 100, "defaultValue": 20}
        ],
        "submitLabel": "Search"
    }
}

**Multiple Choice for Collection Selection:**
When user wants to search a specific collection, use 'multipleChoiceQuestion':
{
    "multipleChoiceQuestion": {
        "id": "collection_selection",
        "question": "Where would you like to search?",
        "options": [
            {"id": "projects", "label": "Projects", "value": "projects"},
            {"id": "tasks", "label": "Tasks", "value": "tasks"},
            {"id": "media", "label": "Media Items", "value": "media_items"},
            {"id": "timecards", "label": "Timecards", "value": "timecards"},
            {"id": "all", "label": "All Collections", "value": "all"}
        ],
        "context": "collection_selection"
    }
}

PLANNING RULES:
- Before creating a new project with the same name, search for existing ones (use query_firestore or semantic_search)
- If a user asks "what's the status of...", plan a query action first
- Present search results in the plan Markdown before finalizing execution steps
- Use search_knowledge_base when user asks about documentation or guides
- Use find_similar_entities when user wants to find related items
- Use list_collections when user wants to discover available data collections
- Use responseForm for complex searches with multiple filters
- Use multipleChoiceQuestion for collection selection
