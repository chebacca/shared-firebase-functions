/**
 * Migration Cloud Function
 * 
 * Callable function to run OAuth connection migration
 * Supports dry-run mode for safe testing
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { migrateOAuthConnections } from './migrateToCloudIntegrations';
import { encryptionKey } from '../encryption';

/**
 * Run OAuth migration (dry-run or actual)
 */
export const runOAuthMigration = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    // Verify user is admin
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userRole = request.auth.token.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'owner' && userRole !== 'superadmin') {
      throw new HttpsError('permission-denied', 'Admin role required to run migration');
    }

    const { dryRun = true } = request.data;

    try {
      console.log(`🔄 Starting OAuth migration (dryRun: ${dryRun})...`);
      
      const report = await migrateOAuthConnections(dryRun);
      
      console.log(`✅ Migration complete:`, {
        migrated: report.migrated,
        errors: report.errors,
        skipped: report.skipped
      });

      return {
        success: true,
        dryRun,
        report: {
          migrated: report.migrated,
          errors: report.errors,
          skipped: report.skipped,
          details: report.details.slice(0, 100) // Limit details in response
        }
      };
    } catch (error) {
      console.error('❌ Migration error:', error);
      throw new HttpsError('internal', `Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

