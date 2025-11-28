/**
 * App Knowledge Base
 * 
 * Comprehensive knowledge about Clip Show Pro workflow, terminology, and processes
 * Used to help AI understand the application context and provide accurate answers
 */

export const APP_KNOWLEDGE = `
# Clip Show Pro - Production Management System

## Overview
Clip Show Pro is a television production management system that manages the complete workflow from pitch to final assembly. It tracks pitches, stories, scripts, edits, and shows.

## Core Concepts

### 1. PITCHES (Pitching & Clearance Page)
A "pitch" is a video clip idea that goes through approval and clearance before becoming a story.

**Pitch Statuses & Workflow:**
- **Pitched**: Initial submission - clip has been pitched and awaiting producer review
- **Pursue Clearance**: Producer approved, clearance process started
- **Ready to License**: Ready for licensing specialist to acquire rights
- **License Cleared**: License acquired and cleared for production
- **Ready for Script**: Ready to be assigned to writer for script creation (automatically set when license cleared)
- **Script Complete**: Script has been completed
- **V1 Cut**: First version edit complete
- **Ready for Build**: Ready for final assembly
- **Killed**: Pitch was rejected or cancelled
- **Do Not Pursue Clearance**: Producer decided not to pursue clearance

**Key Terms:**
- **Clearance**: Process of obtaining legal rights/license for video content
- **Producer**: Person who approves pitches and decides what to pursue
- **Licensing Specialist**: Person who acquires licenses for cleared content

### 2. STORIES (Stories & Scripts Page)
A "story" is created from a cleared pitch and represents the actual production piece.

**Story Statuses & Workflow:**
- **Initial**: Story created and assigned
- **Script Writing**: Writer is creating the script
- **Script Complete**: Script completed and ready for review
- **Needs String**: Script needs string (on-screen text)
- **String In Progress**: String being created
- **String Complete**: String finished
- **A Roll**: Initial edit assembly (first edit phase)
- **A Roll Notes**: Notes added to A Roll
- **A Roll Notes Complete**: Notes addressed
- **v1 Edit, v2 Edit, v3 Edit, v4 Edit, v5 Edit**: Version edits (iterative refinement)
- **v1 Notes, v2 Notes, etc.**: Notes for each version
- **v1 Notes Complete, v2 Notes Complete, etc.**: Notes addressed
- **Ready for Build**: Ready for final assembly
- **RC**: Release candidate (final review version)
- **RC Notes**: Feedback on release candidate
- **RC Notes Complete**: Feedback addressed
- **Assembled**: Story assembly complete (final state)
- **Needs Revisit**: Needs to be reworked

**Transcoding Statuses:**
- **Needs Transcode**: Video needs to be transcoded
- **Transcoded**: Transcoding complete
- **Ready for Ingest**: Ready to be ingested
- **Ingested**: Video ingested into system
- **Edit Ready**: Ready for editing (requires Ingested or Edit Ready status before edit phase)

**Key Terms:**
- **Script**: Written content for the story
- **String**: On-screen text/graphics
- **A Roll**: Primary footage/initial edit
- **Version Edit**: Iterative edit refinement (v1, v2, etc.)
- **RC**: Release Candidate - final version before assembly

### 3. EDIT (Edit Page)
The edit phase handles the editing workflow for stories.

**Edit Workflow Stages:**
1. **A Roll**: Initial edit assembly
2. **Version Edits**: v1 through v5 (iterative refinement)
3. **Build Phase**: Ready for Build → RC → Assembled

**Important Rules:**
- Stories must have transcodingStatus "Ingested" or "Edit Ready" before entering edit phase
- Each version edit follows pattern: Edit → Notes → Notes Complete
- RC (Release Candidate) is the final review before assembly

### 4. SHOWS MANAGEMENT
Manages shows and seasons that contain multiple stories.

## Workflow Patterns

### Typical Pitch → Story → Edit Flow:
1. Pitch submitted → "Pitched"
2. Producer approves → "Pursue Clearance"
3. Clearance coordinator works → "Ready to License"
4. Licensing specialist acquires license → "License Cleared"
5. Automatically becomes "Ready for Script" → Story created
6. Writer creates script → "Script Complete"
7. Transcoding (if needed) → "Ingested" or "Edit Ready"
8. Editor creates A Roll → "A Roll"
9. Version edits → v1, v2, v3, v4, v5
10. Ready for Build → RC → Assembled

### Status Transition Rules:
- Pitches can move: Pitched → Pursue Clearance → Ready to License → License Cleared → Ready for Script
- Stories can move: Initial → Script Writing → Script Complete → A Roll → v1-v5 → Ready for Build → RC → Assembled
- Edit statuses follow: Edit → Notes → Notes Complete pattern

## User Roles
- **Producer**: Approves pitches, decides what to pursue
- **Clearance Coordinator**: Manages clearance process
- **Licensing Specialist**: Acquires licenses
- **Writer**: Creates scripts
- **Editor**: Handles editing workflow
- **Admin**: Full system access

## Common Questions & Answers

**Q: What does "Ready for Script" mean?**
A: The pitch has been cleared and licensed. A story should be created and assigned to a writer.

**Q: When can a story enter edit phase?**
A: Story must have transcodingStatus "Ingested" or "Edit Ready" AND status "Script Complete" or later.

**Q: What's the difference between A Roll and v1 Edit?**
A: A Roll is the initial edit assembly. v1 Edit is the first version refinement after notes are addressed.

**Q: What does RC mean?**
A: Release Candidate - the final version before assembly. It goes RC → RC Notes → RC Notes Complete → Assembled.

**Q: How do I know if a pitch is ready to become a story?**
A: When pitch status is "Ready for Script", create a story from it.

**Q: What statuses are in the edit phase?**
A: A Roll, A Roll Notes, A Roll Notes Complete, v1-v5 Edit/Notes/Notes Complete, Ready for Build, RC, RC Notes, RC Notes Complete, Assembled.

## Automation & Triggers
- License signing automatically updates pitch to "Ready for Script"
- Status changes trigger automation rules
- Notifications are sent for status changes and milestones

## Data Relationships
- **Pitch → Story**: One pitch can become one story (when "Ready for Script")
- **Story → Show**: Stories belong to shows/seasons
- **Story → Editor**: Stories are assigned to editors
- **Story → Writer**: Stories are assigned to writers

## Common Actions
- **Update Status**: Change workflow status (follows valid transitions)
- **Assign Producer**: Assign a producer to a pitch
- **Assign Writer**: Assign a writer to a story
- **Assign Editor**: Assign an editor to a story
- **Add Notes**: Add workflow notes
- **Create Story**: Create story from cleared pitch
- **Link Story**: Link story to pitch

### 5. PROJECTS & BUDGET MANAGEMENT
Projects organize production work and track budgets across shows, seasons, and episodes.

**Budget Structure:**
- **Budget Values**: Production and post-production budget allocations per project
  - \`productionBudget\`: Budget allocated for production work
  - \`postProductionBudget\`: Budget allocated for post-production work
  - \`lastUpdated\`: When budget values were last updated

- **Budget Groups**: Organized collections of clips with budget assignments
  - Types: \`production\`, \`post-production\`, \`licensing-house\`, \`unassigned\`
  - Contains: Clips, total cost, total duration, clip count
  - Tracks: Template matching, license house assignments, cost per second

- **Budget Calculations**: Comprehensive budget metrics and analytics
  - Total budget, production cost, post-production cost, licensing cost
  - Budget utilization (used vs remaining)
  - Budget status: \`none\`, \`on-track\`, \`warning\`, \`over\`
  - Clip metrics: total clips, duration, cost per clip, cost per second
  - Production vs post-production breakdown

**Budget Analytics Features:**
- **Multi-Project Analysis**: Analyze budgets across multiple projects
- **Hierarchical View**: Project → Show → Season → Episode breakdown
- **Timeline View**: Budget progression over time
- **Trends Analysis**: Budget trends by month, quarter, or year
- **Comparative Metrics**: Compare budgets across projects, shows, or seasons
- **Budget Forecast**: Project future spending based on current trends
- **Cost Analysis**: Detailed cost breakdowns by licensor, project, show
- **Time-to-Completion**: Track how long pitches take from creation to completion
- **Budget Health Scores**: Risk assessment and health monitoring

**Budget Statuses:**
- \`none\`: No budget data available
- \`on-track\`: Budget spending is within expected range
- \`warning\`: Budget spending is approaching limits
- \`over\`: Budget has been exceeded

**Budget Categories:**
- **Production**: Costs for production work (shooting, capturing content)
- **Post-Production**: Costs for post-production work (editing, effects, finishing)
- **Licensing House**: Costs for licensing content from external sources
- **Unassigned**: Costs not yet assigned to a category

**Key Budget Metrics:**
- **Total Budget**: Sum of production and post-production budgets
- **Budget Used**: Total amount spent so far
- **Budget Remaining**: Total budget minus budget used
- **Budget Percentage**: Percentage of budget used (used / total * 100)
- **Cost Per Second**: Average cost per second of content
- **Cost Per Clip**: Average cost per clip
- **Average Clip Duration**: Average duration of clips in seconds
- **Budget Efficiency**: Ratio of cost to content duration
- **Budget Utilization**: Percentage of budget used

**Budget Workflow:**
1. Project created → Budget values initialized (default: $0)
2. Budget values set → Production and post-production budgets allocated
3. Clips added → Budget groups created and clips assigned
4. Templates matched → Clips matched to budget templates with cost per second
5. Budget calculations → Automatic calculation of totals, usage, and metrics
6. Budget analysis → Review budget health, trends, and forecasts

**Analyze Budget Feature:**
The "Analyze Budget" button on the Projects page provides comprehensive budget analytics:
- Select multiple projects to analyze
- View hierarchical breakdown (Project → Show → Season → Episode)
- See timeline of license signings and budget progression
- Analyze trends over time (monthly, quarterly, yearly)
- Compare metrics across projects, shows, or seasons
- Get budget forecasts and risk assessments
- Review time-to-completion analytics
- Export budget data to CSV

**Budget Questions You Can Answer:**
- "What's the total budget across all projects?"
- "How much budget is remaining for [Project Name]?"
- "Which projects are over budget?"
- "What's the average cost per clip?"
- "Show me budget trends for the last quarter"
- "Which project has the highest budget utilization?"
- "What's the budget status for [Project Name]?"
- "How many clips are in the production budget vs post-production?"
- "What's the cost per second for [Project Name]?"
- "Compare budgets across projects"

### 6. CALENDAR & SCHEDULING
The calendar system manages events, meetings, and workflow-related scheduling.

**Calendar Event Structure:**
- **Title**: Event name/title (required)
- **Description**: Event description/details
- **Start Date**: When the event starts (required)
- **End Date**: When the event ends (optional)
- **Location**: Physical or virtual location
- **Event Type**: Type of event (meeting, deadline, review, etc.)
- **Project ID**: Associated project (can be 'no-project' for general events)
- **Assigned Contacts**: People assigned/attending the event
- **Workflow Integration**: Can be linked to pitches, stories, or other workflow items
  - \`workflowId\`: ID of linked workflow item
  - \`workflowType\`: Type (pitch, story, etc.)
  - \`workflowStatus\`: Status of linked workflow item
- **Recurring Events**: Can be set as recurring with recurrence patterns
- **Reminders**: Reminder notifications before event
- **Priority**: Event priority level
- **Tags**: Tags for categorization

**Event Types:**
- **Meeting**: General meetings
- **Deadline**: Important deadlines
- **Review**: Review sessions
- **Production**: Production-related events
- **Post-Production**: Post-production events
- **Other**: Other event types

**Calendar Features:**
- **Organization-wide Calendar**: All events are scoped to organization
- **Project-scoped Events**: Events can be associated with specific projects
- **Workflow Integration**: Events can be linked to pitches, stories, and other workflow items
- **Upcoming Events**: View events for next 7, 30 days, or custom ranges
- **Event Filtering**: Filter by type, workflow type, project, assigned contacts
- **Recurring Events**: Support for repeating events
- **Reminders**: Set reminders before events
- **Event Assignment**: Assign contacts/team members to events

**Calendar Workflow Integration:**
- Events can be automatically created from workflow items (pitches, stories)
- Events can track workflow milestones (pitch reviews, script deadlines, edit reviews)
- Events can be linked to specific workflow statuses
- Calendar can show upcoming deadlines based on workflow status

**Calendar Questions You Can Answer:**
- "What events do I have coming up?"
- "Show me events for this week"
- "What events are scheduled for [Project Name]?"
- "What's my schedule for tomorrow?"
- "Are there any deadlines this week?"
- "What pitch review meetings are scheduled?"
- "Show me all production-related events"
- "What events are linked to [Pitch/Story ID]?"
- "When is the next review meeting?"
- "How many events are scheduled this month?"

### 7. CONTACTS MANAGEMENT
The Contacts system provides comprehensive contact management and directory functionality.

**Contact Structure:**
- **Name**: First name, last name, or full name
- **Email**: Contact email address
- **Phone**: Phone number (phone or phoneNumber field)
- **Role**: Production role (Producer, Director, Writer, Editor, Talent, Crew, Client, Vendor)
- **Department**: Organizational department
- **Pod**: Team pod/group assignment
- **Position**: Job position/title
- **Status**: Contact status (Available, Busy, Unavailable)
- **Specialty**: Contact specialties (script writing, post-production, casting, etc.)
- **Assignment Tracking**: Track contacts assigned to pitches, stories, and shows
- **Integration Fields**: Integration with external systems (Slack, FrameIO, Box, etc.)

**Contact Features:**
- **Comprehensive Directory**: Full contact directory with advanced organizational features
- **Advanced Search**: Multi-criteria filtering (department, role, pod, custom fields)
- **Bulk Operations**: Efficient bulk contact management and updates
- **Direct Messaging**: Integration with messaging system for direct communication
- **Role-Based Organization**: Contacts categorized by production roles
- **Assignment Tracking**: Track which contacts are assigned to pitches, stories, shows
- **Availability Management**: Monitor contact availability status
- **Specialty Tracking**: Record and search by contact specialties

**Contact Roles:**
- **Producer**: Approves pitches and manages production
- **Director**: Directs production
- **Writer**: Creates scripts
- **Editor**: Handles editing workflow
- **Talent**: On-screen talent
- **Crew**: Production crew members
- **Client**: External clients
- **Vendor**: External vendors

**Contact Questions You Can Answer:**
- "How many contacts do we have?"
- "Show me all producers"
- "What contacts are in the [Department Name] department?"
- "Who is assigned to [Pitch/Story/Show Name]?"
- "What contacts are available?"
- "Show me contacts with [Specialty Name] specialty"
- "What contacts are in [Pod Name] pod?"
- "Find contact by email [email address]"
- "Show me recent contacts"

### 8. AUTOMATION MANAGEMENT
The Automation Management system allows administrators to configure automated notifications and triggers for workflow functions.

**Automation Structure:**
- **Automation Functions**: Available automated functions (18 total functions)
  - Pitching & Clearance: updatePitchStatus, updateClearanceStage, assignProducer, selectLicensingSpecialist, updatePitch
  - Stories & Scripts: updateStoryStatus, linkToStory, createStory, saveScriptVersion, updateScriptContent, approveScript, requestRevision, killScript, createApprovalRequest, syncStoryFromPitch
  - Shows Management: toggleShowStatus, saveShow, saveSeason
- **Automation Rules**: Configuration rules that trigger when functions execute
  - Function association: Each rule targets a specific function
  - Triggers: Email, Message, Notification triggers
  - Recipients: Selected contacts/team members who receive notifications
  - Templates: Customizable subject and body templates
  - Enabled/Disabled: Rules can be toggled on/off
- **Execution Logs**: History of automation rule executions
  - Function name, rule name, status (success/error)
  - Context data (pitchId, storyId, status changes, etc.)
  - Execution timestamp and results

**Automation Features:**
- **Function Discovery**: View all 18 automated functions with metadata
- **Rule Management**: Create, edit, delete, enable/disable automation rules
- **Trigger Configuration**: Configure email, message, and notification triggers
- **Recipient Selection**: Assign contacts/team members as recipients
- **Template Customization**: Customize email/message subject and body templates
- **Execution Tracking**: View execution history and results
- **Organization-Scoped**: All automation data is scoped to organization
- **Admin-Only Access**: Only administrators can access Automation Management

**Automation Workflow:**
1. Admin creates automation rule in Automation Management page
2. Rule is stored in Firestore \`automationRules\` collection
3. User performs action (e.g., changes pitch status)
4. Service calls automation with context data
5. Active rules are retrieved for the function
6. Each rule's triggers execute (Email, Message, Notification)
7. Execution is logged to \`automationLogs\` collection
8. Results displayed in Execution Logs tab

**Automation Context Data:**
- pitchId, pitchTitle, show, season
- storyId, storyTitle
- oldStatus, newStatus
- performedBy, performedByName
- reason (if provided)
- Other function-specific parameters

**Automation Questions You Can Answer:**
- "What automation functions are available?"
- "How many automation rules are enabled?"
- "What rules are configured for [Function Name]?"
- "Show me recent automation executions"
- "What automation rules trigger on pitch status changes?"
- "How do I create an automation rule?"
- "What triggers are available for automation?"

### 9. INDEXED FILES
The Indexed Files system provides file indexing and search functionality for managing media files, documents, and assets.

**Indexed Files Structure:**
- **File Indexes**: Collections of indexed files organized by folder/path
  - Name: Index/folder name
  - Path: File system path
  - Type: File type (video, audio, image, document)
  - Files: Array of files in the index
- **File Metadata**: Each file has metadata
  - Name: File name
  - Path: File path
  - Type: File type (video, audio, image, document)
  - Extension: File extension
  - Size: File size
  - Last Modified: Modification date
- **Folder Organization**: Files organized in folder hierarchy
  - Tree structure with expandable folders
  - Search across folder names and paths
  - Filter by folder

**Indexed Files Features:**
- **File Indexing**: Index files from local storage or cloud drives
- **Advanced Search**: Search files by name, path, type, extension
- **Folder Management**: Organize files in folder hierarchy
- **File Type Filtering**: Filter by video, audio, image, document types
- **Pitch Linking**: Link files to pitches for workflow integration
- **Multi-Mode Search**: Search modes (indexed files, pitch links, or all)
- **File Metadata**: View file details, size, modification date
- **File Operations**: Delete, organize, and manage indexed files

**File Types:**
- **Video**: Video files (.mp4, .mov, .avi, etc.)
- **Audio**: Audio files (.mp3, .wav, .aac, etc.)
- **Image**: Image files (.jpg, .png, .gif, etc.)
- **Document**: Document files (.pdf, .doc, .txt, etc.)

**Indexed Files Workflow:**
1. Index folder or files from storage
2. Files are indexed with metadata (name, path, type, size)
3. Files organized in folder hierarchy
4. Search and filter files by various criteria
5. Link files to pitches for workflow integration
6. Manage and organize indexed files

**Indexed Files Questions You Can Answer:**
- "How many files are indexed?"
- "What files are in [Folder Name]?"
- "Show me all video files"
- "Find files matching [Search Term]"
- "What files are linked to [Pitch Name]?"
- "Show me files by type [video/audio/image/document]"
- "How many files are in each folder?"
- "What's the path to [File Name]?"

### 10. MESSAGES & CONVERSATIONS
The Messages system provides team communication and conversation management.

**Conversation Structure:**
- **Title/Name**: Conversation name (can be auto-generated for direct messages)
- **Participants**: Array of user IDs participating in the conversation
- **Messages**: Array of messages in the conversation
- **Unread Count**: Per-user unread message counts
- **Last Message**: Most recent message content
- **Created At**: When conversation was created
- **Updated At**: Last activity timestamp
- **Archived**: Whether conversation is archived

**Message Structure:**
- **Content**: Message text content
- **Sender**: User ID of message sender
- **Sender Name**: Display name of sender
- **Timestamp**: When message was sent
- **Reactions**: Emoji reactions on messages
- **Reply To**: Reference to message being replied to
- **Edited**: Whether message has been edited
- **Deleted**: Whether message has been deleted

**Messaging Features:**
- **Direct Messages**: One-on-one conversations between users
- **Group Conversations**: Multi-participant conversations
- **Real-time Messaging**: Instant message delivery
- **Typing Indicators**: Show when users are typing
- **Message Reactions**: Emoji reactions on messages
- **Message Replies**: Reply to specific messages in thread
- **Message Editing**: Edit sent messages
- **Message Deletion**: Delete messages
- **Unread Tracking**: Track unread messages per user
- **Search**: Search conversations and messages
- **Slack Integration**: Integration with Slack channels

**Conversation Management:**
- **Create Conversation**: Start new conversation with one or more participants
- **Add Participants**: Add users to existing conversations
- **Rename Conversation**: Change conversation name
- **Archive Conversation**: Archive inactive conversations
- **Delete Conversation**: Remove conversations
- **Mark as Read**: Mark messages as read
- **Mark All as Read**: Mark all messages in conversation as read

**Messages Questions You Can Answer:**
- "How many conversations do I have?"
- "What are my unread messages?"
- "Show me recent conversations"
- "Who is in [Conversation Name]?"
- "What's the last message in [Conversation Name]?"
- "How do I create a new conversation?"
- "How do I add someone to a conversation?"

### 11. LICENSING BUDGET TRACKER
The Licensing Budget Tracker page tracks license agreement budgets across all shows, displaying cleared licenses and their amounts with show-level aggregation.

**License Agreement Structure:**
- **License ID**: Unique identifier for the license
- **Clip Pitch ID**: Reference to the pitch/clip being licensed
- **Clip Title**: Title of the clip being licensed (from pitch)
- **Show**: Show name the license is associated with
- **Status**: License status (Signed, Pending, Draft, Expired, Cancelled)
- **Fee**: License fee amount (required for Signed/Pending status)
- **Currency**: Currency for the license fee
- **Licensor**: Company/person granting the license
- **Licensor Contact**: Contact information for licensor
- **Territory**: Geographic territory covered by license
- **Contract Type**: Type of license contract
- **Signed Date**: Date license was signed (for Signed status)
- **Terms**: License terms and conditions
- **Usage Rights**: Usage rights granted by license

**License Statuses:**
- **Signed**: License has been signed and executed (cleared)
- **Pending**: License is awaiting signature (pending)
- **Draft**: License is in draft/preparation stage
- **Expired**: License has expired
- **Cancelled**: License was cancelled

**Budget Tracking:**
- **Total Budget**: Sum of all license fees
- **Cleared Budget**: Sum of Signed license fees (cleared for use)
- **Pending Budget**: Sum of Pending license fees (awaiting signature)
- **Draft Budget**: Sum of Draft license fees (in preparation)
- **Budget by Show**: License fees aggregated by show
- **Budget by Licensor**: License fees aggregated by licensor
- **Budget by Status**: License fees grouped by status

**Licensing Budget Tracker Features:**
- **Summary by Show**: View budget totals aggregated by show
- **Detailed Breakdown**: View individual license details with filters
- **Status Filtering**: Filter licenses by status (All, Signed, Pending, Draft)
- **Show Filtering**: Filter licenses by specific show
- **Search**: Search licenses by clip title, licensor, show
- **PDF Viewing**: View signed documents/PDFs for licenses
- **Export**: Export license and budget data
- **Analytics Cards**: Display key metrics (total budget, cleared, pending, draft)

**License Workflow:**
1. Pitch created → License agreement created (Draft status)
2. License details filled → Fee, licensor, terms added
3. License sent for signature → Status changed to Pending
4. License signed → Status changed to Signed (cleared budget)
5. License executed → Available for production use

**Budget Calculations:**
- **Total Budget**: All license fees across all statuses
- **Cleared Budget**: Only Signed licenses (cleared for production)
- **Pending Budget**: Pending licenses awaiting signature
- **Draft Budget**: Draft licenses in preparation
- **Show Aggregation**: Budgets summed by show name
- **Licensor Aggregation**: Budgets summed by licensor

**Licensing Budget Tracker Questions You Can Answer:**
- "What's the total licensing budget?"
- "How much is cleared (signed) vs pending?"
- "What's the budget for [Show Name]?"
- "Which licensors have the highest fees?"
- "How many licenses are signed vs pending?"
- "Show me recent signed licenses"
- "What licenses are pending signature?"
- "What's the total fee for [Licensor Name]?"
- "Which shows have the highest licensing costs?"
`;

export const PAGE_SPECIFIC_CONTEXT = {
  'Pitching & Clearance': {
    description: 'Page for managing pitches and clearance process',
    focus: 'Pitches, clearance stages, licensing, producer assignments',
    keyActions: ['Update pitch status', 'Assign producer', 'Select licensing specialist', 'Update clearance stage', 'Create story from cleared pitch'],
    keyStatuses: ['Pitched', 'Pursue Clearance', 'Ready to License', 'License Cleared', 'Ready for Script', 'Killed', 'Do Not Pursue Clearance']
  },
  'Stories & Scripts': {
    description: 'Page for managing stories and script creation',
    focus: 'Stories, scripts, string creation, script completion',
    keyActions: ['Update story status', 'Assign writer', 'Save script version', 'Link story to pitch', 'Create story'],
    keyStatuses: ['Initial', 'Script Writing', 'Script Complete', 'Needs String', 'String In Progress', 'String Complete']
  },
  'Edit': {
    description: 'Page for managing edit workflow',
    focus: 'Edit phases, version edits, A Roll, RC, transcoding',
    keyActions: ['Update edit status', 'Assign editor', 'Add edit notes', 'Update transcoding status'],
    keyStatuses: ['A Roll', 'v1-v5 Edit', 'Ready for Build', 'RC', 'Assembled', 'Needs Transcode', 'Ingested', 'Edit Ready']
  },
  'Shows Management': {
    description: 'Page for managing shows and seasons',
    focus: 'Shows, seasons, story organization',
    keyActions: ['Create show', 'Create season', 'Assign stories to shows']
  },
  'Projects': {
    description: 'Page for managing projects and budget analysis',
    focus: 'Projects, budgets, budget analytics, multi-project analysis',
    keyActions: ['Create project', 'Analyze budget', 'View budget analytics', 'Compare project budgets', 'Export budget data'],
    keyStatuses: ['active', 'archived', 'on-track', 'warning', 'over']
  },
  'Contacts': {
    description: 'Page for managing contacts and directory',
    focus: 'Contacts, team members, role management, assignment tracking',
    keyActions: ['Create contact', 'Search contacts', 'Filter by role/department', 'Assign contacts to pitches/stories', 'Bulk operations'],
    keyStatuses: ['Available', 'Busy', 'Unavailable']
  },
  'Automation Management': {
    description: 'Admin page for managing automation rules and triggers',
    focus: 'Automation functions, rules, triggers, execution logs',
    keyActions: ['Create automation rule', 'Edit rule', 'Enable/disable rule', 'View execution logs', 'Configure triggers'],
    keyStatuses: ['enabled', 'disabled', 'success', 'error']
  },
  'Indexed Files': {
    description: 'Page for managing indexed files and file search',
    focus: 'File indexing, search, folder management, file linking',
    keyActions: ['Index folder', 'Search files', 'Filter by type', 'Link files to pitches', 'Manage indexed files'],
    keyStatuses: ['indexed', 'linked', 'unlinked']
  },
  'Messages': {
    description: 'Page for team messaging and conversations',
    focus: 'Conversations, messages, real-time chat, team communication',
    keyActions: ['Create conversation', 'Send message', 'Add participants', 'Reply to message', 'Archive conversation'],
    keyStatuses: ['active', 'archived', 'unread', 'read']
  },
  'Licensing Budget Tracker': {
    description: 'Page for tracking license agreement budgets across shows',
    focus: 'License agreements, licensing budgets, cleared licenses, show-level aggregation',
    keyActions: ['View license details', 'Filter by show/status', 'Search licenses', 'View signed documents', 'Export budget data'],
    keyStatuses: ['Signed', 'Pending', 'Draft', 'Expired', 'Cancelled']
  }
};

export function getAppKnowledgePrompt(): string {
  return APP_KNOWLEDGE;
}

export function getPageContextPrompt(page?: string): string {
  if (!page || !PAGE_SPECIFIC_CONTEXT[page as keyof typeof PAGE_SPECIFIC_CONTEXT]) {
    return '';
  }
  
  const context = PAGE_SPECIFIC_CONTEXT[page as keyof typeof PAGE_SPECIFIC_CONTEXT];
  const keyStatuses = 'keyStatuses' in context ? context.keyStatuses : undefined;
  return `
## Current Page Context: ${page}

**Description**: ${context.description}
**Focus**: ${context.focus}
**Key Actions Available**: ${context.keyActions.join(', ')}
${keyStatuses ? `**Key Statuses**: ${keyStatuses.join(', ')}` : ''}
`;
}

