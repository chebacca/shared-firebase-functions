/**
 * Migration Script: OAuth Connections to cloudIntegrations
 * 
 * Migrates OAuth connections from old collections to unified cloudIntegrations collection
 * 
 * Usage:
 * - Dry run: migrateOAuthConnections(true)
 * - Execute: migrateOAuthConnections(false)
 */

import { db } from '../../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';
import { decryptToken } from '../encryption';

interface MigrationReport {
  migrated: number;
  errors: number;
  skipped: number;
  details: Array<{
    organizationId: string;
    provider: string;
    status: 'migrated' | 'skipped' | 'error';
    error?: string;
  }>;
}

/**
 * Migrate OAuth connections to cloudIntegrations
 */
export async function migrateOAuthConnections(dryRun = true): Promise<MigrationReport> {
  const providers = ['google', 'box', 'dropbox', 'slack'];
  const report: MigrationReport = {
    migrated: 0,
    errors: 0,
    skipped: 0,
    details: []
  };
  
  console.log(`🔄 Starting OAuth migration (dryRun: ${dryRun})...`);
  
  // Get all organizations
  const orgsSnapshot = await db.collection('organizations').get();
  console.log(`📊 Found ${orgsSnapshot.size} organizations`);
  
  for (const orgDoc of orgsSnapshot.docs) {
    const orgId = orgDoc.id;
    
    for (const provider of providers) {
      try {
        // Check if already migrated
        const newLocation = await db
          .collection('organizations')
          .doc(orgId)
          .collection('cloudIntegrations')
          .doc(provider)
          .get();
        
        if (newLocation.exists) {
          report.skipped++;
          report.details.push({
            organizationId: orgId,
            provider,
            status: 'skipped',
            error: 'Already exists in cloudIntegrations'
          });
          continue;
        }
        
        // Get from old location
        const oldCollectionName = `${provider}Connections`;
        const oldConnections = await db
          .collection('organizations')
          .doc(orgId)
          .collection(oldCollectionName)
          .where('isActive', '==', true)
          .limit(1)
          .get();
        
        if (oldConnections.empty) {
          // Try alternative collection names
          const altNames = [
            `${provider}Connections`,
            `${provider}_connections`,
            `${provider}Connection`
          ];
          
          let found = false;
          for (const altName of altNames) {
            const altConnections = await db
              .collection('organizations')
              .doc(orgId)
              .collection(altName)
              .where('isActive', '==', true)
              .limit(1)
              .get();
            
            if (!altConnections.empty) {
              const oldData = altConnections.docs[0].data();
              await migrateConnection(orgId, provider, oldData, dryRun, report);
              found = true;
              break;
            }
          }
          
          if (!found) {
            report.skipped++;
            report.details.push({
              organizationId: orgId,
              provider,
              status: 'skipped',
              error: 'No active connections found in old collections'
            });
          }
        } else {
          // Take first active connection
          const oldData = oldConnections.docs[0].data();
          await migrateConnection(orgId, provider, oldData, dryRun, report);
        }
      } catch (error) {
        report.errors++;
        report.details.push({
          organizationId: orgId,
          provider,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        console.error(`❌ Error migrating ${provider} for org ${orgId}:`, error);
      }
    }
  }
  
  console.log(`✅ Migration complete:`);
  console.log(`   - Migrated: ${report.migrated}`);
  console.log(`   - Skipped: ${report.skipped}`);
  console.log(`   - Errors: ${report.errors}`);
  
  return report;
}

/**
 * Migrate a single connection
 */
async function migrateConnection(
  orgId: string,
  provider: string,
  oldData: any,
  dryRun: boolean,
  report: MigrationReport
): Promise<void> {
  try {
    // Extract tokens (handle different formats)
    let accessToken = oldData.accessToken || oldData.token || oldData.encryptedAccessToken;
    let refreshToken = oldData.refreshToken || oldData.encryptedRefreshToken;
    
    // If tokens are in encryptedTokens object
    if (oldData.encryptedTokens) {
      accessToken = oldData.encryptedTokens.accessToken || accessToken;
      refreshToken = oldData.encryptedTokens.refreshToken || refreshToken;
    }
    
    // If tokens are encrypted, try to decrypt (but keep encrypted if decryption fails)
    // We'll store them as-is since they're already encrypted
    // The new system will handle decryption when needed
    
    // Transform to new schema
    const newData: any = {
      provider,
      accountEmail: oldData.accountEmail || oldData.email || oldData.userEmail || '',
      accountName: oldData.accountName || oldData.name || oldData.userName || '',
      accountId: oldData.accountId || oldData.userId || oldData.id || '',
      accessToken: accessToken || '',
      tokenExpiresAt: oldData.expiresAt || oldData.tokenExpiresAt || null,
      scopes: oldData.scopes || oldData.scope?.split(' ') || [],
      isActive: true,
      connectedAt: oldData.connectedAt || oldData.createdAt || Timestamp.now(),
      connectedBy: oldData.userId || oldData.connectedBy || oldData.createdBy || '',
      lastRefreshedAt: oldData.updatedAt || oldData.lastRefreshedAt || Timestamp.now(),
      organizationId: orgId
    };
    
    // Only add refreshToken if it exists
    if (refreshToken) {
      newData.refreshToken = refreshToken;
    }
    
    if (!dryRun) {
      await db
        .collection('organizations')
        .doc(orgId)
        .collection('cloudIntegrations')
        .doc(provider)
        .set(newData);
      
      // Mark old as migrated (optional - for tracking)
      // await oldConnections.docs[0].ref.update({ migrated: true, migratedAt: Timestamp.now() });
    }
    
    report.migrated++;
    report.details.push({
      organizationId: orgId,
      provider,
      status: 'migrated'
    });
    
    console.log(`✅ Migrated ${provider} for org ${orgId}${dryRun ? ' (dry run)' : ''}`);
  } catch (error) {
    throw error;
  }
}

/**
 * Cloud Function to run migration
 */
export async function runMigration(dryRun: boolean = true): Promise<MigrationReport> {
  return await migrateOAuthConnections(dryRun);
}

