/**
 * Calendar Triggers for Clip Show Pro
 * 
 * Firebase Functions that automatically create and update calendar events
 * when pitches, stories, and clearances are created or updated
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getPhaseColor, getPhaseCategoryFromPitchStatus, getPhaseCategoryFromClearanceStatus, PhaseCategory } from './calendarPhaseColors';
import { extractAllDates, getRelatedData, toDate } from './calendarDataExtractor';

const db = getFirestore();

/**
 * Create calendar event for a pitch
 */
async function createPitchCalendarEvent(
  pitch: any,
  startDate: Date,
  previousEventId?: string
): Promise<string> {
  const pitchId = pitch.id;
  const organizationId = pitch.organizationId;
  const projectId = pitch.projectId || 'default-project';
  
  // Determine phase category and color
  const phaseCategory = getPhaseCategoryFromPitchStatus(pitch.status);
  const phaseColor = getPhaseColor(pitch.status, phaseCategory);
  
  // Get assigned contacts
  const assignedContacts: string[] = [];
  if (pitch.assignedProducerId) assignedContacts.push(pitch.assignedProducerId);
  if (pitch.assignedWriterId) assignedContacts.push(pitch.assignedWriterId);
  if (pitch.assignedAPId) assignedContacts.push(pitch.assignedAPId);
  if (pitch.assignedLicensingSpecialistId) assignedContacts.push(pitch.assignedLicensingSpecialistId);
  
  // Create event title based on status
  let eventTitle = `Pitch: ${pitch.clipTitle}`;
  if (pitch.status === 'License Cleared') {
    eventTitle = `Clearance Complete: ${pitch.clipTitle}`;
  } else if (pitch.status === 'Ready for Script') {
    eventTitle = `Ready for Script: ${pitch.clipTitle}`;
  } else if (pitch.status === 'Script Complete') {
    eventTitle = `Script Complete: ${pitch.clipTitle}`;
  } else if (pitch.status === 'V1 Cut') {
    eventTitle = `V1 Cut: ${pitch.clipTitle}`;
  } else if (pitch.status === 'Ready for Build') {
    eventTitle = `Ready for Build: ${pitch.clipTitle}`;
  }
  
  // Build description
  let description = `Pitch for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
  if (pitch.status === 'License Cleared') {
    description = `Clearance completed for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
  } else if (pitch.status === 'Ready for Script') {
    description = `Ready to assign writer for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
  }
  
  // Create calendar event
  const eventData = {
    title: eventTitle,
    description: description,
    startDate: Timestamp.fromDate(startDate),
    endDate: null,
    location: '',
    eventType: 'pitch' as const,
    projectId: projectId,
    organizationId: organizationId,
    createdBy: pitch.createdBy || 'system',
    assignedContacts: [...new Set(assignedContacts)], // Remove duplicates
    isRecurring: false,
    recurrencePattern: null,
    workflowId: pitchId,
    workflowType: 'pitch' as const,
    workflowStatus: pitch.status,
    priority: pitch.priority === 'High' || pitch.priority === 'Urgent' ? 'high' : 
              pitch.priority === 'Low' ? 'low' : 'medium',
    tags: [
      ...(pitch.tags || []),
      pitch.show?.toLowerCase().replace(/\s+/g, '-') || 'unknown-show',
      'pitch-workflow'
    ].filter(Boolean),
    // New fields for phase tracking
    phaseColor: phaseColor,
    phaseCategory: phaseCategory,
    archived: false,
    previousEventId: previousEventId || null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
  
  const eventRef = await db.collection('calendarEvents').add(eventData);
  console.log(`✅ Created calendar event ${eventRef.id} for pitch ${pitchId}`);
  
  return eventRef.id;
}

/**
 * Archive existing calendar event for a pitch
 */
async function archivePitchCalendarEvent(pitchId: string, newStatus: string): Promise<string | null> {
  try {
    // Find active calendar event for this pitch
    const eventsQuery = await db.collection('calendarEvents')
      .where('workflowId', '==', pitchId)
      .where('workflowType', '==', 'pitch')
      .where('archived', '==', false)
      .limit(1)
      .get();
    
    if (eventsQuery.empty) {
      console.log(`⚠️ No active calendar event found for pitch ${pitchId}`);
      return null;
    }
    
    const eventDoc = eventsQuery.docs[0];
    const eventId = eventDoc.id;
    
    // Archive the event
    await eventDoc.ref.update({
      archived: true,
      archivedAt: Timestamp.now(),
      archivedReason: `Phase changed to ${newStatus}`
    });
    
    console.log(`📦 Archived calendar event ${eventId} for pitch ${pitchId}`);
    return eventId;
  } catch (error) {
    console.error(`❌ Error archiving calendar event for pitch ${pitchId}:`, error);
    return null;
  }
}

/**
 * Update existing calendar event with new pitch data (without archiving)
 */
async function updatePitchCalendarEvent(pitchId: string, pitch: any): Promise<void> {
  try {
    // Find active calendar event for this pitch
    const eventsQuery = await db.collection('calendarEvents')
      .where('workflowId', '==', pitchId)
      .where('workflowType', '==', 'pitch')
      .where('archived', '==', false)
      .limit(1)
      .get();
    
    if (eventsQuery.empty) {
      console.log(`⚠️ No active calendar event found for pitch ${pitchId}, creating new one`);
      // Create new event if none exists
      const createdAt = pitch.createdAt?.toDate() || new Date();
      await createPitchCalendarEvent(pitch, createdAt);
      return;
    }
    
    const eventDoc = eventsQuery.docs[0];
    
    // Determine phase category and color
    const phaseCategory = getPhaseCategoryFromPitchStatus(pitch.status);
    const phaseColor = getPhaseColor(pitch.status, phaseCategory);
    
    // Get assigned contacts
    const assignedContacts: string[] = [];
    if (pitch.assignedProducerId) assignedContacts.push(pitch.assignedProducerId);
    if (pitch.assignedWriterId) assignedContacts.push(pitch.assignedWriterId);
    if (pitch.assignedAPId) assignedContacts.push(pitch.assignedAPId);
    if (pitch.assignedLicensingSpecialistId) assignedContacts.push(pitch.assignedLicensingSpecialistId);
    
    // Create event title based on status
    let eventTitle = `Pitch: ${pitch.clipTitle}`;
    if (pitch.status === 'License Cleared') {
      eventTitle = `Clearance Complete: ${pitch.clipTitle}`;
    } else if (pitch.status === 'Ready for Script') {
      eventTitle = `Ready for Script: ${pitch.clipTitle}`;
    } else if (pitch.status === 'Script Complete') {
      eventTitle = `Script Complete: ${pitch.clipTitle}`;
    } else if (pitch.status === 'V1 Cut') {
      eventTitle = `V1 Cut: ${pitch.clipTitle}`;
    } else if (pitch.status === 'Ready for Build') {
      eventTitle = `Ready for Build: ${pitch.clipTitle}`;
    }
    
    // Build description
    let description = `Pitch for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
    if (pitch.status === 'License Cleared') {
      description = `Clearance completed for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
    } else if (pitch.status === 'Ready for Script') {
      description = `Ready to assign writer for ${pitch.show || 'Unknown Show'} ${pitch.season || ''}`;
    }
    
    // Update the calendar event
    await eventDoc.ref.update({
      title: eventTitle,
      description: description,
      assignedContacts: [...new Set(assignedContacts)],
      workflowStatus: pitch.status,
      priority: pitch.priority === 'High' || pitch.priority === 'Urgent' ? 'high' : 
                pitch.priority === 'Low' ? 'low' : 'medium',
      tags: [
        ...(pitch.tags || []),
        pitch.show?.toLowerCase().replace(/\s+/g, '-') || 'unknown-show',
        'pitch-workflow'
      ].filter(Boolean),
      phaseColor: phaseColor,
      phaseCategory: phaseCategory,
      updatedAt: Timestamp.now()
    });
    
    console.log(`✅ Updated calendar event ${eventDoc.id} for pitch ${pitchId}`);
  } catch (error) {
    console.error(`❌ Error updating calendar event for pitch ${pitchId}:`, error);
  }
}

/**
 * Trigger: Create calendar event when pitch is created
 */
export const onPitchCreated = onDocumentCreated('clipShowPitches/{pitchId}', async (event) => {
  try {
    const pitchId = event.params.pitchId;
    const pitch = event.data?.data();
    
    if (!pitch) {
      console.error(`❌ No pitch data found for ${pitchId}`);
      return;
    }
    
    console.log(`📅 Creating calendar event for new pitch: ${pitch.clipTitle}`);
    
    // Use pitch creation date as start date
    const createdAt = pitch.createdAt?.toDate() || new Date();
    
    // Create initial calendar event
    await createPitchCalendarEvent(pitch, createdAt);
    
    console.log(`✅ Calendar event created for pitch ${pitchId}`);
  } catch (error) {
    console.error(`❌ Error creating calendar event for pitch:`, error);
  }
});

/**
 * Trigger: Update calendar event when pitch data changes
 */
export const onPitchUpdated = onDocumentUpdated('clipShowPitches/{pitchId}', async (event) => {
  try {
    const pitchId = event.params.pitchId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    
    if (!before || !after) {
      console.error(`❌ Missing pitch data for ${pitchId}`);
      return;
    }
    
    // Check if status changed
    const statusChanged = before.status !== after.status;
    
    // Check if other important fields changed
    const dataChanged = 
      before.clipTitle !== after.clipTitle ||
      before.show !== after.show ||
      before.season !== after.season ||
      before.priority !== after.priority ||
      before.assignedProducerId !== after.assignedProducerId ||
      before.assignedWriterId !== after.assignedWriterId ||
      before.assignedAPId !== after.assignedAPId ||
      before.assignedLicensingSpecialistId !== after.assignedLicensingSpecialistId ||
      JSON.stringify(before.tags || []) !== JSON.stringify(after.tags || []);
    
    if (!statusChanged && !dataChanged) {
      // No relevant changes, skip calendar update
      return;
    }
    
    if (statusChanged) {
      console.log(`🔄 Pitch ${pitchId} status changed: ${before.status} → ${after.status}`);
      
      // Archive existing calendar event
      const archivedEventId = await archivePitchCalendarEvent(pitchId, after.status);
      
      // Extract dates from related data
      const dates = await extractAllDates({ ...after, id: pitchId });
      
      // Determine start date for new event
      // Use updatedAt (when phase changed) as per requirement 4a
      const startDate = after.updatedAt?.toDate() || dates.primaryDate || new Date();
      
      // Create new calendar event with updated phase
      await createPitchCalendarEvent({ ...after, id: pitchId }, startDate, archivedEventId || undefined);
      
      console.log(`✅ Calendar event updated for pitch ${pitchId} (status change)`);
    } else if (dataChanged) {
      console.log(`🔄 Pitch ${pitchId} data changed (title, show, season, etc.)`);
      
      // Update existing calendar event with new data
      await updatePitchCalendarEvent(pitchId, { ...after, id: pitchId });
      
      console.log(`✅ Calendar event data synced for pitch ${pitchId}`);
    }
  } catch (error) {
    console.error(`❌ Error updating calendar event for pitch:`, error);
  }
});

/**
 * Trigger: Update calendar event when story status changes
 * Cascades to pitch calendar event
 */
export const onStoryUpdated = onDocumentUpdated('clipShowStories/{storyId}', async (event) => {
  try {
    const storyId = event.params.storyId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    
    if (!before || !after) {
      return;
    }
    
    // Check if status changed
    if (before.status === after.status) {
      return;
    }
    
    const clipPitchId = after.clipPitchId || before.clipPitchId;
    if (!clipPitchId) {
      console.log(`⚠️ Story ${storyId} has no associated pitch`);
      return;
    }
    
    console.log(`🔄 Story ${storyId} status changed: ${before.status} → ${after.status}`);
    console.log(`   Cascading to pitch ${clipPitchId}`);
    
    // Get the pitch
    const pitchDoc = await db.collection('clipShowPitches').doc(clipPitchId).get();
    if (!pitchDoc.exists) {
      console.log(`⚠️ Pitch ${clipPitchId} not found`);
      return;
    }
    
    const pitch = pitchDoc.data();
    if (!pitch) return;
    
    // Update pitch status if story status indicates a phase change
    // Map story statuses to pitch statuses
    let pitchStatus: string | null = null;
    
    if (after.status === 'Script Complete') {
      pitchStatus = 'Script Complete';
    } else if (after.status === 'Ready for Build') {
      pitchStatus = 'Ready for Build';
    } else if (after.status.includes('v1') || after.status === 'V1 Cut') {
      pitchStatus = 'V1 Cut';
    }
    
    // If pitch status should update, trigger pitch update
    if (pitchStatus && pitch.status !== pitchStatus) {
      // Update pitch status
      await pitchDoc.ref.update({
        status: pitchStatus,
        updatedAt: Timestamp.now()
      });
      
      // The onPitchUpdated trigger will handle calendar event update
      console.log(`✅ Updated pitch ${clipPitchId} status to ${pitchStatus}`);
    } else {
      // Just update the calendar event date without changing phase
      const dates = await extractAllDates({ ...pitch, id: clipPitchId });
      const startDate = after.updatedAt?.toDate() || dates.primaryDate || new Date();
      
      // Archive and recreate calendar event
      const archivedEventId = await archivePitchCalendarEvent(clipPitchId, pitch.status);
      await createPitchCalendarEvent({ ...pitch, id: clipPitchId }, startDate, archivedEventId || undefined);
    }
  } catch (error) {
    console.error(`❌ Error updating calendar event for story:`, error);
  }
});

/**
 * Create calendar event for a license agreement (clearance)
 */
async function createClearanceCalendarEvent(
  clearance: any,
  startDate: Date,
  previousEventId?: string
): Promise<string> {
  const clearanceId = clearance.id;
  const organizationId = clearance.organizationId;
  const projectId = clearance.projectId || 'default-project';
  const clipPitchId = clearance.clipPitchId;
  
  // Determine phase category and color
  const phaseCategory = getPhaseCategoryFromClearanceStatus(clearance.status);
  const phaseColor = getPhaseColor(clearance.status, phaseCategory);
  
  // Get assigned contacts
  const assignedContacts: string[] = [];
  if (clearance.licensingContactId) assignedContacts.push(clearance.licensingContactId);
  if (clearance.createdBy) assignedContacts.push(clearance.createdBy);
  
  // Create event title based on status
  let eventTitle = `Clearance: ${clearance.licensor || 'Unknown Licensor'}`;
  if (clearance.status === 'Draft') {
    eventTitle = `Clearance Draft: ${clearance.licensor || 'Unknown Licensor'}`;
  } else if (clearance.status === 'Pending') {
    eventTitle = `Clearance Pending: ${clearance.licensor || 'Unknown Licensor'}`;
  } else if (clearance.status === 'Signed') {
    eventTitle = `Clearance Signed: ${clearance.licensor || 'Unknown Licensor'}`;
  } else if (clearance.status === 'Expired') {
    eventTitle = `Clearance Expired: ${clearance.licensor || 'Unknown Licensor'}`;
  } else if (clearance.status === 'Cancelled') {
    eventTitle = `Clearance Cancelled: ${clearance.licensor || 'Unknown Licensor'}`;
  }
  
  // Build description
  let description = `License agreement with ${clearance.licensor || 'Unknown Licensor'}`;
  if (clearance.fee) {
    description += ` - Fee: $${clearance.fee}`;
  }
  if (clipPitchId) {
    // Try to get pitch title for context
    try {
      const pitchDoc = await db.collection('clipShowPitches').doc(clipPitchId).get();
      if (pitchDoc.exists) {
        const pitch = pitchDoc.data();
        description += ` - Pitch: ${pitch?.clipTitle || 'Unknown'}`;
      }
    } catch (error) {
      // Ignore errors fetching pitch
    }
  }
  
  // Create calendar event
  const eventData = {
    title: eventTitle,
    description: description,
    startDate: Timestamp.fromDate(startDate),
    endDate: clearance.expirationDate || null,
    location: '',
    eventType: 'clearance' as const,
    projectId: projectId,
    organizationId: organizationId,
    createdBy: clearance.createdBy || 'system',
    assignedContacts: [...new Set(assignedContacts)],
    isRecurring: false,
    recurrencePattern: null,
    workflowId: clearanceId,
    workflowType: 'clearance' as const,
    workflowStatus: clearance.status,
    priority: clearance.fee && clearance.fee > 10000 ? 'high' : 'medium',
    tags: [
      'clearance',
      'license-agreement',
      clearance.licensor?.toLowerCase().replace(/\s+/g, '-') || 'unknown-licensor',
      clearance.status.toLowerCase()
    ].filter(Boolean),
    // Phase tracking fields
    phaseColor: phaseColor,
    phaseCategory: phaseCategory,
    archived: false,
    previousEventId: previousEventId || null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  };
  
  const eventRef = await db.collection('calendarEvents').add(eventData);
  console.log(`✅ Created calendar event ${eventRef.id} for clearance ${clearanceId}`);
  
  return eventRef.id;
}

/**
 * Archive existing calendar event for a clearance
 */
async function archiveClearanceCalendarEvent(clearanceId: string, newStatus: string): Promise<string | null> {
  try {
    const eventsQuery = await db.collection('calendarEvents')
      .where('workflowId', '==', clearanceId)
      .where('workflowType', '==', 'clearance')
      .where('archived', '==', false)
      .limit(1)
      .get();
    
    if (eventsQuery.empty) {
      console.log(`⚠️ No active calendar event found for clearance ${clearanceId}`);
      return null;
    }
    
    const eventDoc = eventsQuery.docs[0];
    const eventId = eventDoc.id;
    
    await eventDoc.ref.update({
      archived: true,
      archivedAt: Timestamp.now(),
      archivedReason: `Status changed to ${newStatus}`
    });
    
    console.log(`📦 Archived calendar event ${eventId} for clearance ${clearanceId}`);
    return eventId;
  } catch (error) {
    console.error(`❌ Error archiving calendar event for clearance ${clearanceId}:`, error);
    return null;
  }
}

/**
 * Trigger: Create calendar event when license agreement is created
 */
export const onClearanceCreated = onDocumentCreated('licenseAgreements/{clearanceId}', async (event) => {
  try {
    const clearanceId = event.params.clearanceId;
    const clearance = event.data?.data();
    
    if (!clearance) {
      console.error(`❌ No clearance data found for ${clearanceId}`);
      return;
    }
    
    console.log(`📅 Creating calendar event for new clearance: ${clearance.licensor}`);
    
    // Use clearance creation date or signed date as start date
    const startDate = clearance.signedDate?.toDate() || 
                     clearance.createdAt?.toDate() || 
                     new Date();
    
    await createClearanceCalendarEvent({ ...clearance, id: clearanceId }, startDate);
    
    console.log(`✅ Calendar event created for clearance ${clearanceId}`);
  } catch (error) {
    console.error(`❌ Error creating calendar event for clearance:`, error);
  }
});

/**
 * Trigger: Update calendar event when clearance status changes
 * Cascades to pitch calendar event
 */
export const onClearanceUpdated = onDocumentUpdated('licenseAgreements/{clearanceId}', async (event) => {
  try {
    const clearanceId = event.params.clearanceId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    
    if (!before || !after) {
      return;
    }
    
    // Check if status changed
    const statusChanged = before.status !== after.status;
    
    // Check if other important fields changed
    const dataChanged = 
      before.licensor !== after.licensor ||
      before.fee !== after.fee ||
      before.signedDate !== after.signedDate ||
      before.expirationDate !== after.expirationDate ||
      before.licensingContactId !== after.licensingContactId;
    
    if (statusChanged) {
      console.log(`🔄 Clearance ${clearanceId} status changed: ${before.status} → ${after.status}`);
      
      // Archive existing calendar event for the clearance
      const archivedEventId = await archiveClearanceCalendarEvent(clearanceId, after.status);
      
      // Determine start date for new event
      const startDate = after.signedDate?.toDate() || 
                       after.updatedAt?.toDate() || 
                       after.createdAt?.toDate() || 
                       new Date();
      
      // Create new calendar event with updated status
      await createClearanceCalendarEvent({ ...after, id: clearanceId }, startDate, archivedEventId || undefined);
      
      console.log(`✅ Calendar event updated for clearance ${clearanceId} (status change)`);
    } else if (dataChanged) {
      console.log(`🔄 Clearance ${clearanceId} data changed (licensor, fee, dates, etc.)`);
      
      // Update existing calendar event or create if missing
      const eventsQuery = await db.collection('calendarEvents')
        .where('workflowId', '==', clearanceId)
        .where('workflowType', '==', 'clearance')
        .where('archived', '==', false)
        .limit(1)
        .get();
      
      if (eventsQuery.empty) {
        // Create new event if none exists
        const startDate = after.signedDate?.toDate() || 
                         after.createdAt?.toDate() || 
                         new Date();
        await createClearanceCalendarEvent({ ...after, id: clearanceId }, startDate);
      } else {
        // Update existing event
        const eventDoc = eventsQuery.docs[0];
        const phaseCategory = getPhaseCategoryFromClearanceStatus(after.status);
        const phaseColor = getPhaseColor(after.status, phaseCategory);
        
        const assignedContacts: string[] = [];
        if (after.licensingContactId) assignedContacts.push(after.licensingContactId);
        if (after.createdBy) assignedContacts.push(after.createdBy);
        
        let eventTitle = `Clearance: ${after.licensor || 'Unknown Licensor'}`;
        if (after.status === 'Draft') {
          eventTitle = `Clearance Draft: ${after.licensor || 'Unknown Licensor'}`;
        } else if (after.status === 'Pending') {
          eventTitle = `Clearance Pending: ${after.licensor || 'Unknown Licensor'}`;
        } else if (after.status === 'Signed') {
          eventTitle = `Clearance Signed: ${after.licensor || 'Unknown Licensor'}`;
        } else if (after.status === 'Expired') {
          eventTitle = `Clearance Expired: ${after.licensor || 'Unknown Licensor'}`;
        } else if (after.status === 'Cancelled') {
          eventTitle = `Clearance Cancelled: ${after.licensor || 'Unknown Licensor'}`;
        }
        
        let description = `License agreement with ${after.licensor || 'Unknown Licensor'}`;
        if (after.fee) {
          description += ` - Fee: $${after.fee}`;
        }
        
        await eventDoc.ref.update({
          title: eventTitle,
          description: description,
          assignedContacts: [...new Set(assignedContacts)],
          workflowStatus: after.status,
          endDate: after.expirationDate || null,
          phaseColor: phaseColor,
          phaseCategory: phaseCategory,
          priority: after.fee && after.fee > 10000 ? 'high' : 'medium',
          updatedAt: Timestamp.now()
        });
      }
      
      console.log(`✅ Calendar event synced for clearance ${clearanceId}`);
    }
    
    // Also handle pitch calendar event update (existing logic)
    const clipPitchId = after.clipPitchId || before.clipPitchId;
    if (clipPitchId) {
      const pitchDoc = await db.collection('clipShowPitches').doc(clipPitchId).get();
      if (pitchDoc.exists) {
        const pitch = pitchDoc.data();
        if (!pitch) return;
        
        // Update pitch status if clearance is signed
        if (after.status === 'Signed' && pitch.status !== 'License Cleared') {
          await pitchDoc.ref.update({
            status: 'License Cleared',
            clearedAt: Timestamp.now(),
            clearedBy: after.createdBy || 'system',
            updatedAt: Timestamp.now()
          });
          
          // The onPitchUpdated trigger will handle calendar event update
          console.log(`✅ Updated pitch ${clipPitchId} status to License Cleared`);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error updating calendar event for clearance:`, error);
  }
});

