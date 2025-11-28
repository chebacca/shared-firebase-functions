/**
 * MINIMAL AUTOMATION FUNCTIONS EXPORT
 * 
 * Exports only automation and notification functions
 * to avoid TypeScript compilation errors with other modules
 */

// Export email notification functions
export {
  sendNotificationEmail,
  testEmailConnection
} from './notifications/sendEmail';

// Export automation executor
export {
  executeAutomation
} from './clipShowPro/automationExecutor';

