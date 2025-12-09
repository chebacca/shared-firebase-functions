/**
 * User Role Context Service
 * 
 * Maps user roles to workflow responsibilities
 * Tracks assignments and workload per user
 * Detects users behind on their workflow steps
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface UserRoleContext {
  // Role to responsibility mapping
  roleResponsibilities: Map<string, string[]>; // role -> list of responsibilities

  // User workload analysis
  userWorkloads: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    assignedPitches: number;
    assignedStories: number;
    totalItems: number;
    itemsByStatus: Map<string, number>; // status -> count
    overdueItems: number;
    atRiskItems: number;
  }>;

  // Users behind on their tasks
  behindScheduleUsers: Array<{
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    overdueItems: Array<{
      entityType: 'pitch' | 'story';
      entityId: string;
      title: string;
      status: string;
      daysOverdue: number;
    }>;
    atRiskItems: Array<{
      entityType: 'pitch' | 'story';
      entityId: string;
      title: string;
      status: string;
      daysUntilDeadline: number;
    }>;
  }>;

  // Role-specific workflow steps
  roleWorkflowSteps: Map<string, string[]>; // role -> list of workflow steps they handle
}

/**
 * Role to responsibility mapping
 */
const ROLE_RESPONSIBILITIES: Record<string, string[]> = {
  // Writers
  'WRITER': ['Write scripts', 'Revise scripts', 'Complete script drafts'],
  'cspWriter': ['Write scripts', 'Revise scripts', 'Complete script drafts'],

  // Editors
  'EDITOR': ['Create A Roll', 'Create version edits (v1-v5)', 'Address edit notes', 'Complete assembly'],
  'ASSISTANT_EDITOR': ['Assist with edits', 'Address edit notes'],
  'ASSEMBLY_EDITOR': ['Complete assembly', 'Create release candidates'],

  // Producers
  'PRODUCER': ['Approve pitches', 'Oversee production', 'Review scripts', 'Approve final cuts'],
  'SUPERVISING_PRODUCER': ['Supervise production', 'Approve major decisions'],
  'SERIES_PRODUCER': ['Oversee series production', 'Approve series-level decisions'],
  'ASSOCIATE_PRODUCER': ['Coordinate workflow', 'Manage assignments', 'Track progress'],
  'cspProducer': ['Approve pitches', 'Oversee production', 'Review scripts'],
  'cspAssociateProducer': ['Coordinate workflow', 'Manage assignments'],

  // Clearance & Licensing
  'CLEARANCE_COORDINATOR': ['Research clips', 'Pursue clearance', 'Prepare for licensing'],
  'LICENSING_SPECIALIST': ['Acquire licenses', 'Finalize license agreements', 'Clear licenses'],
  'RESEARCHER': ['Research clips', 'Create pitches', 'Gather source material'],

  // Directors
  'DIRECTOR': ['Direct production', 'Review edits', 'Approve creative decisions'],

  // Post-Production
  'POST_PRODUCER': ['Oversee post-production', 'Manage edit workflow'],
  'LINE_PRODUCER': ['Manage production line', 'Track budgets', 'Coordinate resources'],
  'MEDIA_MANAGER': ['Manage media files', 'Handle transcoding', 'Organize assets']
};

/**
 * Role to workflow steps mapping
 */
const ROLE_WORKFLOW_STEPS: Record<string, string[]> = {
  'WRITER': ['Script Writing', 'Script Review', 'Script Revisions', 'Script Complete'],
  'cspWriter': ['Script Writing', 'Script Review', 'Script Revisions', 'Script Complete'],

  'EDITOR': ['A Roll', 'v1 Edit', 'v2 Edit', 'v3 Edit', 'v4 Edit', 'v5 Edit', 'Ready for Build', 'RC', 'Assembled'],
  'ASSISTANT_EDITOR': ['A Roll', 'v1 Edit', 'v2 Edit', 'v3 Edit', 'v4 Edit', 'v5 Edit'],
  'ASSEMBLY_EDITOR': ['Ready for Build', 'RC', 'Assembled'],

  'PRODUCER': ['Pursue Clearance', 'Ready to License', 'License Cleared', 'Ready for Script', 'Script Review', 'Script Complete', 'Ready for Build'],
  'SUPERVISING_PRODUCER': ['Pursue Clearance', 'Ready to License', 'License Cleared', 'Script Review', 'Ready for Build'],
  'SERIES_PRODUCER': ['Pursue Clearance', 'Script Review', 'Ready for Build'],
  'ASSOCIATE_PRODUCER': ['Pursue Clearance', 'Ready to License', 'Script Writing', 'Script Review'],
  'cspProducer': ['Pursue Clearance', 'Ready to License', 'License Cleared', 'Ready for Script', 'Script Review'],
  'cspAssociateProducer': ['Pursue Clearance', 'Ready to License', 'Script Writing'],

  'CLEARANCE_COORDINATOR': ['Pitched', 'Pursue Clearance', 'Ready to License'],
  'LICENSING_SPECIALIST': ['Ready to License', 'Pending Signature', 'License Cleared'],
  'RESEARCHER': ['Pitched']
};

/**
 * Gather user role context for an organization (tenant-aware)
 * CRITICAL: Can filter to show only current user's workload if userId is provided
 * If userId is provided, only shows workload for that user
 * If userId is not provided, shows organization-wide workload (all users)
 */
export async function gatherUserRoleContext(
  organizationId: string,
  options?: {
    includeWorkload?: boolean;
    includeBehindSchedule?: boolean;
    userId?: string; // Filter to specific user's workload if provided
  }
): Promise<UserRoleContext> {
  const {
    includeWorkload = true,
    includeBehindSchedule = true,
    userId
  } = options || {};

  // Build role responsibilities map
  const roleResponsibilities = new Map<string, string[]>();
  Object.entries(ROLE_RESPONSIBILITIES).forEach(([role, responsibilities]) => {
    roleResponsibilities.set(role, responsibilities);
  });

  // Build role workflow steps map
  const roleWorkflowSteps = new Map<string, string[]>();
  Object.entries(ROLE_WORKFLOW_STEPS).forEach(([role, steps]) => {
    roleWorkflowSteps.set(role, steps);
  });

  // Fetch all contacts for the organization
  const contactsSnapshot = await db
    .collection('clipShowContacts')
    .where('organizationId', '==', organizationId)
    .get();

  const contactsMap = new Map<string, any>();
  contactsSnapshot.forEach(doc => {
    const contact = { id: doc.id, ...doc.data() };
    contactsMap.set(contact.id, contact);
  });

  // Fetch all pitches and stories
  const [pitchesSnapshot, storiesSnapshot] = await Promise.all([
    db
      .collection('clipShowPitches')
      .where('organizationId', '==', organizationId)
      .get(),
    db
      .collection('clipShowStories')
      .where('organizationId', '==', organizationId)
      .get()
  ]);

  const pitches: any[] = [];
  const stories: any[] = [];

  pitchesSnapshot.forEach(doc => {
    pitches.push({ id: doc.id, ...doc.data() });
  });

  storiesSnapshot.forEach(doc => {
    stories.push({ id: doc.id, ...doc.data() });
  });

  // Build user workload map
  const userWorkloadMap = new Map<string, {
    userId: string;
    userName?: string;
    userEmail?: string;
    role?: string;
    assignedPitches: Set<string>;
    assignedStories: Set<string>;
    itemsByStatus: Map<string, number>;
    overdueItems: number;
    atRiskItems: number;
  }>();

  // Process pitches
  pitches.forEach(pitch => {
    const assignedUsers = getAssignedUsersFromPitch(pitch);
    assignedUsers.forEach(userId => {
      if (!userWorkloadMap.has(userId)) {
        const contact = contactsMap.get(userId);
        userWorkloadMap.set(userId, {
          userId,
          userName: contact?.name || contact?.firstName + ' ' + contact?.lastName,
          userEmail: contact?.email,
          role: contact?.role,
          assignedPitches: new Set(),
          assignedStories: new Set(),
          itemsByStatus: new Map(),
          overdueItems: 0,
          atRiskItems: 0
        });
      }

      const workload = userWorkloadMap.get(userId)!;
      workload.assignedPitches.add(pitch.id);
      const status = pitch.status || 'Unknown';
      workload.itemsByStatus.set(status, (workload.itemsByStatus.get(status) || 0) + 1);
    });
  });

  // Process stories
  stories.forEach(story => {
    const assignedUsers = getAssignedUsersFromStory(story);
    assignedUsers.forEach(userId => {
      if (!userWorkloadMap.has(userId)) {
        const contact = contactsMap.get(userId);
        userWorkloadMap.set(userId, {
          userId,
          userName: contact?.name || contact?.firstName + ' ' + contact?.lastName,
          userEmail: contact?.email,
          role: contact?.role,
          assignedPitches: new Set(),
          assignedStories: new Set(),
          itemsByStatus: new Map(),
          overdueItems: 0,
          atRiskItems: 0
        });
      }

      const workload = userWorkloadMap.get(userId)!;
      workload.assignedStories.add(story.id);
      const status = story.status || 'Unknown';
      workload.itemsByStatus.set(status, (workload.itemsByStatus.get(status) || 0) + 1);
    });
  });

  // Convert to array format
  // If userId provided, only include that user's workload (tenant-aware filtering)
  let workloadsToProcess = Array.from(userWorkloadMap.values());
  if (userId) {
    workloadsToProcess = workloadsToProcess.filter(workload => workload.userId === userId);
  }
  
  const userWorkloads: UserRoleContext['userWorkloads'] = workloadsToProcess.map(workload => ({
    userId: workload.userId,
    userName: workload.userName,
    userEmail: workload.userEmail,
    role: workload.role,
    assignedPitches: workload.assignedPitches.size,
    assignedStories: workload.assignedStories.size,
    totalItems: workload.assignedPitches.size + workload.assignedStories.size,
    itemsByStatus: workload.itemsByStatus,
    overdueItems: workload.overdueItems,
    atRiskItems: workload.atRiskItems
  }));

  // Find users behind schedule (simplified - would need schedule data for full analysis)
  // If userId provided, only check that user (tenant-aware filtering)
  const behindScheduleUsers: UserRoleContext['behindScheduleUsers'] = [];
  if (includeBehindSchedule) {
    // This would be enhanced with actual schedule/calendar data
    // For now, we identify users with many items in non-complete statuses
    userWorkloads.forEach(workload => {
      // If userId filter is set, only process that user
      if (userId && workload.userId !== userId) {
        return;
      }
      
      if (workload.totalItems > 5) {
        // User has many items assigned
        const nonCompleteCount = Array.from(workload.itemsByStatus.entries())
          .filter(([status]) => !isCompleteStatus(status))
          .reduce((sum, [, count]) => sum + count, 0);

        if (nonCompleteCount > 3) {
          behindScheduleUsers.push({
            userId: workload.userId,
            userName: workload.userName,
            userEmail: workload.userEmail,
            role: workload.role,
            overdueItems: [], // Would be populated with schedule data
            atRiskItems: [] // Would be populated with schedule data
          });
        }
      }
    });
  }

  return {
    roleResponsibilities,
    userWorkloads: userWorkloads.sort((a, b) => b.totalItems - a.totalItems),
    behindScheduleUsers,
    roleWorkflowSteps
  };
}

/**
 * Extract assigned user IDs from pitch data
 */
function getAssignedUsersFromPitch(pitch: any): string[] {
  const users: string[] = [];

  if (pitch.assignedProducerId) users.push(pitch.assignedProducerId);
  if (pitch.assignedWriterId) users.push(pitch.assignedWriterId);
  if (pitch.assignedAPId) users.push(pitch.assignedAPId);
  if (pitch.assignedResearcherId) users.push(pitch.assignedResearcherId);
  if (pitch.assignedClearanceCoordinatorId) users.push(pitch.assignedClearanceCoordinatorId);
  if (pitch.assignedLicensingSpecialistId) users.push(pitch.assignedLicensingSpecialistId);
  if (pitch.assignedContacts && Array.isArray(pitch.assignedContacts)) {
    users.push(...pitch.assignedContacts);
  }

  return Array.from(new Set(users));
}

/**
 * Extract assigned user IDs from story data
 */
function getAssignedUsersFromStory(story: any): string[] {
  const users: string[] = [];

  if (story.writerId) users.push(story.writerId);
  if (story.editorId) users.push(story.editorId);
  if (story.producerId) users.push(story.producerId);
  if (story.associateProducerId) users.push(story.associateProducerId);
  if (story.assignedContacts && Array.isArray(story.assignedContacts)) {
    users.push(...story.assignedContacts);
  }

  return Array.from(new Set(users));
}

/**
 * Check if a status represents a completed item
 */
function isCompleteStatus(status: string): boolean {
  const completeStatuses = [
    'Killed',
    'Do Not Pursue Clearance',
    'Ready for Script',
    'Assembled'
  ];
  return completeStatuses.includes(status);
}






