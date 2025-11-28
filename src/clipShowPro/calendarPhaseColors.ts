/**
 * Calendar Phase Color Mapping
 * 
 * Maps workflow phases to colors for calendar event visualization
 * Colors are organized by workflow category: pitch, clearance, story, script, edit
 */

// Types are imported from shared types - these will be available at runtime
// Using string literals for type safety
export type PitchStatus = 
  | 'Pitched'
  | 'Pursue Clearance'
  | 'Do Not Pursue Clearance'
  | 'Licensing Not Permitted'
  | 'Killed'
  | 'Ready to License'
  | 'License Cleared'
  | 'Ready for Script'
  | 'Script Complete'
  | 'V1 Cut'
  | 'Ready for Build';

export type StoryStatus = 
  | 'Draft' | 'Needs Script' | 'Ready for Script' | 'Scripting' | 'In Progress'
  | 'Script Review' | 'Scripting Notes' | 'Scripting Revision' | 'Script Revisions'
  | 'Ready for Approval' | 'Script Complete' | 'Needs String' | 'String In Progress'
  | 'String Complete' | 'A Roll' | 'A Roll Notes' | 'A Roll Notes Complete'
  | 'v1 Edit' | 'v1 Notes' | 'v1 Notes Complete' | 'v2 Edit' | 'v2 Notes'
  | 'v2 Notes Complete' | 'v3 Edit' | 'v3 Notes' | 'v3 Notes Complete'
  | 'v4 Edit' | 'v4 Notes' | 'v4 Notes Complete' | 'v5 Edit' | 'v5 Notes'
  | 'v5 Notes Complete' | 'Needs Revisit' | 'Ready for Build' | 'RC'
  | 'RC Notes' | 'RC Notes Complete' | 'Assembled' | 'Killed' | 'Merged'
  | 'Previously Used' | 'Stalled' | 'Pending' | 'Ready for Ingest'
  | 'Needs Transcode' | 'Transcoded' | 'Ingested' | 'Edit Ready';

export type PitchingLicenseStatus = 
  | 'Draft' | 'Pending' | 'Signed' | 'Expired' | 'Cancelled';

export type PhaseCategory = 'pitch' | 'clearance' | 'story' | 'script' | 'edit';

export interface PhaseColorMap {
  [status: string]: string;
}

/**
 * Color mapping for pitch phases
 * Blue spectrum for initial pitch stages - DISTINCT from other phases
 */
export const PITCH_PHASE_COLORS: PhaseColorMap = {
  'Pitched': '#3B82F6',                    // Blue 500 - Initial pitch
  'Pursue Clearance': '#F59E0B',           // Amber 500 - Moving to clearance
  'Do Not Pursue Clearance': '#6B7280',   // Gray 500 - Declined
  'Licensing Not Permitted': '#DC2626',     // Red 600 - Not allowed
  'Killed': '#991B1B',                      // Red 800 - Cancelled
  'Ready to License': '#F97316',            // Orange 500 - Ready for clearance
  'License Cleared': '#10B981',            // Green 500 - Clearance done
  'Ready for Script': '#10B981',           // Green 500 - Transition to script
  'Script Complete': '#059669',            // Green 600 - Script finished
  'V1 Cut': '#14B8A6',                     // Teal 500 - Transition to edit
  'Ready for Build': '#0D9488'             // Teal 600 - Final stage
};

/**
 * Color mapping for clearance phases
 * Orange/amber spectrum for clearance workflows - DISTINCT from other phases
 */
export const CLEARANCE_PHASE_COLORS: PhaseColorMap = {
  'Draft': '#FB923C',                       // Orange 400 - Initial draft
  'Pending': '#F97316',                    // Orange 500 - Waiting for signature
  'Signed': '#EA580C',                     // Orange 600 - Completed
  'Expired': '#9A3412',                    // Orange 800 - Expired
  'Cancelled': '#991B1B'                   // Red 800 - Cancelled
};

/**
 * Color mapping for story phases
 * Green spectrum for story/story stages - DISTINCT from pitch colors
 * Note: Edit-related statuses moved to EDIT_PHASE_COLORS for better separation
 */
export const STORY_PHASE_COLORS: PhaseColorMap = {
  'Draft': '#22C55E',                      // Green 500 - Initial draft
  'Needs Script': '#16A34A',               // Green 600 - Script needed
  'Ready for Script': '#15803D',           // Green 700 - Ready for script
  'Scripting': '#047857',                   // Green 800 - Being scripted
  'In Progress': '#065F46',                // Green 900 - Active work
  'Script Review': '#059669',               // Green 600 - Review stage
  'Scripting Notes': '#34D399',            // Green 400 - Notes stage
  'Scripting Revision': '#F59E0B',         // Amber 500 - Needs revision
  'Script Revisions': '#F59E0B',           // Amber 500 - Revision work
  'Ready for Approval': '#3B82F6',         // Blue 500 - Approval pending
  'Script Complete': '#059669',            // Green 600 - Script done
  'Needs String': '#14B8A6',               // Teal 500 - String needed
  'String In Progress': '#0D9488',          // Teal 600 - String work
  'String Complete': '#0D9488',            // Teal 600 - String done
  'A Roll': '#06B6D4',                     // Cyan 500 - A Roll stage
  'A Roll Notes': '#22D3EE',               // Cyan 400 - A Roll notes
  'A Roll Notes Complete': '#06B6D4',      // Cyan 500 - Notes complete
  'v1 Edit': '#0891B2',                    // Cyan 600 - V1 edit
  'v1 Notes': '#67E8F9',                   // Cyan 300 - V1 notes
  'v1 Notes Complete': '#0891B2',         // Cyan 600 - V1 complete
  'v2 Edit': '#0E7490',                    // Cyan 700 - V2 edit
  'v2 Notes': '#67E8F9',                   // Cyan 300 - V2 notes
  'v2 Notes Complete': '#0E7490',          // Cyan 700 - V2 complete
  'v3 Edit': '#155E75',                    // Cyan 800 - V3 edit
  'v3 Notes': '#67E8F9',                   // Cyan 300 - V3 notes
  'v3 Notes Complete': '#155E75',          // Cyan 800 - V3 complete
  'v4 Edit': '#164E63',                    // Cyan 900 - V4 edit
  'v4 Notes': '#67E8F9',                   // Cyan 300 - V4 notes
  'v4 Notes Complete': '#164E63',          // Cyan 900 - V4 complete
  'v5 Edit': '#164E63',                    // Cyan 900 - V5 edit
  'v5 Notes': '#67E8F9',                   // Cyan 300 - V5 notes
  'v5 Notes Complete': '#164E63',          // Cyan 900 - V5 complete
  'Needs Revisit': '#F59E0B',              // Amber 500 - Needs work
  'Ready for Build': '#0D9488',            // Teal 600 - Final build
  'RC': '#0891B2',                         // Cyan 600 - Release candidate
  'RC Notes': '#67E8F9',                   // Cyan 300 - RC notes
  'RC Notes Complete': '#0891B2',         // Cyan 600 - RC complete
  'Assembled': '#059669',                  // Green 600 - Assembled
  'Killed': '#991B1B',                     // Red 800 - Cancelled
  'Merged': '#6B7280',                     // Gray 500 - Merged
  'Previously Used': '#6B7280',            // Gray 500 - Used before
  'Stalled': '#9CA3AF',                    // Gray 400 - Stalled
  'Pending': '#9CA3AF'                     // Gray 400 - Pending
};

/**
 * Color mapping for script phases
 * Purple spectrum for scripting stages - DISTINCT from other phases
 */
export const SCRIPT_PHASE_COLORS: PhaseColorMap = {
  'Ready for Script': '#A855F7',           // Purple 500 - Ready
  'Scripting': '#9333EA',                   // Purple 600 - Active scripting
  'Script Review': '#7C3AED',              // Purple 700 - Review stage
  'Script Complete': '#6D28D9',            // Purple 800 - Complete
  'Scripting Revision': '#C084FC',        // Purple 400 - Revision needed
  'Script Revisions': '#C084FC'           // Purple 400 - Revision work
};

/**
 * Color mapping for edit phases
 * Teal/Cyan spectrum for editing and transcoding - DISTINCT from story colors
 */
export const EDIT_PHASE_COLORS: PhaseColorMap = {
  'Ready for Ingest': '#0D9488',           // Teal 600 - Ready to ingest
  'Needs Transcode': '#F59E0B',           // Amber 500 - Needs transcoding
  'Transcoded': '#14B8A6',                 // Teal 500 - Transcoding done
  'Ingested': '#0D9488',                   // Teal 600 - Ingested
  'Edit Ready': '#0891B2',                 // Cyan 600 - Ready for edit
  'v1 Edit': '#0891B2',                    // Cyan 600 - V1 edit
  'v2 Edit': '#0E7490',                    // Cyan 700 - V2 edit
  'v3 Edit': '#155E75',                    // Cyan 800 - V3 edit
  'v4 Edit': '#164E63',                    // Cyan 900 - V4 edit
  'v5 Edit': '#164E63',                    // Cyan 900 - V5 edit
  'A Roll': '#06B6D4',                     // Cyan 500 - A Roll
  'RC': '#0891B2',                         // Cyan 600 - Release candidate
  'Ready for Build': '#0D9488',            // Teal 600 - Final build
  'Assembled': '#059669'                   // Green 600 - Assembled
};

/**
 * Get phase category from status string (auto-detection)
 */
export function getPhaseCategory(status: string): PhaseCategory {
  if (!status) return 'pitch'; // Default
  
  // Check clearance first (most specific)
  if (CLEARANCE_PHASE_COLORS[status]) return 'clearance';
  
  // Check script phases
  if (SCRIPT_PHASE_COLORS[status]) return 'script';
  
  // Check edit phases (includes transcoding and edit-specific statuses)
  if (EDIT_PHASE_COLORS[status] || 
      status.includes('Transcode') || 
      status.includes('Ingest') || 
      status === 'Edit Ready' ||
      (status.includes('Edit') && !status.includes('Script'))) {
    return 'edit';
  }
  
  // Check story phases (includes script-related story statuses)
  if (STORY_PHASE_COLORS[status] ||
      status.includes('Script') ||
      status.includes('String') ||
      status.includes('Notes') ||
      status === 'Draft' ||
      status === 'In Progress' ||
      status === 'A Roll') {
    return 'story';
  }
  
  // Check pitch phases
  if (PITCH_PHASE_COLORS[status]) return 'pitch';
  
  // Default to pitch
  return 'pitch';
}

/**
 * Get phase color for a status and category
 */
export function getPhaseColor(status: string, category: PhaseCategory): string {
  if (!status) return '#6B7280'; // Default gray
  
  switch (category) {
    case 'pitch':
      return PITCH_PHASE_COLORS[status] || '#6B7280';
    case 'clearance':
      return CLEARANCE_PHASE_COLORS[status] || '#6B7280';
    case 'story':
      return STORY_PHASE_COLORS[status] || '#6B7280';
    case 'script':
      return SCRIPT_PHASE_COLORS[status] || '#6B7280';
    case 'edit':
      return EDIT_PHASE_COLORS[status] || '#6B7280';
    default:
      return '#6B7280';
  }
}

/**
 * Get phase color for a status (auto-detects category)
 * This is the main function to use for getting colors
 */
export function getPhaseColorForStatus(status: string): string {
  if (!status) return '#6B7280'; // Default gray
  
  const category = getPhaseCategory(status);
  return getPhaseColor(status, category);
}

/**
 * Determine phase category from pitch status
 */
export function getPhaseCategoryFromPitchStatus(status: PitchStatus): PhaseCategory {
  if (['Pitched', 'Pursue Clearance', 'Do Not Pursue Clearance', 'Licensing Not Permitted', 'Killed', 'Ready to License', 'License Cleared'].includes(status)) {
    return 'pitch';
  }
  if (['Ready for Script', 'Script Complete'].includes(status)) {
    return 'script';
  }
  if (['V1 Cut', 'Ready for Build'].includes(status)) {
    return 'edit';
  }
  return 'pitch'; // Default
}

/**
 * Determine phase category from story status
 */
export function getPhaseCategoryFromStoryStatus(status: StoryStatus): PhaseCategory {
  if (status.includes('Edit') || status.includes('Transcode') || status.includes('Ingest') || 
      status === 'Edit Ready' || status === 'A Roll' || status === 'RC' || 
      status === 'Ready for Build' || status === 'Assembled') {
    return 'edit';
  }
  if (status.includes('Script') || status === 'Ready for Script' || status === 'Script Complete') {
    return 'script';
  }
  return 'story'; // Default
}

/**
 * Determine phase category from clearance status
 */
export function getPhaseCategoryFromClearanceStatus(status: PitchingLicenseStatus): PhaseCategory {
  return 'clearance';
}

/**
 * Get all phase colors for a category (for legend display)
 */
export function getPhaseColorsForCategory(category: PhaseCategory): PhaseColorMap {
  switch (category) {
    case 'pitch':
      return PITCH_PHASE_COLORS;
    case 'clearance':
      return CLEARANCE_PHASE_COLORS;
    case 'story':
      return STORY_PHASE_COLORS;
    case 'script':
      return SCRIPT_PHASE_COLORS;
    case 'edit':
      return EDIT_PHASE_COLORS;
    default:
      return {};
  }
}

