/**
 * Production Workflow System Functions
 * 
 * Exports all workflow-specific Firebase Functions
 */

// Export workflow routes
export { default as workflowRoutes } from './routes/workflow.routes';
export { default as appRoleDefinitionsRoutes } from './routes/appRoleDefinitions';
export { default as dynamicRolesRoutes } from './routes/dynamicRoles';
export { default as environmentRoutes } from './routes/environment.routes';
export { default as geminiRoutes } from './routes/gemini.routes';
export { default as googleMapsRoutes } from './routes/google-maps.routes';
export { default as unifiedTeamMembersRoutes } from './routes/unifiedTeamMembers';
export { default as weatherRoutes } from './routes/weather.routes';
export { default as ollamaRoutes } from './routes/ollama.routes';

// Export delivery functions
export { sendDeliveryPackageEmail } from './delivery/sendDeliveryPackageEmail';
export { generateDeliveryPackageZip } from './delivery/generateDeliveryPackageZip';
export { proxyFileDownload } from './delivery/proxyFileDownload';

// Export workflow triggers
export { onWorkflowStepUpdate } from './triggers/workflowTriggers';

// Export workflow services
export { enhancedDeliverableProcessor } from './services/EnhancedDeliverableProcessor';
export { WorkflowTemplate } from './services/workflowTemplateValidator';
export { AdminSDKDataValidator } from './services/AdminSDKDataValidator';
export { dynamicRoleService } from './services/dynamicRoleService';
export { LicenseClaimsService } from './services/LicenseClaimsService';
