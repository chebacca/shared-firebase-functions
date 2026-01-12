import { ARCHITECT_BASE_PROMPT } from './architect/base';
import { SCRIPTING_PROMPT } from './architect/scripting';
import { WORKFLOW_PROMPT } from './architect/workflows';
import { PRODUCTION_PROMPT } from './architect/production';
import { CORE_PROMPT } from './architect/core';
import { COMMON_PROMPT } from './architect/common';
import { SEARCH_PROMPT } from './architect/search';
import { BRIDGE_PROMPT } from './architect/bridge';
import { DELIVERABLES_PROMPT } from './architect/deliverables';
import { LICENSING_PROMPT } from './architect/licensing';
import { TIMECARD_PROMPT } from './architect/timecard';
import { MOBILE_PROMPT } from './architect/mobile';
import { INTEGRATIONS_PROMPT } from './architect/integrations';
import { TOOL_REFERENCE } from './architect/toolReference';

/**
 * Architect / Planner Prompts Entry Point
 * 
 * Assembles the full system prompt from modular domain-specific prompts.
 * This provides the "Beast" MCP server support by aligning planning logic
 * with every available backend tool and creation process.
 * 
 * Covers all 12 apps in the Backbone ecosystem:
 * 1. Production Workflow System (workflows, production, core)
 * 2. Clip Show Pro (scripting)
 * 3. CNS (scripting)
 * 4. Cuesheet/Budget (production)
 * 5. Call Sheet (production)
 * 6. IWM (production - inventory)
 * 7. Address Book (core)
 * 8. Security Desk (core)
 * 9. Bridge (bridge)
 * 10. Deliverables (deliverables)
 * 11. Licensing Website (licensing)
 * 12. Timecard Management (timecard)
 * 13. Mobile Companion (mobile)
 */

export const ARCHITECT_SYSTEM_PROMPT = `
${ARCHITECT_BASE_PROMPT}

${SEARCH_PROMPT}

${SCRIPTING_PROMPT}

${WORKFLOW_PROMPT}

${PRODUCTION_PROMPT}

${CORE_PROMPT}

${COMMON_PROMPT}

${BRIDGE_PROMPT}

${DELIVERABLES_PROMPT}

${LICENSING_PROMPT}

${TIMECARD_PROMPT}

${MOBILE_PROMPT}

${INTEGRATIONS_PROMPT}

${TOOL_REFERENCE}

**FINAL ARCHITECT RULES:**
1. **Context First**: Always check provided globalContext (shows, projects, current user) before asking.
2. **Atomic Actions**: Prefer standard tools (e.g., create_script_package) over multiple manual steps.
3. **Conversational Guardrails**: If the user asks for something outside your domain, politely explain your planning role.
4. **Validation**: Double-check that all required IDs (organizationId, projectId) are included in action parameters.
5. **Cross-App Awareness**: Understand relationships between apps and suggest multi-app workflows when appropriate.
6. **Tool Availability**: Only reference tools that exist in MCP server or DataToolExecutor (see TOOL_REFERENCE section above).
7. **Tool Naming**: Always use exact snake_case tool names as listed in TOOL_REFERENCE section.
8. **Tool Parameters**: Include all required parameters and relevant optional parameters in action plans.
`;
