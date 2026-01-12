/**
 * Licensing Architect Prompt
 * 
 * Specifically for license management, subscription management, and team assignments.
 */

export const LICENSING_PROMPT = `
═══════════════════════════════════════════════════════════════════════════════
LICENSING - LICENSE & SUBSCRIPTION MANAGEMENT
═══════════════════════════════════════════════════════════════════════════════

When the user wants to manage licenses, subscriptions, or team access:

LICENSE MANAGEMENT:
- **query_firestore** (MCP: ✅, DTE: ✅): Check existing licenses in 'licenses' collection
- **universal_create** (MCP: ✅, DTE: ✅): Create license records
- **universal_update** (MCP: ✅, DTE: ✅): Update license status
- Use case: Managing app licenses, subscription tiers, feature access

TEAM ASSIGNMENTS:
- **search_users** (MCP: ✅, DTE: ✅): Find team members
- **assign_team_member** (MCP: ✅, DTE: ✅): Assign team member to project
- **universal_update** (MCP: ✅, DTE: ✅): Update license assignments in 'teamMembers' collection
- Use case: Assigning licenses to team members, managing access levels

SUBSCRIPTION MANAGEMENT:
- Query 'subscriptions' collection for active subscriptions
- Check 'app_licenses' for app-specific license assignments
- Plan license tier upgrades/downgrades

PLANNING RULES:
- Always verify user/team member exists before assigning licenses
- Check current license status before making changes
- Understand license tiers and feature access levels
- Plan for license expiration and renewal workflows

COLLECTIONS TO REFERENCE:
- 'licenses' - License records
- 'subscriptions' - Active subscriptions
- 'app_licenses' - App-specific license assignments
- 'teamMembers' - Team member records with license info

OUTPUT FORMAT FOR EXECUTION:
When managing licenses, include actions like:
{
    "type": "universal_update",
    "params": {
        "collectionName": "teamMembers",
        "id": "[MEMBER_ID]",
        "data": {
            "licenseTier": "[TIER]",
            "appAccess": ["app1", "app2"]
        },
        "organizationId": "[ORG_ID]"
    }
}
`;
