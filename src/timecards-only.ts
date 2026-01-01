/**
 * 🔥 TIMECARD FIREBASE FUNCTIONS INDEX
 * Entry point for timecard-related Firebase Functions only
 * HTTP versions removed to reduce CPU quota - use callable versions instead
 */

// Export all timecard functions (callable versions only)
export { getTimecardTemplates } from './timecards/getTimecardTemplates';
export { createTimecardTemplate } from './timecards/createTimecardTemplate';
export { getTimecardAssignments } from './timecards/getTimecardAssignments';
export { getAllTimecards } from './timecards/getAllTimecards';
export { getTimecardUsers } from './timecards/getTimecardUsers';
export { getTimecardConfigurations } from './timecards/getTimecardConfigurations';
