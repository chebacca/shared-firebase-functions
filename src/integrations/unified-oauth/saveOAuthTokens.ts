/**
 * Save OAuth Tokens Cloud Function
 * 
 * Saves OAuth tokens with proper encryption
 * This ensures tokens are encrypted server-side before being stored in Firestore
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { encryptToken, encryptionKey } from './encryption';
import { db } from '../../shared/utils';
import { Timestamp } from 'firebase-admin/firestore';

export const saveOAuthTokens = onCall(
    {
        region: 'us-central1',
        cors: true,
        memory: '512MiB', // Avoid Cloud Run container healthcheck timeout on cold start
        secrets: [encryptionKey],
    },
    async (request) => {
        try {
            const { provider, organizationId, tokens, accountInfo } = request.data;

            // Validate input
            if (!provider || !organizationId || !tokens || !accountInfo) {
                throw new HttpsError('invalid-argument', 'Missing required parameters');
            }

            // Validate authentication
            if (!request.auth) {
                throw new HttpsError('unauthenticated', 'User must be authenticated');
            }

            if (!request.auth.token.organizationId || request.auth.token.organizationId !== organizationId) {
                throw new HttpsError('permission-denied', 'Not authorized for this organization');
            }

            // Encrypt tokens
            const encryptedAccessToken = encryptToken(tokens.accessToken);
            const encryptedRefreshToken = tokens.refreshToken
                ? encryptToken(tokens.refreshToken)
                : undefined;

            // Prepare connection data
            const connectionData: any = {
                provider,
                accountEmail: accountInfo.email,
                accountName: accountInfo.name,
                accountId: accountInfo.id,
                accessToken: encryptedAccessToken,
                tokenExpiresAt: tokens.expiresAt ? Timestamp.fromMillis(tokens.expiresAt) : null,
                isActive: true,
                connectedAt: Timestamp.now(),
                connectedBy: request.auth.uid,
                lastRefreshedAt: Timestamp.now(),
                organizationId,
                userId: request.auth.uid
            };

            // Only add refreshToken if it exists
            if (encryptedRefreshToken) {
                connectionData.refreshToken = encryptedRefreshToken;
            }

            // Save to cloudIntegrations collection
            await db
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc(provider)
                .set(connectionData);

            console.log(`✅ [saveOAuthTokens] Saved encrypted tokens for ${provider} in org ${organizationId}`);

            return { success: true };
        } catch (error: any) {
            // If it's already an HttpsError, re-throw it
            if (error instanceof HttpsError) {
                throw error;
            }

            // Log the error for debugging
            console.error(`[saveOAuthTokens] Error saving tokens:`, error);

            // Return a generic internal error
            throw new HttpsError('internal', `Failed to save OAuth tokens: ${error?.message || 'Unknown error'}`);
        }
    }
);
