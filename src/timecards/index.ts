// Export all timecard functions (both Firebase Callable and HTTP versions)
export { getTimecardTemplates, getTimecardTemplatesHttp } from './getTimecardTemplates';
export { createTimecardTemplate, createTimecardTemplateHttp } from './createTimecardTemplate';
export { getTimecardAssignments, getTimecardAssignmentsHttp } from './getTimecardAssignments';
export { getAllTimecards, getAllTimecardsHttp } from './getAllTimecards';
export { getTimecardUsers, getTimecardUsersHttp } from './getTimecardUsers';
export { getTimecardConfigurations, getTimecardConfigurationsHttp } from './getTimecardConfigurations';
export { getPendingApprovals, getPendingApprovalsHttp } from './getPendingApprovals';
export { getMySubmissions, getMySubmissionsHttp } from './getMySubmissions';
export { getApprovalHistory, getApprovalHistoryHttp } from './getApprovalHistory';
export { getDirectReports, getDirectReportsHttp } from './getDirectReports';
export { timecardApprovalApi } from './timecardApprovalApi';
