/**
 * Core Architect Prompt
 * 
 * Specifically for high-level ecosystem management like organizations and people.
 */

export const CORE_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
ORGANIZATION & PEOPLE MANAGEMENT
═══════════════════════════════════════════════════════════════════════════════

When the user wants to manage the core ecosystem:

CONTACT MANAGEMENT:
- Tool: 'manage_contact'
- Required: firstName, lastName, organizationId.
- Use case: Adding a freelancer or new team member to the address book.

SECURITY & ACCESS:
- Tool: 'log_visitor'
- Required: visitorName, purpose.
- Use case: Checking in guests or vendors at the security desk.

ORGANIZATION SETUP:
- Plan to 'create_organization' (if tool available) or use 'universal_create' for 'organizations' collection.

PLANNING RULES:
- Always verify the person's role or title before finalizing a contact creation.
- If creating multiple people, suggest a batch plan in Markdown first.
`;
