/**
 * Slack Integration Functions
 * 
 * Export all Slack-related Firebase Functions
 * 
 * NOTE: OAuth functions are now handled by the unified OAuth system
 * (shared-firebase-functions/src/integrations/unified-oauth/)
 * 
 * Old OAuth functions (slackOAuthInitiate, slackOAuthCallback, etc.) are deprecated
 * and should not be used. Use initiateOAuth and handleOAuthCallback instead.
 */

// OAuth functions removed - use unified OAuth system instead
// export * from './oauth'; // DEPRECATED - Use unified OAuth system

export * from './api';
export * from './webhook';
export * from './config';

