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
    memory: '512MiB',
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

            // CLASSIFY ERROR TYPES

            // 1. Temporary Network/Server Errors
            // These should NOT count against the failure limit at all, or very leniently
            const isTemporaryError =
              errorMessage.includes('ETIMEDOUT') ||
              errorMessage.includes('ECONNREFUSED') ||
              errorMessage.includes('ENOTFOUND') ||
              errorMessage.includes('network socket disconnected') ||
              errorMessage.includes('Network request failed') ||
              errorMessage.includes('timeout') ||
              errorMessage.includes('500') || // Internal Server Error
              errorMessage.includes('502') || // Bad Gateway
              errorMessage.includes('503') || // Service Unavailable
              errorMessage.includes('504');   // Gateway Timeout

            // 2. Permanent Auth Errors
            // These mean the user needs to re-authenticate
            const isPermanentError =
              errorMessage.includes('invalid_grant') ||
              errorMessage.includes('Token has been expired or revoked') ||
              errorMessage.includes('refresh token is invalid or revoked') ||
              errorMessage.includes('token_revoked') ||
              errorMessage.includes('invalid_client') ||
              errorMessage.includes('unauthorized_client') ||
              errorMessage.includes('usage_limit'); // Usage limit might be permanent if quota exceeded

            if (isTemporaryError) {
              console.warn(`⚠️ [refreshTokens] Temporary network error for ${providerName} in org ${orgId} - will retry without penalty`);
              // Update last error but DO NOT increment failure count
              // This ensures we never disconnect due to bad internet/server issues
              await connectionDoc.ref.update({
                lastRefreshError: errorMessage,
                lastRefreshErrorAt: Timestamp.now()
                // connection remains active, failure count unchanged
              });
              continue;
            }

            // Track consecutive failures for non-transient errors
            const failureCount = (connectionData.consecutiveRefreshFailures || 0) + 1;

            // INCREASED RETRY LIMIT
            // Previous: 3 (too low)
            // New: 15 (allows ~15 hours of recurring non-transient failures)
            const maxRetries = 15;

            if (isPermanentError) {
              // Permanent error - mark as inactive immediately
              console.error(`🚫 [refreshTokens] Permanent auth error for ${providerName} in org ${orgId} - marking inactive`);
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
                requiresReconnection: false
              });
            } else {
              // EXPONENTIAL BACKOFF
              // If we have some failures, check if we should wait before trying again
              // Failures 1-4: Try every hour (normal schedule)
              // Failures 5-9: Wait ~3 hours between tries
              // Failures 10+: Wait ~6 hours between tries

              const hoursSinceLastError = connectionData.lastRefreshErrorAt
                ? (Date.now() - connectionData.lastRefreshErrorAt.toMillis()) / (1000 * 60 * 60)
                : 1; // Default to 1 hour if no prev error

              let shouldSkip = false;
              if (failureCount >= 10 && hoursSinceLastError < 6) shouldSkip = true;
              else if (failureCount >= 5 && hoursSinceLastError < 3) shouldSkip = true;

              if (shouldSkip) {
                console.warn(`⏳ [refreshTokens] Backing off for ${providerName} in org ${orgId} (${failureCount} failures) - skipping retry`);
                continue;
              }

              // Standard retry logic
              console.warn(`⚠️ [refreshTokens] Refresh failed for ${providerName} in org ${orgId} (attempt ${failureCount}/${maxRetries}) - will retry`);
              await connectionDoc.ref.update({
                lastRefreshError: errorMessage,
                lastRefreshErrorAt: Timestamp.now(),
                consecutiveRefreshFailures: failureCount
                // Keep isActive: true
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

