/**
 * Scheduled Token Refresh
 * 
 * Automatically refreshes OAuth tokens that are expiring soon
 * Runs every hour
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';
import { providerRegistry } from '../ProviderRegistry';
import { decryptToken } from '../encryption';
import { encryptionKey } from '../encryption';

/**
 * Refresh expired tokens
 * Runs every hour
 */
export const refreshExpiredTokens = onSchedule(
  {
    schedule: 'every 1 hours',
    region: 'us-central1',
    secrets: [encryptionKey],
    timeZone: 'America/Los_Angeles'
  },
  async (event) => {
    console.log('🔄 Starting scheduled token refresh...');

    const providers = ['google', 'box', 'dropbox', 'slack'];
    let refreshed = 0;
    let errors = 0;

    for (const providerName of providers) {
      const provider = providerRegistry.getProvider(providerName);

      if (!provider || provider.type !== 'oauth2') {
        continue;
      }

      try {
        // Get all organizations
        const orgsSnapshot = await db.collection('organizations').get();

        for (const orgDoc of orgsSnapshot.docs) {
          const orgId = orgDoc.id;

          // Get connection
          const connectionDoc = await db
            .collection('organizations')
            .doc(orgId)
            .collection('cloudIntegrations')
            .doc(providerName)
            .get();

          if (!connectionDoc.exists) {
            continue;
          }

          const connectionData = connectionDoc.data()!;

          // Skip if not active
          if (connectionData.isActive === false) {
            continue;
          }

          // Check if token is expiring soon (within 30 minutes) or already expired
          const expiresAt = connectionData.tokenExpiresAt?.toMillis();
          if (expiresAt) {
            const timeUntilExpiry = expiresAt - Date.now();
            const thirtyMinutes = 30 * 60 * 1000;

            // Only refresh if expiring within 30 minutes or already expired
            if (timeUntilExpiry > thirtyMinutes) {
              continue;
            }
          }

          // Skip if no refresh token
          if (!connectionData.refreshToken) {
            console.log(`⚠️  No refresh token for ${providerName} in org ${orgId}`);
            continue;
          }

          try {
            // Decrypt refresh token
            const refreshToken = decryptToken(connectionData.refreshToken);

            // Refresh tokens
            const newTokens = await (provider as any).refreshTokens(refreshToken);

            // Encrypt new tokens
            const { encryptToken } = await import('../encryption');
            const encryptedAccessToken = encryptToken(newTokens.accessToken);
            const encryptedRefreshToken = newTokens.refreshToken
              ? encryptToken(newTokens.refreshToken)
              : connectionData.refreshToken; // Keep existing if not provided

            // Update connection
            await connectionDoc.ref.update({
              accessToken: encryptedAccessToken,
              refreshToken: encryptedRefreshToken,
              tokenExpiresAt: newTokens.expiresAt ? Timestamp.fromDate(newTokens.expiresAt) : null,
              lastRefreshedAt: Timestamp.now(),
              consecutiveRefreshFailures: 0 // Reset failure counter on success
            });

            refreshed++;
            console.log(`✅ Refreshed ${providerName} token for org ${orgId}`);
          } catch (error) {
            errors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`❌ Failed to refresh ${providerName} token for org ${orgId}:`, errorMessage);

            // Check if this is a PERMANENT error that requires reconnection
            // vs a TEMPORARY error that should be retried
            const isPermanentError =
              errorMessage.includes('invalid_grant') ||
              errorMessage.includes('Token has been expired or revoked') ||
              errorMessage.includes('refresh token is invalid or revoked') ||
              errorMessage.includes('token_revoked') ||
              errorMessage.includes('invalid_client') ||
              errorMessage.includes('unauthorized_client');

            // Track consecutive failures
            const failureCount = (connectionData.consecutiveRefreshFailures || 0) + 1;
            const maxRetries = 3; // Allow 3 failures before marking inactive

            if (isPermanentError) {
              // Permanent error - mark as inactive immediately
              console.error(`🚫 [refreshTokens] Permanent error for ${providerName} in org ${orgId} - marking inactive`);
              await connectionDoc.ref.update({
                isActive: false,
                refreshError: errorMessage,
                refreshErrorAt: Timestamp.now(),
                consecutiveRefreshFailures: failureCount,
                requiresReconnection: true
              });
            } else if (failureCount >= maxRetries) {
              // Too many consecutive failures - mark as inactive
              console.error(`🚫 [refreshTokens] ${failureCount} consecutive failures for ${providerName} in org ${orgId} - marking inactive`);
              await connectionDoc.ref.update({
                isActive: false,
                refreshError: `${failureCount} consecutive refresh failures: ${errorMessage}`,
                refreshErrorAt: Timestamp.now(),
                consecutiveRefreshFailures: failureCount,
                requiresReconnection: false // May recover on next attempt
              });
            } else {
              // Temporary error - log but keep active, will retry next hour
              console.warn(`⚠️ [refreshTokens] Temporary error for ${providerName} in org ${orgId} (attempt ${failureCount}/${maxRetries}) - will retry`);
              await connectionDoc.ref.update({
                lastRefreshError: errorMessage,
                lastRefreshErrorAt: Timestamp.now(),
                consecutiveRefreshFailures: failureCount
                // Keep isActive: true - will retry next hour
              });
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${providerName}:`, error);
        errors++;
      }
    }

    console.log(`✅ Token refresh complete: ${refreshed} refreshed, ${errors} errors`);
  }
);

