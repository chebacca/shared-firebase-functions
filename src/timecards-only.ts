/**
 * 🔥 TIMECARD FIREBASE FUNCTIONS INDEX
 * Entry point for timecard-related Firebase Functions only
 */

// Export all timecard functions (both Firebase Callable and HTTP versions)
export { getTimecardTemplates, getTimecardTemplatesHttp } from './timecards/getTimecardTemplates';
export { createTimecardTemplate, createTimecardTemplateHttp } from './timecards/createTimecardTemplate';
export { getTimecardAssignments, getTimecardAssignmentsHttp } from './timecards/getTimecardAssignments';
export { getAllTimecards, getAllTimecardsHttp } from './timecards/getAllTimecards';
export { getTimecardUsers, getTimecardUsersHttp } from './timecards/getTimecardUsers';
export { getTimecardConfigurations, getTimecardConfigurationsHttp } from './timecards/getTimecardConfigurations';
