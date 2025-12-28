/**
 * Schedule Context Service
 * 
 * Analyzes calendar events, deadlines, and scheduling for pitches and stories
 * Detects overdue items, conflicts, and calculates time-to-deadline
 */

import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

const db = getFirestore();

export interface ScheduleContext {
  // Calendar events linked to pitches/stories
  linkedEvents: Array<{
    eventId: string;
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    startDate: Date;
    endDate?: Date;
    eventType?: string;
    workflowType?: string;
  }>;

  // Overdue items
  overdueItems: Array<{
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    status: string;
    expectedCompletionDate?: Date;
    daysOverdue: number;
    assignedUsers: string[];
  }>;

  // Scheduling conflicts
  conflicts: Array<{
    date: Date;
    conflictingItems: Array<{
      entityType: 'pitch' | 'story';
      entityId: string;
      title: string;
      assignedUser: string;
    }>;
  }>;

  // At-risk items (approaching deadlines)
  atRiskItems: Array<{
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    status: string;
    deadline?: Date;
    daysUntilDeadline: number;
    assignedUsers: string[];
  }>;

  // Time-to-deadline for active items
  activeItemsTimeline: Array<{
    entityType: 'pitch' | 'story';
    entityId: string;
    title: string;
    status: string;
    deadline?: Date;
    daysUntilDeadline?: number;
    assignedUsers: string[];
  }>;
}

/**
 * Gather schedule context for an organization (tenant-aware)
 * CRITICAL: Can filter to show only current user's items if userId is provided
 * If userId is provided, only shows overdue/at-risk items assigned to that user
 * If userId is not provided, shows organization-wide schedule context (all users)
 */
export async function gatherScheduleContext(
  organizationId: string,
  options?: {
    includeOverdue?: boolean;
    includeConflicts?: boolean;
    includeAtRisk?: boolean;
    daysAhead?: number; // How many days ahead to look for at-risk items
    userId?: string; // Filter to specific user's items if provided
  }
): Promise<ScheduleContext> {
  const emptyContext: ScheduleContext = {
    linkedEvents: [],
    overdueItems: [],
    conflicts: [],
    atRiskItems: [],
    activeItemsTimeline: []
  };

  // Early return if organizationId is missing
  if (!organizationId) {
    console.warn('⚠️ [ScheduleContext] No organizationId provided, returning empty context');
    return emptyContext;
  }

  // Wrap entire function in try-catch to ensure we never throw
  try {
    const {
      includeOverdue = true,
      includeConflicts = true,
      includeAtRisk = true,
      daysAhead = 7,
      userId
    } = options || {};

    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Fetch all calendar events for the organization
    // Note: We use 'clipShowCalendarEvents' as the primary collection for Clip Show Pro
    // Wrap each query in its own try-catch to ensure errors are caught
    let eventsSnapshot: any = { empty: true, forEach: () => { }, docs: [] };

    try {
      try {
        eventsSnapshot = await db
          .collection('clipShowCalendarEvents')
          .where('organizationId', '==', organizationId)
          .limit(500)
          .get()
          .catch((error: any) => {
            const errorCode = error?.code;
            const errorMessage = error?.message || '';
            
            // Handle FAILED_PRECONDITION (missing index) gracefully
            if (errorCode === 9 || errorCode === '9' || errorCode === 'FAILED_PRECONDITION' || errorMessage.includes('FAILED_PRECONDITION')) {
              console.warn('⚠️ [ScheduleContext] Missing Firestore index for clipShowCalendarEvents. Query skipped:', {
                message: errorMessage,
                code: errorCode,
                organizationId,
                note: 'This usually means a Firestore index is missing. The function will continue with empty schedule context.'
              });
              return { empty: true, forEach: () => { }, docs: [] } as any;
            }
            
            console.warn('⚠️ [ScheduleContext] Error fetching clipShowCalendarEvents:', {
              message: errorMessage,
              code: errorCode,
              organizationId
            });
            return { empty: true, forEach: () => { }, docs: [] } as any;
          });

        // If empty, try legacy 'calendarEvents'
        if (eventsSnapshot && eventsSnapshot.empty) {
          try {
            const legacySnapshot = await db
              .collection('calendarEvents')
              .where('organizationId', '==', organizationId)
              .limit(500)
              .get()
              .catch((error: any) => {
                console.warn('⚠️ [ScheduleContext] Error fetching legacy calendarEvents:', {
                  message: error?.message,
                  code: error?.code,
                  organizationId
                });
                return { empty: true, forEach: () => { }, docs: [] } as any;
              });
            if (legacySnapshot && !legacySnapshot.empty) {
              eventsSnapshot = legacySnapshot;
            }
          } catch (fallbackError: any) {
            console.warn('⚠️ [ScheduleContext] Fallback calendarEvents query failed:', fallbackError?.message || fallbackError);
          }
        }
      } catch (error: any) {
        const errorCode = error?.code;
        const errorMessage = error?.message || '';
        
        // Handle FAILED_PRECONDITION (missing index) gracefully
        if (errorCode === 9 || errorCode === '9' || errorCode === 'FAILED_PRECONDITION' || errorMessage.includes('FAILED_PRECONDITION')) {
          console.warn('⚠️ [ScheduleContext] Missing Firestore index detected in catch block. Query skipped:', {
            message: errorMessage,
            code: errorCode,
            organizationId,
            note: 'This usually means a Firestore index is missing. The function will continue with empty schedule context.'
          });
          eventsSnapshot = { empty: true, forEach: () => { }, docs: [] } as any;
        } else {
          console.warn('⚠️ [ScheduleContext] Error in events query block:', errorMessage, errorCode);
          // Try fallback
          try {
            eventsSnapshot = await db
              .collection('calendarEvents')
              .where('organizationId', '==', organizationId)
              .get()
              .catch(() => ({ empty: true, forEach: () => { }, docs: [] } as any));
          } catch {
            // Already set to empty above
            eventsSnapshot = { empty: true, forEach: () => { }, docs: [] } as any;
          }
        }
      }
    } catch (error: any) {
      const errorCode = error?.code;
      const errorMessage = error?.message || '';
      
      // Handle FAILED_PRECONDITION (missing index) gracefully
      if (errorCode === 9 || errorCode === '9' || errorCode === 'FAILED_PRECONDITION' || errorMessage.includes('FAILED_PRECONDITION')) {
        console.warn('⚠️ [ScheduleContext] Missing Firestore index detected in outer catch. Query skipped:', {
          message: errorMessage,
          code: errorCode,
          organizationId,
          note: 'This usually means a Firestore index is missing. The function will continue with empty schedule context.'
        });
      } else {
        console.error('❌ [ScheduleContext] Critical error fetching events:', errorMessage, errorCode);
      }
      eventsSnapshot = { empty: true, forEach: () => { }, docs: [] } as any;
    }

    const linkedEvents: ScheduleContext['linkedEvents'] = [];
    const eventMap = new Map<string, any>();

    eventsSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      const eventData = doc.data();
      const event = { id: doc.id, ...eventData };
      eventMap.set(doc.id, event);

      // Check if event is linked to a pitch or story
      if (eventData.workflowId && eventData.workflowType) {
        const startDate = eventData.startDate?.toDate ? eventData.startDate.toDate() : new Date(eventData.startDate || Date.now());
        const endDate = eventData.endDate?.toDate ? (eventData.endDate.toDate()) : (eventData.endDate ? new Date(eventData.endDate) : undefined);

        linkedEvents.push({
          eventId: event.id,
          entityType: eventData.workflowType === 'pitch' ? 'pitch' : 'story',
          entityId: eventData.workflowId,
          title: eventData.title || 'Untitled Event',
          startDate,
          endDate,
          eventType: eventData.eventType,
          workflowType: eventData.workflowType
        });
      }
    });

    // Fetch all active pitches and stories
    // Wrap each query individually to prevent one failure from crashing the entire function
    let pitchesSnapshot: any = { empty: true, forEach: () => { }, docs: [] };
    let storiesSnapshot: any = { empty: true, forEach: () => { }, docs: [] };

    try {
      const results = await Promise.allSettled([
        db
          .collection('clipShowPitches')
          .where('organizationId', '==', organizationId)
          .limit(500)
          .get(),
        db
          .collection('clipShowStories')
          .where('organizationId', '==', organizationId)
          .limit(500)
          .get()
      ]);

      // Handle results from Promise.allSettled
      if (results[0].status === 'fulfilled') {
        pitchesSnapshot = results[0].value;
      } else {
        const error: any = results[0].reason;
        console.warn('⚠️ [ScheduleContext] Pitches query failed:', {
          message: error?.message,
          code: error?.code,
          organizationId
        });
        pitchesSnapshot = { empty: true, forEach: () => { }, docs: [] };
      }

      if (results[1].status === 'fulfilled') {
        storiesSnapshot = results[1].value;
      } else {
        const error: any = results[1].reason;
        console.warn('⚠️ [ScheduleContext] Stories query failed:', {
          message: error?.message,
          code: error?.code,
          organizationId
        });
        storiesSnapshot = { empty: true, forEach: () => { }, docs: [] };
      }
    } catch (error: any) {
      console.error('❌ [ScheduleContext] Error in Promise.allSettled:', error?.message || error);
      // Already set to empty above
    }

    const pitches: any[] = [];
    const stories: any[] = [];

    pitchesSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      pitches.push({ id: doc.id, ...doc.data() });
    });

    storiesSnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      stories.push({ id: doc.id, ...doc.data() });
    });

    // Build entity map for quick lookup
    const entityMap = new Map<string, { type: 'pitch' | 'story'; data: any }>();
    pitches.forEach(pitch => {
      entityMap.set(pitch.id, { type: 'pitch', data: pitch });
    });
    stories.forEach(story => {
      entityMap.set(story.id, { type: 'story', data: story });
    });

    // Find overdue items
    const overdueItems: ScheduleContext['overdueItems'] = [];
    if (includeOverdue) {
      for (const [entityId, entity] of entityMap) {
        const status = entity.data.status;
        const isComplete = isCompleteStatus(status, entity.type);

        if (isComplete) continue;

        const assignedUsers = getAssignedUsers(entity.data, entity.type);
        const title = entity.data.clipTitle || entity.data.title || 'Untitled';

        // Tenant-aware filtering: If userId provided, only include items assigned to that user
        if (userId && !assignedUsers.includes(userId)) {
          continue; // Skip items not assigned to the user
        }

        // Check 1: Overdue based on calendar event deadline
        const event = linkedEvents.find(e => e.entityId === entityId);
        if (event && event.startDate < now) {
          const daysOverdue = Math.floor((now.getTime() - event.startDate.getTime()) / (24 * 60 * 60 * 1000));

          overdueItems.push({
            entityType: entity.type,
            entityId,
            title,
            status,
            expectedCompletionDate: event.startDate,
            daysOverdue,
            assignedUsers
          });
          continue; // Don't double-count if it has both event and updatedAt issues
        }

        // Check 2: Overdue based on updatedAt (matching Dashboard logic)
        // Dashboard considers items overdue if they haven't been updated in 14+ days for active statuses
        if (entity.data.updatedAt) {
          const updatedAt = entity.data.updatedAt?.toDate ? entity.data.updatedAt.toDate() : new Date(entity.data.updatedAt);
          const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));

          // Active statuses that should be updated regularly
          const activeStatuses = entity.type === 'pitch'
            ? ['Pitched', 'Pursue Clearance', 'Working on License', 'Pending Signature']
            : ['Draft', 'Ready for Script', 'In Progress', 'Script Review', 'Scripting Notes',
              'Ready for Approval', 'A Roll', 'A Roll Notes', 'v1 Edit', 'v1 Notes',
              'v2 Edit', 'v2 Notes', 'v3 Edit', 'v3 Notes', 'v4 Edit', 'v4 Notes',
              'v5 Edit', 'v5 Notes', 'Ready for Build', 'RC', 'RC Notes'];

          // Flag as overdue if in active status and no update in 14+ days (matching Dashboard)
          if (activeStatuses.includes(status) && daysSinceUpdate >= 14) {
            overdueItems.push({
              entityType: entity.type,
              entityId,
              title,
              status,
              expectedCompletionDate: updatedAt, // Use last update as reference
              daysOverdue: daysSinceUpdate - 14, // Days beyond the 14-day threshold
              assignedUsers
            });
          }
        }
      }
    }

    // Find scheduling conflicts (multiple items due same day for same user)
    const conflicts: ScheduleContext['conflicts'] = [];
    if (includeConflicts) {
      const userDateMap = new Map<string, Map<string, any[]>>(); // user -> date -> items

      for (const [entityId, entity] of entityMap) {
        const event = linkedEvents.find(e => e.entityId === entityId);
        if (event) {
          const assignedUsers = getAssignedUsers(entity.data, entity.type);
          const eventDate = new Date(event.startDate);
          eventDate.setHours(0, 0, 0, 0);
          const dateKey = eventDate.toISOString().split('T')[0];

          assignedUsers.forEach(assignedUserId => {
            // Tenant-aware filtering: If userId provided, only track conflicts for that user
            if (userId && assignedUserId !== userId) {
              return; // Skip users that don't match the filter
            }

            if (!userDateMap.has(assignedUserId)) {
              userDateMap.set(assignedUserId, new Map());
            }
            const userDates = userDateMap.get(assignedUserId)!;
            if (!userDates.has(dateKey)) {
              userDates.set(dateKey, []);
            }
            userDates.get(dateKey)!.push({
              entityType: entity.type,
              entityId,
              title: entity.data.clipTitle || entity.data.title || 'Untitled',
              assignedUser: assignedUserId
            });
          });
        }
      }

      // Find dates with multiple items for same user
      userDateMap.forEach((dates, userId) => {
        dates.forEach((items, dateKey) => {
          if (items.length > 1) {
            const date = new Date(dateKey);
            const existingConflict = conflicts.find(c =>
              c.date.toISOString().split('T')[0] === dateKey
            );

            if (existingConflict) {
              // Add to existing conflict
              items.forEach(item => {
                if (!existingConflict.conflictingItems.some(ci => ci.entityId === item.entityId)) {
                  existingConflict.conflictingItems.push(item);
                }
              });
            } else {
              conflicts.push({
                date,
                conflictingItems: items
              });
            }
          }
        });
      });
    }

    // Find at-risk items (approaching deadlines)
    const atRiskItems: ScheduleContext['atRiskItems'] = [];
    if (includeAtRisk) {
      for (const [entityId, entity] of entityMap) {
        const event = linkedEvents.find(e => e.entityId === entityId);
        if (event && event.startDate >= now && event.startDate <= futureDate) {
          const status = entity.data.status;
          const isComplete = isCompleteStatus(status, entity.type);

          if (!isComplete) {
            const daysUntilDeadline = Math.ceil((event.startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            const assignedUsers = getAssignedUsers(entity.data, entity.type);

            // Tenant-aware filtering: If userId provided, only include items assigned to that user
            if (userId && !assignedUsers.includes(userId)) {
              continue; // Skip items not assigned to the user
            }

            atRiskItems.push({
              entityType: entity.type,
              entityId,
              title: entity.data.clipTitle || entity.data.title || 'Untitled',
              status,
              deadline: event.startDate,
              daysUntilDeadline,
              assignedUsers
            });
          }
        }
      }
    }

    // Build active items timeline
    const activeItemsTimeline: ScheduleContext['activeItemsTimeline'] = [];
    for (const [entityId, entity] of entityMap) {
      const status = entity.data.status;
      const isComplete = isCompleteStatus(status, entity.type);

      if (!isComplete) {
        const event = linkedEvents.find(e => e.entityId === entityId);
        const assignedUsers = getAssignedUsers(entity.data, entity.type);

        // Tenant-aware filtering: If userId provided, only include items assigned to that user
        if (userId && !assignedUsers.includes(userId)) {
          continue; // Skip items not assigned to the user
        }

        activeItemsTimeline.push({
          entityType: entity.type,
          entityId,
          title: entity.data.clipTitle || entity.data.title || 'Untitled',
          status,
          deadline: event?.startDate,
          daysUntilDeadline: event?.startDate ?
            Math.ceil((event.startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) :
            undefined,
          assignedUsers
        });
      }
    }

    // Sort timeline by deadline (soonest first)
    activeItemsTimeline.sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0;
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return a.deadline.getTime() - b.deadline.getTime();
    });

    return {
      linkedEvents,
      overdueItems: overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue),
      conflicts: conflicts.sort((a, b) => a.date.getTime() - b.date.getTime()),
      atRiskItems: atRiskItems.sort((a, b) => (a.daysUntilDeadline || 0) - (b.daysUntilDeadline || 0)),
      activeItemsTimeline
    };
  } catch (outerError: any) {
    // Ultimate fallback - catch any error that wasn't caught by inner try-catch
    const errorCode = outerError?.code;
    const errorMessage = outerError?.message || '';

    // Handle Firestore FAILED_PRECONDITION errors (usually missing indexes)
    if (errorCode === 9 || errorCode === '9' || errorCode === 'FAILED_PRECONDITION' || errorMessage.includes('FAILED_PRECONDITION')) {
      console.warn('⚠️ [ScheduleContext] Firestore FAILED_PRECONDITION error (likely missing index):', {
        message: errorMessage,
        code: errorCode,
        organizationId,
        note: 'This usually means a Firestore index is missing. The function will continue with empty schedule context.'
      });
      // Return empty context instead of throwing - this allows the function to continue
      return emptyContext;
    }

    console.error('❌ [ScheduleContext] Outer catch - unexpected error:', {
      message: errorMessage,
      code: errorCode,
      stack: outerError?.stack,
      organizationId
    });
    // Always return empty context - never throw
    return emptyContext;
  }
}

/**
 * Check if a status represents a completed item
 */
function isCompleteStatus(status: string, entityType: 'pitch' | 'story'): boolean {
  if (entityType === 'pitch') {
    return status === 'Killed' || status === 'Do Not Pursue Clearance' || status === 'Ready for Script';
  } else {
    return status === 'Assembled' || status === 'Killed';
  }
}

/**
 * Extract assigned user IDs from entity data
 */
function getAssignedUsers(data: any, entityType: 'pitch' | 'story'): string[] {
  const users: string[] = [];

  if (entityType === 'pitch') {
    if (data.assignedProducerId) users.push(data.assignedProducerId);
    if (data.assignedWriterId) users.push(data.assignedWriterId);
    if (data.assignedAPId) users.push(data.assignedAPId);
    if (data.assignedResearcherId) users.push(data.assignedResearcherId);
    if (data.assignedClearanceCoordinatorId) users.push(data.assignedClearanceCoordinatorId);
    if (data.assignedLicensingSpecialistId) users.push(data.assignedLicensingSpecialistId);
    if (data.assignedContacts && Array.isArray(data.assignedContacts)) {
      users.push(...data.assignedContacts);
    }
  } else {
    if (data.writerId) users.push(data.writerId);
    if (data.editorId) users.push(data.editorId);
    if (data.producerId) users.push(data.producerId);
    if (data.associateProducerId) users.push(data.associateProducerId);
    if (data.assignedContacts && Array.isArray(data.assignedContacts)) {
      users.push(...data.assignedContacts);
    }
  }

  // Remove duplicates
  return Array.from(new Set(users));
}

