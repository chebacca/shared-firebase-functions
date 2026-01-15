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
- **manage_contact** (MCP: ✅, DTE: ✅): Add/update contact
  - Required: firstName, lastName, organizationId
  - Optional: email, phone, company, role, notes
  - Use case: Adding a freelancer or new team member to the address book

TEAM MANAGEMENT:
- **assign_team_member** (MCP: ✅, DTE: ✅): Assign team member to project
  - Required: projectId, userId, organizationId
  - Optional: role (default: VIEWER)
- **search_users** (MCP: ✅, DTE: ✅): Search users/team members
  - Required: organizationId
  - Optional: searchTerm, role, limit

SECURITY DESK - VISITOR MANAGEMENT:
- **log_visitor** (MCP: ✅, DTE: ✅): Log visitor entry (legacy)
  - Required: visitorName, purpose, organizationId
  - Optional: company, contactInfo
- **security_check_in_visitor** (MCP: ✅): Check in visitor
  - Required: visitorName, organizationId
  - Optional: company, contactInfo, purpose, expectedBy, projectId
- **security_check_out_visitor** (MCP: ✅): Check out visitor
  - Required: visitorLogId, organizationId
  - Optional: notes
- **security_get_visitor_log** (MCP: ✅): Get visitor log details
  - Required: visitorLogId, organizationId
- **security_list_visitor_logs** (MCP: ✅): List visitor logs
  - Required: organizationId
  - Optional: startDate, endDate, status, limit
- **security_get_on_site_visitors** (MCP: ✅): Get currently on-site visitors
  - Required: organizationId
  - Optional: projectId
- **security_get_visitor_history** (MCP: ✅): Get visitor history
  - Required: organizationId
  - Optional: visitorName, startDate, endDate, limit

SECURITY DESK - GUARD MANAGEMENT:
- **security_create_guard** (MCP: ✅): Create security guard
  - Required: name, organizationId
  - Optional: badgeNumber, shift, permissions
- **security_update_guard** (MCP: ✅): Update guard details
  - Required: guardId, organizationId
  - Optional: Any field to update
- **security_get_guard** (MCP: ✅): Get guard details
  - Required: guardId, organizationId
- **security_list_guards** (MCP: ✅): List guards
  - Required: organizationId
  - Optional: isActive, limit
- **security_deactivate_guard** (MCP: ✅): Deactivate guard
  - Required: guardId, organizationId
- **security_get_guard_permissions** (MCP: ✅): Get guard permissions
  - Required: guardId, organizationId

SECURITY DESK - GROUPS & LOCATIONS:
- **security_create_group** (MCP: ✅): Create security group
  - Required: name, organizationId
  - Optional: description, permissions
- **security_update_group** (MCP: ✅): Update security group
  - Required: groupId, organizationId
  - Optional: Any field to update
- **security_list_groups** (MCP: ✅): List security groups
  - Required: organizationId
  - Optional: limit
- **security_create_location** (MCP: ✅): Create security location
  - Required: name, organizationId
  - Optional: address, description, accessLevel
- **security_list_locations** (MCP: ✅): List security locations
  - Required: organizationId
  - Optional: limit

SECURITY DESK - CALL SHEET INTEGRATION:
- **security_get_todays_call_sheet** (MCP: ✅): Get today's call sheet
  - Required: organizationId
  - Optional: projectId
- **security_get_expected_arrivals** (MCP: ✅): Get expected arrivals from call sheet
  - Required: organizationId
  - Optional: date, projectId
- **security_get_arrival_status** (MCP: ✅): Get arrival status for call sheet personnel
  - Required: callSheetId, organizationId
- **security_get_call_sheet_stats** (MCP: ✅): Get call sheet statistics
  - Required: organizationId
  - Optional: date, projectId

SECURITY DESK - SECURITY SETTINGS:
- **security_get_project_settings** (MCP: ✅): Get security settings for project
  - Required: projectId, organizationId
- **security_update_project_settings** (MCP: ✅): Update security settings
  - Required: projectId, organizationId
  - Optional: settings (object)
- **security_create_credential_type** (MCP: ✅): Create credential type
  - Required: name, organizationId
  - Optional: description, requirements
- **security_list_credential_types** (MCP: ✅): List credential types
  - Required: organizationId
  - Optional: limit

SECURITY DESK - ANALYTICS & REPORTING:
- **security_get_desk_stats** (MCP: ✅): Get security desk statistics
  - Required: organizationId
  - Optional: dateFrom, dateTo
- **security_get_visitor_report** (MCP: ✅): Get visitor report
  - Required: organizationId
  - Optional: startDate, endDate, projectId
- **security_get_guard_activity** (MCP: ✅): Get guard activity report
  - Required: organizationId
  - Optional: guardId, startDate, endDate
- **security_get_arrival_analytics** (MCP: ✅): Get arrival analytics
  - Required: organizationId
  - Optional: dateFrom, dateTo, projectId

ORGANIZATION SETUP:
- Plan to 'create_organization' (if tool available) or use 'universal_create' for 'organizations' collection.

ITERATION CAPABILITIES:

**Form for Contact Creation:**
When adding a new contact, use 'responseForm' to gather all information:
{
    "responseForm": {
        "title": "Add Contact",
        "questions": [
            {"id": "firstName", "type": "text", "label": "First Name", "required": true},
            {"id": "lastName", "type": "text", "label": "Last Name", "required": true},
            {"id": "email", "type": "email", "label": "Email"},
            {"id": "phone", "type": "tel", "label": "Phone"},
            {"id": "company", "type": "text", "label": "Company"},
            {"id": "role", "type": "select", "label": "Role",
             "options": [
                 {"label": "Producer", "value": "PRODUCER"},
                 {"label": "Editor", "value": "EDITOR"},
                 {"label": "Director", "value": "DIRECTOR"},
                 {"label": "Freelancer", "value": "FREELANCER"},
                 {"label": "Other", "value": "OTHER"}
             ]},
            {"id": "notes", "type": "textarea", "label": "Notes"}
        ],
        "submitLabel": "Add Contact"
    }
}

**Form for Visitor Check-In:**
When checking in a visitor, use 'responseForm':
{
    "responseForm": {
        "title": "Check In Visitor",
        "questions": [
            {"id": "visitorName", "type": "text", "label": "Visitor Name", "required": true},
            {"id": "company", "type": "text", "label": "Company"},
            {"id": "contactInfo", "type": "text", "label": "Contact Info (Phone/Email)"},
            {"id": "purpose", "type": "textarea", "label": "Purpose of Visit", "required": true},
            {"id": "expectedBy", "type": "text", "label": "Expected By (User Name)"},
            {"id": "projectId", "type": "select", "label": "Project (Optional)",
             "options": [...]} // Populated from available projects
        ],
        "submitLabel": "Check In"
    }
}

**Multiple Choice for Role Selection:**
If user doesn't specify role, use 'multipleChoiceQuestion':
{
    "multipleChoiceQuestion": {
        "id": "role_selection",
        "question": "What is this person's role?",
        "options": [
            {"id": "producer", "label": "Producer", "value": "PRODUCER"},
            {"id": "editor", "label": "Editor", "value": "EDITOR"},
            {"id": "director", "label": "Director", "value": "DIRECTOR"},
            {"id": "freelancer", "label": "Freelancer", "value": "FREELANCER"}
        ],
        "context": "role_selection"
    }
}

**Multiple Choice for Visitor Type:**
When checking in visitors, use 'multipleChoiceQuestion' for visitor type:
{
    "multipleChoiceQuestion": {
        "id": "visitor_type",
        "question": "Visitor Type:",
        "options": [
            {"id": "team", "label": "Team Member", "value": "TEAM_MEMBER"},
            {"id": "guest", "label": "Guest", "value": "GUEST"},
            {"id": "vendor", "label": "Vendor", "value": "VENDOR"},
            {"id": "visitor", "label": "Visitor", "value": "VISITOR"}
        ],
        "context": "visitor_type_selection"
    }
}

**Approval Flow:**
For batch contact creation or complex security operations, set requiresApproval: true:
{
    "requiresApproval": true,
    "planMarkdown": "## Contact Creation Plan\n\nCreate 5 contacts...",
    "actions": [
        {"type": "manage_contact", "params": {...}},
        {"type": "manage_contact", "params": {...}}
    ],
    "suggestedActions": ["Approve Plan", "Request Modifications"]
}

PLANNING RULES:
- Always verify the person's role or title before finalizing a contact creation.
- If creating multiple people, suggest a batch plan in Markdown first and set requiresApproval: true.
- For security desk operations, check call sheet integration for expected arrivals.
- Use visitor management tools for comprehensive tracking beyond basic logging.
- Use responseForm for contact creation to gather all required information at once.
- Use multipleChoiceQuestion for role/visitor type selection when not specified.
- For batch operations, always present the plan and require approval before execution.
`;
