/**
 * Record Detail Formatter
 * 
 * Utility for formatting record details into professional HTML for automation emails
 */

interface RecordDetails {
  title: string;
  sections: Array<{
    heading: string;
    fields: Array<{ label: string; value: string }>;
  }>;
}

interface Show {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
  organizationId: string;
}

interface Season {
  id: string;
  showId: string;
  seasonNumber: number;
  name: string;
  description?: string;
  startDate?: any;
  endDate?: any;
  status: string;
  episodes?: any[];
  createdAt: any;
  updatedAt: any;
  organizationId: string;
}

interface ProductionStory {
  id: string;
  clipPitchId: string;
  clipTitle: string;
  sourceLink: string;
  show: string;
  season: string;
  clipType: string;
  categories: string[];
  writerId: string;
  writerRole: string;
  associateProducerId: string;
  associateProducerRole: string;
  producerId: string;
  producerRole: string;
  status: string;
  scriptContent?: string;
  clearanceNotes?: string;
  producerNotes?: string;
  createdAt: any;
  updatedAt: any;
  organizationId: string;
}

interface ClipPitch {
  id: string;
  clipTitle: string;
  sourceLink: string;
  show: string;
  season: string;
  episode?: string;
  clipType: string;
  categories: string[];
  researchNotes: string;
  producerNotes?: string;
  clearanceNotes?: string;
  status: string;
  priority: string;
  estimatedDuration?: number;
  tags: string[];
  assignedProducerId?: string;
  assignedProducerRole?: string;
  assignedWriterId?: string;
  assignedWriterRole?: string;
  assignedAPId?: string;
  assignedAPRole?: string;
  assignedLicensingSpecialistId?: string;
  createdAt: any;
  updatedAt: any;
  organizationId: string;
}

function formatDate(date: any): string {
  if (!date) return 'N/A';
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(date);
  }
}

function formatStatus(status: string): string {
  return status || 'N/A';
}

function formatShowDetails(show: Show, context: any): RecordDetails {
  const sections: RecordDetails['sections'] = [];

  // Basic Information
  sections.push({
    heading: 'Basic Information',
    fields: [
      { label: 'Show Name', value: show.name || 'N/A' },
      { label: 'Description', value: show.description || 'No description' },
      { label: 'Active Status', value: show.isActive ? 'Active' : 'Inactive' },
      { label: 'Organization ID', value: show.organizationId || 'N/A' }
    ]
  });

  // Timeline
  sections.push({
    heading: 'Timeline',
    fields: [
      { label: 'Created', value: formatDate(show.createdAt) },
      { label: 'Last Updated', value: formatDate(show.updatedAt) },
      { label: 'Performed By', value: context.performedByName || context.performedBy || 'System' }
    ]
  });

  return {
    title: 'Show Details',
    sections
  };
}

function formatSeasonDetails(season: Season, context: any): RecordDetails {
  const sections: RecordDetails['sections'] = [];

  // Basic Information
  sections.push({
    heading: 'Basic Information',
    fields: [
      { label: 'Season Number', value: season.seasonNumber?.toString() || 'N/A' },
      { label: 'Season Name', value: season.name || 'N/A' },
      { label: 'Description', value: season.description || 'No description' },
      { label: 'Status', value: formatStatus(season.status) }
    ]
  });

  // Production Details
  sections.push({
    heading: 'Production Details',
    fields: [
      { label: 'Episode Count', value: season.episodes?.length?.toString() || '0' },
      { label: 'Start Date', value: season.startDate ? formatDate(season.startDate) : 'TBD' },
      { label: 'End Date', value: season.endDate ? formatDate(season.endDate) : 'TBD' }
    ]
  });

  // Timeline
  sections.push({
    heading: 'Timeline',
    fields: [
      { label: 'Created', value: formatDate(season.createdAt) },
      { label: 'Last Updated', value: formatDate(season.updatedAt) },
      { label: 'Performed By', value: context.performedByName || context.performedBy || 'System' }
    ]
  });

  return {
    title: 'Season Details',
    sections
  };
}

function formatStoryDetails(story: ProductionStory, context: any): RecordDetails {
  const sections: RecordDetails['sections'] = [];

  // Story Information
  sections.push({
    heading: 'Story Information',
    fields: [
      { label: 'Title', value: story.clipTitle || 'N/A' },
      { label: 'Show', value: story.show || 'N/A' },
      { label: 'Season', value: story.season || 'N/A' },
      { label: 'Clip Type', value: story.clipType || 'N/A' },
      { label: 'Status', value: formatStatus(story.status) }
    ]
  });

  // Content
  sections.push({
    heading: 'Content',
    fields: [
      { label: 'Source Link', value: story.sourceLink || 'N/A' },
      { label: 'Script Length', value: story.scriptContent?.length ? `${Math.round(story.scriptContent.length / 1000)}k characters` : 'No script content' },
      { label: 'Categories', value: Array.isArray(story.categories) ? story.categories.join(', ') : 'None' }
    ]
  });

  // Notes
  sections.push({
    heading: 'Notes',
    fields: [
      { label: 'Producer Notes', value: story.producerNotes || 'None' },
      { label: 'Clearance Notes', value: story.clearanceNotes || 'None' }
    ]
  });

  // Timeline
  sections.push({
    heading: 'Timeline',
    fields: [
      { label: 'Created', value: formatDate(story.createdAt) },
      { label: 'Last Updated', value: formatDate(story.updatedAt) },
      { label: 'Performed By', value: context.performedByName || context.performedBy || 'System' }
    ]
  });

  return {
    title: 'Story Details',
    sections
  };
}

function formatPitchDetails(pitch: ClipPitch, context: any): RecordDetails {
  const sections: RecordDetails['sections'] = [];

  // Pitch Information
  sections.push({
    heading: 'Pitch Information',
    fields: [
      { label: 'Title', value: pitch.clipTitle || 'N/A' },
      { label: 'Show', value: pitch.show || 'N/A' },
      { label: 'Season', value: pitch.season || 'N/A' },
      { label: 'Episode', value: pitch.episode || 'N/A' },
      { label: 'Status', value: formatStatus(pitch.status) },
      { label: 'Priority', value: pitch.priority || 'Medium' }
    ]
  });

  // Content Details
  sections.push({
    heading: 'Content Details',
    fields: [
      { label: 'Source Link', value: pitch.sourceLink || 'N/A' },
      { label: 'Clip Type', value: pitch.clipType || 'N/A' },
      { label: 'Categories', value: Array.isArray(pitch.categories) ? pitch.categories.join(', ') : 'None' },
      { label: 'Estimated Duration', value: pitch.estimatedDuration ? `${pitch.estimatedDuration} seconds` : 'N/A' },
      { label: 'Tags', value: Array.isArray(pitch.tags) ? pitch.tags.join(', ') : 'None' }
    ]
  });

  // Notes
  sections.push({
    heading: 'Notes',
    fields: [
      { label: 'Research Notes', value: pitch.researchNotes || 'None' },
      { label: 'Producer Notes', value: pitch.producerNotes || 'None' },
      { label: 'Clearance Notes', value: pitch.clearanceNotes || 'None' }
    ]
  });

  // Timeline
  sections.push({
    heading: 'Timeline',
    fields: [
      { label: 'Created', value: formatDate(pitch.createdAt) },
      { label: 'Last Updated', value: formatDate(pitch.updatedAt) },
      { label: 'Performed By', value: context.performedByName || context.performedBy || 'System' }
    ]
  });

  return {
    title: 'Pitch Details',
    sections
  };
}

/**
 * Generate HTML for record details
 */
export function generateDetailsHTML(details: RecordDetails): string {
  let html = `
    <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px;">
      <h2 style="font-size: 18px; font-weight: 600; color: #667eea; margin: 0 0 20px 0;">📋 ${details.title}</h2>
  `;

  details.sections.forEach((section, idx) => {
    html += `
      <div style="margin-bottom: ${idx === details.sections.length - 1 ? '0' : '20px'}">
        <h3 style="font-size: 14px; font-weight: 600; color: #555; margin: 0 0 10px 0;">${section.heading}</h3>
        <table style="width: 100%; border-collapse: collapse;">
    `;

    section.fields.forEach(field => {
      html += `
        <tr>
          <td style="padding: 8px 12px; font-weight: 600; color: #555; width: 40%; border-bottom: 1px solid #e0e0e0;">${field.label}:</td>
          <td style="padding: 8px 12px; color: #333; border-bottom: 1px solid #e0e0e0;">${field.value}</td>
        </tr>
      `;
    });

    html += `
        </table>
      </div>
    `;
  });

  html += `</div>`;

  return html;
}

/**
 * Generate action summary HTML section
 */
function generateActionSummaryHTML(context: any): string {
  const functionName = context.functionName || context.functionId || 'Automation';
  const performedBy = context.performedByName || context.performedBy || 'System';
  const performedAt = context.performedAt || new Date().toLocaleString();
  
  // Determine action type and description
  let actionDescription = functionName;
  let actionIcon = '⚙️';
  let changeDetails: string[] = [];
  
  // Status change
  if (context.oldStatus && context.newStatus) {
    actionDescription = `Status Changed: ${context.oldStatus} → ${context.newStatus}`;
    actionIcon = '🔄';
    changeDetails.push(`<strong>Previous Status:</strong> ${context.oldStatus}`);
    changeDetails.push(`<strong>New Status:</strong> ${context.newStatus}`);
    
    if (context.reason) {
      changeDetails.push(`<strong>Reason:</strong> ${context.reason}`);
    }
  }
  // Assignment
  else if (context.producerId || context.assignedProducerId) {
    actionDescription = `Producer Assigned`;
    actionIcon = '👤';
    if (context.producerId) {
      changeDetails.push(`<strong>Assigned Producer ID:</strong> ${context.producerId}`);
    }
  }
  // Record creation
  else if (functionName.toLowerCase().includes('create') || functionName.toLowerCase().includes('save')) {
    actionDescription = 'Record Created';
    actionIcon = '➕';
  }
  // Record update
  else if (functionName.toLowerCase().includes('update') || functionName.toLowerCase().includes('edit')) {
    actionDescription = 'Record Updated';
    actionIcon = '✏️';
  }
  
  // Record identification
  const recordInfo: string[] = [];
  if (context.pitch && typeof context.pitch === 'object') {
    recordInfo.push(`<strong>Pitch:</strong> ${context.pitch.clipTitle || context.pitch.id || 'N/A'}`);
    if (context.pitch.show) recordInfo.push(`<strong>Show:</strong> ${context.pitch.show}`);
    if (context.pitch.season) recordInfo.push(`<strong>Season:</strong> ${context.pitch.season}`);
  } else if (context.story && typeof context.story === 'object') {
    recordInfo.push(`<strong>Story:</strong> ${context.story.clipTitle || context.story.id || 'N/A'}`);
    if (context.story.show) recordInfo.push(`<strong>Show:</strong> ${context.story.show}`);
    if (context.story.season) recordInfo.push(`<strong>Season:</strong> ${context.story.season}`);
  } else if (context.show && typeof context.show === 'object') {
    recordInfo.push(`<strong>Show:</strong> ${context.show.name || context.show.id || 'N/A'}`);
  } else if (context.season && typeof context.season === 'object') {
    recordInfo.push(`<strong>Season:</strong> ${context.season.name || `Season ${context.season.seasonNumber || ''}` || 'N/A'}`);
  }
  
  // Add record IDs if available
  if (context.pitchId) recordInfo.push(`<strong>Pitch ID:</strong> ${context.pitchId}`);
  if (context.storyId) recordInfo.push(`<strong>Story ID:</strong> ${context.storyId}`);
  if (context.showId) recordInfo.push(`<strong>Show ID:</strong> ${context.showId}`);
  if (context.seasonId) recordInfo.push(`<strong>Season ID:</strong> ${context.seasonId}`);
  
  let html = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; margin: 0 0 20px 0; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
      <div style="display: flex; align-items: center; margin-bottom: 15px;">
        <span style="font-size: 24px; margin-right: 12px;">${actionIcon}</span>
        <h2 style="margin: 0; font-size: 20px; font-weight: 600;">${actionDescription}</h2>
      </div>
      <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 6px; margin-bottom: 10px;">
        <div style="margin-bottom: 8px;"><strong>Function Executed:</strong> ${functionName}</div>
        <div style="margin-bottom: 8px;"><strong>Performed By:</strong> ${performedBy}</div>
        <div><strong>Performed At:</strong> ${performedAt}</div>
      </div>
  `;
  
  if (recordInfo.length > 0) {
    html += `
      <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 6px; margin-bottom: ${changeDetails.length > 0 ? '10px' : '0'};">
        <div style="font-weight: 600; margin-bottom: 8px;">Record Information:</div>
        ${recordInfo.join('<br>')}
      </div>
    `;
  }
  
  if (changeDetails.length > 0) {
    html += `
      <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 6px;">
        <div style="font-weight: 600; margin-bottom: 8px;">Changes Made:</div>
        ${changeDetails.join('<br>')}
      </div>
    `;
  }
  
  html += `</div>`;
  
  return html;
}

/**
 * Format record details based on context
 */
export function formatRecordDetails(context: any): string | null {
  try {
    let details: RecordDetails | null = null;

    // Try to identify record type and format accordingly
    if (context.show && typeof context.show === 'object') {
      details = formatShowDetails(context.show, context);
    } else if (context.season && typeof context.season === 'object') {
      details = formatSeasonDetails(context.season, context);
    } else if (context.story && typeof context.story === 'object') {
      details = formatStoryDetails(context.story, context);
    } else if (context.pitch && typeof context.pitch === 'object') {
      details = formatPitchDetails(context.pitch, context);
    }

    if (details) {
      // Generate action summary first, then record details
      const actionSummary = generateActionSummaryHTML(context);
      const recordDetails = generateDetailsHTML(details);
      return actionSummary + recordDetails;
    }

    // Even if we don't have full record details, generate action summary
    return generateActionSummaryHTML(context);
  } catch (error) {
    console.error('❌ [recordDetailFormatter] Error formatting record details:', error);
    return null;
  }
}

/**
 * Resolve contact IDs to contact objects with names
 */
async function resolveContactNames(contactIds: string[], organizationId: string): Promise<Array<{ id: string; name: string }>> {
  if (!contactIds || contactIds.length === 0 || !organizationId) {
    return [];
  }

  try {
    // Import admin here to avoid circular dependencies
    const admin = await import('firebase-admin');
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore();
    const FieldPath = admin.firestore.FieldPath;
    
    const contacts: Array<{ id: string; name: string }> = [];
    
    // Process in batches of 10 (Firestore 'in' query limit)
    for (let i = 0; i < contactIds.length; i += 10) {
      const batch = contactIds.slice(i, i + 10);
      const contactsSnapshot = await db
        .collection('clipShowContacts')
        .where(FieldPath.documentId(), 'in', batch)
        .where('organizationId', '==', organizationId)
        .get();
      
      contactsSnapshot.forEach(doc => {
        const contactData = doc.data();
        contacts.push({
          id: doc.id,
          name: contactData.name || contactData.displayName || contactData.email || 'Unknown Contact'
        });
      });
    }

    return contacts;
  } catch (error) {
    console.error('❌ [recordDetailFormatter] Error resolving contact names:', error);
    return [];
  }
}

/**
 * Enrich context with flattened template variables
 */
export async function enrichContextWithVariables(context: any): Promise<any> {
  const enriched: any = { ...context };

  // Universal variables
  enriched.performedByName = context.performedByName || context.performedBy || 'System';
  enriched.performedBy = context.performedBy || 'System';
  enriched.performedAt = new Date().toLocaleString();
  enriched.actionType = context.functionName || context.functionId || 'Automation';

  // Show variables
  if (context.show && typeof context.show === 'object') {
    enriched.showName = context.show.name || '';
    enriched.showDescription = context.show.description || '';
    enriched.showStatus = context.show.isActive ? 'Active' : 'Inactive';
    enriched.showCreatedAt = formatDate(context.show.createdAt);
  }

  // Season variables
  if (context.season && typeof context.season === 'object') {
    enriched.seasonNumber = context.season.seasonNumber?.toString() || '';
    enriched.seasonName = context.season.name || '';
    enriched.seasonStatus = context.season.status || '';
    enriched.episodeCount = context.season.episodes?.length?.toString() || '0';
    enriched.seasonStartDate = formatDate(context.season.startDate);
    enriched.seasonEndDate = formatDate(context.season.endDate);
    
    // Get show name from showId if available
    if (context.season.showId && context.showId) {
      enriched.showName = context.showId; // This would need lookup in production
    }
  }

  // Story variables
  if (context.story && typeof context.story === 'object') {
    enriched.storyTitle = context.story.clipTitle || '';
    enriched.storyStatus = context.story.status || '';
    enriched.storyShow = context.story.show || '';
    enriched.storySeason = context.story.season || '';
    enriched.storyClipType = context.story.clipType || '';
    enriched.scriptLength = context.story.scriptContent?.length 
      ? `${Math.round(context.story.scriptContent.length / 1000)}k characters` 
      : 'No script content';
  }

  // Status transition variables
  if (context.oldStatus && context.newStatus) {
    enriched.statusChange = `${context.oldStatus} → ${context.newStatus}`;
    enriched.oldStatus = context.oldStatus;
    enriched.newStatus = context.newStatus;
  }

  // Pitch variables
  if (context.pitch && typeof context.pitch === 'object') {
    enriched.pitchTitle = context.pitch.clipTitle || '';
    enriched.pitchStatus = context.pitch.status || '';
    enriched.pitchPriority = context.pitch.priority || '';
    enriched.pitchShow = context.pitch.show || '';
    enriched.pitchSeason = context.pitch.season || '';
    enriched.assignedProducer = context.pitch.assignedProducerId || 'Not assigned';
  }

  // Version/revision variables
  if (context.versionNote) {
    enriched.versionNote = context.versionNote;
  }
  if (context.notes) {
    enriched.notes = context.notes;
  }
  if (context.reason) {
    enriched.reason = context.reason;
  }

  // Calendar event variables
  if (context.eventId || context.title) {
    enriched.eventTitle = context.title || 'Untitled Event';
    enriched.eventType = context.eventType || 'Event';
    
    // Format dates properly
    if (context.startDate) {
      enriched.startDate = formatDateTime(context.startDate);
      enriched.startDateShort = formatDateTimeShort(context.startDate);
    }
    if (context.endDate) {
      enriched.endDate = formatDateTime(context.endDate);
      enriched.endDateShort = formatDateTimeShort(context.endDate);
    }
    if (context.previousStartDate) {
      enriched.previousStartDate = formatDateTime(context.previousStartDate);
      enriched.previousStartDateShort = formatDateTimeShort(context.previousStartDate);
    }
    if (context.previousEndDate) {
      enriched.previousEndDate = formatDateTime(context.previousEndDate);
      enriched.previousEndDateShort = formatDateTimeShort(context.previousEndDate);
    }
    
    // Format assigned contacts - resolve contact IDs to names
    if (context.assignedContacts && Array.isArray(context.assignedContacts) && context.assignedContacts.length > 0) {
      // Check if contacts are already objects with names
      const hasContactObjects = context.assignedContacts.some((c: any) => 
        c && typeof c === 'object' && (c.name || c.displayName)
      );
      
      if (hasContactObjects) {
        // Contacts are already objects, extract names
        const contactNames = context.assignedContacts
          .map((contact: any) => {
            if (contact && typeof contact === 'object') {
              return contact.name || contact.displayName || contact.email || contact.id || 'Unknown Contact';
            }
            return null;
          })
          .filter((name: any) => name !== null);
        enriched.assignedContactsList = contactNames.join(', ');
        enriched.assignedContactsCount = contactNames.length.toString();
      } else {
        // Contacts are IDs, resolve them from Firestore
        const organizationId = context.organizationId || '';
        if (organizationId) {
          const resolvedContacts = await resolveContactNames(context.assignedContacts, organizationId);
          if (resolvedContacts.length > 0) {
            enriched.assignedContactsList = resolvedContacts.map(c => c.name).join(', ');
            enriched.assignedContactsCount = resolvedContacts.length.toString();
          } else {
            // Fallback if resolution fails
            enriched.assignedContactsList = context.assignedContacts.join(', ');
            enriched.assignedContactsCount = context.assignedContacts.length.toString();
          }
        } else {
          // No organizationId, can't resolve - use IDs as fallback
          enriched.assignedContactsList = context.assignedContacts.join(', ');
          enriched.assignedContactsCount = context.assignedContacts.length.toString();
        }
      }
    } else {
      enriched.assignedContactsList = 'No contacts assigned';
      enriched.assignedContactsCount = '0';
    }
    
    // Format location and description (empty strings if not provided)
    enriched.location = context.location || '';
    enriched.description = context.description || '';
    
    // Create location section HTML only if location exists
    enriched.locationSection = enriched.location 
      ? `<div style="margin-bottom: 15px;">
<strong style="color: #555; display: block; margin-bottom: 5px;">📍 Location:</strong>
<span style="color: #333;">${enriched.location}</span>
</div>`
      : '';
    
    // Create description section HTML only if description exists
    enriched.descriptionSection = enriched.description 
      ? `<div style="margin-bottom: 15px;">
<strong style="color: #555; display: block; margin-bottom: 5px;">Description:</strong>
<div style="color: #333; white-space: pre-wrap;">${enriched.description}</div>
</div>`
      : '';
    
    // Determine if date changed and create previous date section HTML
    if (context.previousStartDate && context.startDate) {
      const prevDate = formatDateTime(context.previousStartDate);
      const newDate = formatDateTime(context.startDate);
      enriched.dateChanged = context.previousStartDate !== context.startDate;
      
      // Only show previous date section if dates are different
      if (enriched.dateChanged) {
        enriched.previousDateSection = `<div style="margin-bottom: 15px; padding: 10px; background: #fff3e0; border-left: 3px solid #ff9800; border-radius: 4px;">
<strong style="color: #e65100; display: block; margin-bottom: 5px;">Previous Date & Time:</strong>
<span style="color: #333;">${prevDate}</span>
</div>`;
      } else {
        enriched.previousDateSection = '';
      }
    } else {
      enriched.previousDateSection = '';
    }
  }

  return enriched;
}

/**
 * Format date and time for calendar events (full format)
 */
function formatDateTime(date: any): string {
  if (!date) return 'N/A';
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return String(date);
  }
}

/**
 * Format date and time for calendar events (short format: MM/DD/YYYY HH:MM AM/PM)
 */
function formatDateTimeShort(date: any): string {
  if (!date) return 'N/A';
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return String(date);
  }
}

