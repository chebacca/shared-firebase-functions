/**
 * Automation Functions - Minimal Export
 * 
 * Exports only the automation-related Cloud Functions
 */

export { sendNotificationEmail, testEmailConnection } from './notifications/sendEmail';
export { executeAutomation } from './clipShowPro/automationExecutor';

