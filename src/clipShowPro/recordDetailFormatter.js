/**
 * Record Detail Formatter
 *
 * Utility for formatting record details into professional HTML for automation emails
 */
function formatDate(date) {
    if (!date)
        return 'N/A';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }
    catch {
        return String(date);
    }
}
function formatStatus(status) {
    return status || 'N/A';
}
function formatShowDetails(show, context) {
    const sections = [];
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
function formatSeasonDetails(season, context) {
    const sections = [];
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
function formatStoryDetails(story, context) {
    const sections = [];
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
function formatPitchDetails(pitch, context) {
    const sections = [];
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
export function generateDetailsHTML(details) {
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
 * Format record details based on context
 */
export function formatRecordDetails(context) {
    try {
        let details = null;
        // Try to identify record type and format accordingly
        if (context.show && typeof context.show === 'object') {
            details = formatShowDetails(context.show, context);
        }
        else if (context.season && typeof context.season === 'object') {
            details = formatSeasonDetails(context.season, context);
        }
        else if (context.story && typeof context.story === 'object') {
            details = formatStoryDetails(context.story, context);
        }
        else if (context.pitch && typeof context.pitch === 'object') {
            details = formatPitchDetails(context.pitch, context);
        }
        if (details) {
            return generateDetailsHTML(details);
        }
        return null;
    }
    catch (error) {
        console.error('❌ [recordDetailFormatter] Error formatting record details:', error);
        return null;
    }
}
/**
 * Enrich context with flattened template variables
 */
export function enrichContextWithVariables(context) {
    const enriched = { ...context };
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
    return enriched;
}
