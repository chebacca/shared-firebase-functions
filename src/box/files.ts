import * as functions from 'firebase-functions';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { encryptTokens, decryptTokens, decryptLegacyToken, hashForLogging } from '../integrations/encryption';
import { createSuccessResponse, createErrorResponse, setCorsHeaders, verifyAuthToken } from '../shared/utils';
import { sendSystemAlert } from '../utils/systemAlerts';
import { encryptionKey } from './secrets';
import { getBoxConfig } from './config';

/**
 * Get MIME type from file name extension
 */
function getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    const mimeTypes: Record<string, string> = {
        // Video
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'wmv': 'video/x-ms-wmv',
        'flv': 'video/x-flv',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'm4v': 'video/x-m4v',
        'mpg': 'video/mpeg',
        'mpeg': 'video/mpeg',
        '3gp': 'video/3gpp',
        
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'flac': 'audio/flac',
        'm4a': 'audio/mp4',
        'aac': 'audio/aac',
        'wma': 'audio/x-ms-wma',
        
        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        
        // Documents
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
    };
    
    return mimeTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Get Box SDK instance with configuration
 */
async function getBoxSDK(organizationId: string) {
    const config = await getBoxConfig(organizationId);
    const BoxSDK = require('box-node-sdk');
    return new BoxSDK({
        clientID: config.clientId,
        clientSecret: config.clientSecret
    });
}

/**
 * Box Integration Status
 */
export const getBoxIntegrationStatus = onCall(
    {
        region: 'us-central1',
        cors: true,
        secrets: [encryptionKey],
    },
    async (request) => {
        try {
            if (!request.auth) {
                throw new HttpsError('unauthenticated', 'Authentication required');
            }

            const userId = request.auth.uid;
            const organizationId = request.auth.token.organizationId || 'default';

            // Check organization-level token first (all users share the same Box connection)
            // Try org-level location first (organizations/{orgId}/cloudIntegrations/box)
            let integrationDoc = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc('box')
                .get();

            // Fallback to old box_org location for migration compatibility
            if (!integrationDoc.exists) {
                console.log(`[BoxIntegrationStatus] Org-level token (box) not found, trying box_org for migration...`);
                integrationDoc = await admin.firestore()
                    .collection('organizations')
                    .doc(organizationId)
                    .collection('cloudIntegrations')
                    .doc('box_org')
                    .get();
            }

            // Fallback to per-user location for migration compatibility
            if (!integrationDoc.exists) {
                console.log(`[BoxIntegrationStatus] Trying per-user location for migration...`);
                integrationDoc = await admin.firestore()
                    .collection('organizations')
                    .doc(organizationId)
                    .collection('cloudIntegrations')
                    .doc(`box_${userId}`)
                    .get();
            }

            // Fallback to old global location for migration compatibility
            if (!integrationDoc.exists) {
                integrationDoc = await admin.firestore()
                    .collection('cloudIntegrations')
                    .doc(`${organizationId}_box_${userId}`)
                    .get();
            }

            if (!integrationDoc.exists) {
                return createSuccessResponse({ connected: false });
            }

            const integrationData = integrationDoc.data();

            // Handle both old format (milliseconds) and new format (Timestamp)
            let expiresAt: Date | null = null;

            // Check expiresAt timestamp first (new format)
            if (integrationData?.expiresAt) {
                if (typeof integrationData.expiresAt.toDate === 'function') {
                    expiresAt = integrationData.expiresAt.toDate();
                } else if (typeof integrationData.expiresAt === 'number') {
                    expiresAt = new Date(integrationData.expiresAt);
                }
            }
            // Fallback to expiresAtMillis (old format - plain number)
            else if (integrationData?.expiresAtMillis) {
                expiresAt = new Date(Number(integrationData.expiresAtMillis));
            }

            // Quick check: if access token is expired, definitely not connected
            const accessTokenExpired = expiresAt && expiresAt < new Date();
            if (accessTokenExpired) {
                return createSuccessResponse({
                    connected: false,
                    accountEmail: integrationData?.accountEmail,
                    accountName: integrationData?.accountName,
                    expiresAt: expiresAt?.toISOString() || null
                });
            }

            // ✅ CRITICAL: Actually validate the refresh token by attempting to refresh
            // This catches cases where the refresh token has expired even if expiresAt hasn't passed
            // We do this to ensure the status check is accurate
            try {
                // Try to refresh the token - this validates both access and refresh tokens
                const tokens = await refreshBoxAccessToken(userId, organizationId);
                
                // If refresh succeeded, tokens are valid
                if (tokens && tokens.accessToken) {
                    return createSuccessResponse({
                        connected: true,
                        accountEmail: integrationData?.accountEmail,
                        accountName: integrationData?.accountName,
                        expiresAt: tokens.expiresAt instanceof Date
                            ? tokens.expiresAt.toISOString()
                            : (typeof tokens.expiresAt === 'string'
                                ? tokens.expiresAt
                                : (tokens.expiresAt?.toDate?.()?.toISOString() || expiresAt?.toISOString() || null))
                    });
                } else {
                    // Refresh returned no tokens - connection invalid
                    return createSuccessResponse({
                        connected: false,
                        accountEmail: integrationData?.accountEmail,
                        accountName: integrationData?.accountName,
                        expiresAt: expiresAt?.toISOString() || null
                    });
                }
            } catch (refreshError: any) {
                // If refresh fails, the connection is invalid
                const errorMessage = refreshError?.message || String(refreshError);
                console.log(`[BoxIntegrationStatus] Token refresh validation failed: ${errorMessage}`);
                
                // Check if it's an expired token error
                const isExpiredError = errorMessage.includes('expired') ||
                                     errorMessage.includes('Expired Auth') ||
                                     errorMessage.includes('invalid_grant') ||
                                     errorMessage.includes('refresh token');
                
                return createSuccessResponse({
                    connected: false,
                    accountEmail: integrationData?.accountEmail,
                    accountName: integrationData?.accountName,
                    expiresAt: expiresAt?.toISOString() || null
                });
            }

        } catch (error: any) {
            console.error('Failed to get Box integration status:', error);
            throw error instanceof HttpsError ? error : new HttpsError('internal', error.message || 'Failed to get integration status');
        }
    }
);

/**
 * Refresh Box access token
 */
export async function refreshBoxAccessToken(userId: string, organizationId: string): Promise<any> {
    try {
        // Use organization-level token (box) - all users in org share the same Box connection
        // Try new org-level location first (organizations/{orgId}/cloudIntegrations/box)
        let integrationDoc = await admin.firestore()
            .collection('organizations')
            .doc(organizationId)
            .collection('cloudIntegrations')
            .doc('box')
            .get();

        // Fallback to old box_org location for migration compatibility
        if (!integrationDoc.exists) {
            console.log(`[BoxTokenRefresh] Org-level token (box) not found, trying box_org for migration...`);
            integrationDoc = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc('box_org')
                .get();
        }

        // Fallback to old per-user location for migration compatibility
        if (!integrationDoc.exists) {
            console.log(`[BoxTokenRefresh] Trying per-user location for migration...`);
            integrationDoc = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc(`box_${userId}`)
                .get();
        }

        // Fallback to old global location for migration compatibility
        if (!integrationDoc.exists) {
            integrationDoc = await admin.firestore()
                .collection('cloudIntegrations')
                .doc(`${organizationId}_box_${userId}`)
                .get();
        }

        // If no cloudIntegrations document found, check boxConnections collection
        let connectionId: string | undefined;
        if (!integrationDoc.exists) {
            console.log(`[BoxTokenRefresh] No cloudIntegrations document found, checking boxConnections...`);
            
            // Query boxConnections for organization-level connection
            const boxConnectionsQuery = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('boxConnections')
                .where('organizationId', '==', organizationId)
                .where('connectionType', '==', 'organization')
                .limit(1)
                .get();

            if (!boxConnectionsQuery.empty) {
                const connectionDoc = boxConnectionsQuery.docs[0];
                const connData = connectionDoc.data();
                connectionId = connectionDoc.id;
                
                console.log(`[BoxTokenRefresh] Found Box connection in boxConnections, creating cloudIntegrations document...`);
                
                // Create cloudIntegrations document from boxConnections data
                const unifiedIntegrationRef = admin.firestore()
                    .collection('organizations')
                    .doc(organizationId)
                    .collection('cloudIntegrations')
                    .doc('box');

                // Decrypt tokens from boxConnections format
                let accessToken: string | undefined;
                let refreshToken: string | undefined;
                
                if (connData?.accessToken) {
                    try {
                        accessToken = decryptLegacyToken(connData.accessToken);
                    } catch (e) {
                        console.warn(`[BoxTokenRefresh] Failed to decrypt accessToken from boxConnections:`, e);
                        accessToken = connData.accessToken;
                    }
                }
                
                if (connData?.refreshToken) {
                    try {
                        refreshToken = decryptLegacyToken(connData.refreshToken);
                    } catch (e) {
                        console.warn(`[BoxTokenRefresh] Failed to decrypt refreshToken from boxConnections:`, e);
                        refreshToken = connData.refreshToken;
                    }
                }

                if (accessToken || refreshToken) {
                    const migratedTokens = {
                        accessToken: accessToken || '',
                        refreshToken: refreshToken || '',
                        expiresAt: connData?.tokenExpiresAt?.toDate?.() || null
                    };

                    // Encrypt with new format
                    const unifiedEncryptedTokens = encryptTokens(migratedTokens);

                    // Create unified document
                    const unifiedDoc = {
                        userId: connData.userId || 'system',
                        organizationId: organizationId,
                        provider: 'box',
                        accountEmail: connData.accountEmail || connData.email || '',
                        accountName: connData.accountName || connData.name || 'Box User',
                        accountId: connData.accountId || '',
                        connectionId: connectionId,
                        encryptedTokens: unifiedEncryptedTokens,
                        isActive: true,
                        connectionMethod: 'oauth',
                        connectedAt: connData.connectedAt || admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        expiresAt: connData?.tokenExpiresAt || null
                    };

                    await unifiedIntegrationRef.set(unifiedDoc, { merge: true });
                    console.log(`[BoxTokenRefresh] Successfully created cloudIntegrations/box from boxConnections`);
                    
                    // Re-fetch the document we just created
                    integrationDoc = await unifiedIntegrationRef.get();
                }
            }
        }

        if (!integrationDoc.exists) {
            console.error(`[BoxTokenRefresh] Integration not found for org ${organizationId} in cloudIntegrations or boxConnections`);
            throw new Error('Box integration not found. Please have an admin connect the Box account.');
        }

        const integrationData = integrationDoc.data();
        console.log(`[BoxTokenRefresh] Integration document found, checking for tokens...`, {
            hasEncryptedTokens: !!integrationData?.encryptedTokens,
            hasAccessToken: !!integrationData?.accessToken,
            hasRefreshToken: !!integrationData?.refreshToken,
            accessTokenLength: integrationData?.accessToken?.length || 0,
            refreshTokenLength: integrationData?.refreshToken?.length || 0
        });
        
        let encryptedTokens = integrationData?.encryptedTokens;

        // PRIORITY 1: Check for direct accessToken/refreshToken fields (unified OAuth or legacy format)
        // This handles both unified OAuth encrypted format AND legacy colon-hex format
        if (integrationData?.accessToken || integrationData?.refreshToken) {
            console.log(`[BoxTokenRefresh] Found accessToken/refreshToken fields, attempting to decrypt...`);
            
            let accessToken: string | undefined;
            let refreshToken: string | undefined;
            
            // Try to decrypt accessToken
            if (integrationData.accessToken) {
                // First try unified OAuth decryption (for new format)
                try {
                    const { decryptToken } = await import('../integrations/unified-oauth/encryption');
                    accessToken = decryptToken(integrationData.accessToken);
                    console.log(`[BoxTokenRefresh] Successfully decrypted accessToken using unified OAuth format`);
                } catch (unifiedError: any) {
                    // Fall back to legacy colon-hex format
                    console.log(`[BoxTokenRefresh] Unified OAuth decryption failed, trying legacy format...`, unifiedError.message);
                    try {
                        if (integrationData.accessToken.includes(':')) {
                            accessToken = decryptLegacyToken(integrationData.accessToken);
                            console.log(`[BoxTokenRefresh] Successfully decrypted accessToken using legacy colon-hex format`);
                        } else {
                            // Might be plaintext (shouldn't happen but handle it)
                            accessToken = integrationData.accessToken;
                            console.log(`[BoxTokenRefresh] Using accessToken as-is (appears to be plaintext)`);
                        }
                    } catch (legacyError: any) {
                        console.error(`[BoxTokenRefresh] Failed to decrypt accessToken (both formats failed):`, legacyError.message);
                        // Don't throw here - continue to try refreshToken
                    }
                }
            }
            
            // Try to decrypt refreshToken
            if (integrationData.refreshToken) {
                // First try unified OAuth decryption (for new format)
                try {
                    const { decryptToken } = await import('../integrations/unified-oauth/encryption');
                    refreshToken = decryptToken(integrationData.refreshToken);
                    console.log(`[BoxTokenRefresh] Successfully decrypted refreshToken using unified OAuth format`);
                } catch (unifiedError: any) {
                    // Fall back to legacy colon-hex format
                    console.log(`[BoxTokenRefresh] Unified OAuth decryption failed for refreshToken, trying legacy format...`, unifiedError.message);
                    try {
                        if (integrationData.refreshToken.includes(':')) {
                            refreshToken = decryptLegacyToken(integrationData.refreshToken);
                            console.log(`[BoxTokenRefresh] Successfully decrypted refreshToken using legacy colon-hex format`);
                        } else {
                            refreshToken = integrationData.refreshToken;
                            console.log(`[BoxTokenRefresh] Using refreshToken as-is (appears to be plaintext)`);
                        }
                    } catch (legacyError: any) {
                        console.warn(`[BoxTokenRefresh] Failed to decrypt refreshToken (both formats failed):`, legacyError.message);
                        // Refresh token is optional for some operations
                    }
                }
            }
            
            // If we successfully decrypted at least the accessToken, use it
            if (accessToken) {
                console.log(`[BoxTokenRefresh] Successfully decrypted tokens, creating token object...`);
                const unifiedTokens = {
                    accessToken,
                    refreshToken,
                    expiresAt: integrationData?.tokenExpiresAt?.toDate?.() || 
                              integrationData?.expiresAt?.toDate?.() || 
                              null
                };
                
                // Check if token is expired
                const expiresAt = unifiedTokens.expiresAt instanceof Date
                    ? unifiedTokens.expiresAt
                    : typeof unifiedTokens.expiresAt === 'string'
                        ? new Date(unifiedTokens.expiresAt)
                        : unifiedTokens.expiresAt?.toDate?.();
                
                const needsRefresh = expiresAt && expiresAt < new Date(Date.now() + 60000);
                
                if (!needsRefresh && unifiedTokens.accessToken) {
                    // Token is still valid, return it
                    console.log(`[BoxTokenRefresh] Using valid token (not expired)`);
                    return unifiedTokens;
                } else if (!unifiedTokens.expiresAt && unifiedTokens.accessToken) {
                    // No expiry info, assume it's valid for now
                    console.log(`[BoxTokenRefresh] Using token (no expiry info, assuming valid)`);
                    return unifiedTokens;
                } else if (needsRefresh && unifiedTokens.refreshToken) {
                    // Token expired, need to refresh - convert to encryptedTokens format for refresh logic
                    console.log(`[BoxTokenRefresh] Token expired, will refresh using refreshToken...`);
                    encryptedTokens = encryptTokens(unifiedTokens);
                } else {
                    // No refresh token or expired, but we have accessToken - try using it anyway
                    console.warn(`[BoxTokenRefresh] Token may be expired but no refresh token, using accessToken anyway`);
                    return unifiedTokens;
                }
            } else {
                console.warn(`[BoxTokenRefresh] Failed to decrypt accessToken, will check for encryptedTokens or try migration...`);
            }
        }

        // MIGRATION: If encryptedTokens missing, try to migrate from legacy format
        if (!encryptedTokens) {
            console.log(`[BoxTokenRefresh] encryptedTokens missing, attempting migration from legacy format...`);
            
            // Try migration from boxConnections first (if connectionId exists)
            if (integrationData?.connectionId) {
                try {
                    const connectionDoc = await admin.firestore()
                        .collection('organizations')
                        .doc(organizationId)
                        .collection('boxConnections')
                        .doc(integrationData.connectionId)
                        .get();

                    if (connectionDoc.exists) {
                        const connData = connectionDoc.data();
                        if (connData?.accessToken) {
                            console.log(`[BoxTokenRefresh] Found tokens in boxConnections, migrating to cloudIntegrations...`);

                            // Decrypt legacy format
                            const accessToken = decryptLegacyToken(connData.accessToken);
                            const refreshToken = connData.refreshToken ? decryptLegacyToken(connData.refreshToken) : undefined;

                            const migratedTokens = {
                                accessToken,
                                refreshToken,
                                expiresAt: connData.tokenExpiresAt?.toDate?.() || null
                            };

                            // Encrypt with new format
                            encryptedTokens = encryptTokens(migratedTokens);

                            // Save to unified doc for next time
                            await integrationDoc.ref.update({
                                encryptedTokens,
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`[BoxTokenRefresh] Successfully migrated tokens from boxConnections to cloudIntegrations/box`);
                        }
                    }
                } catch (migrationError) {
                    console.warn(`[BoxTokenRefresh] Migration from boxConnections failed:`, migrationError);
                }
            }

            // If still no encryptedTokens, try migrating from legacy accessToken/refreshToken fields in cloudIntegrations
            if (!encryptedTokens && (integrationData?.accessToken || integrationData?.refreshToken)) {
                try {
                    console.log(`[BoxTokenRefresh] Found legacy accessToken/refreshToken fields, migrating to encryptedTokens format...`);
                    
                    let accessToken: string | undefined;
                    let refreshToken: string | undefined;
                    
                    // Decrypt legacy format if present
                    if (integrationData.accessToken) {
                        try {
                            // Try legacy colon-hex format first
                            if (integrationData.accessToken.includes(':')) {
                                accessToken = decryptLegacyToken(integrationData.accessToken);
                            } else {
                                // Might already be plaintext (shouldn't happen but handle it)
                                accessToken = integrationData.accessToken;
                            }
                        } catch (decryptError) {
                            console.warn(`[BoxTokenRefresh] Failed to decrypt accessToken, using as-is:`, decryptError);
                            accessToken = integrationData.accessToken;
                        }
                    }
                    
                    if (integrationData.refreshToken) {
                        try {
                            // Try legacy colon-hex format first
                            if (integrationData.refreshToken.includes(':')) {
                                refreshToken = decryptLegacyToken(integrationData.refreshToken);
                            } else {
                                // Might already be plaintext (shouldn't happen but handle it)
                                refreshToken = integrationData.refreshToken;
                            }
                        } catch (decryptError) {
                            console.warn(`[BoxTokenRefresh] Failed to decrypt refreshToken, using as-is:`, decryptError);
                            refreshToken = integrationData.refreshToken;
                        }
                    }

                    if (accessToken || refreshToken) {
                        const migratedTokens = {
                            accessToken: accessToken || '',
                            refreshToken: refreshToken || '',
                            expiresAt: integrationData?.tokenExpiresAt?.toDate?.() || 
                                      integrationData?.expiresAt?.toDate?.() || 
                                      null
                        };

                        // Encrypt with new format
                        encryptedTokens = encryptTokens(migratedTokens);

                        // Save to unified doc for next time
                        await integrationDoc.ref.update({
                            encryptedTokens,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                        console.log(`[BoxTokenRefresh] Successfully migrated legacy tokens to encryptedTokens format`);
                    }
                } catch (migrationError) {
                    console.warn(`[BoxTokenRefresh] Migration from legacy fields failed:`, migrationError);
                }
            }
        }

        if (!encryptedTokens) {
            console.error(`[BoxTokenRefresh] No encrypted tokens found for user ${hashForLogging(userId)}`);
            throw new Error('No tokens found for Box integration. Please re-connect your Box account.');
        }

        // Decrypt tokens
        let tokens;
        try {
            tokens = decryptTokens(encryptedTokens);
            console.log(`[BoxTokenRefresh] Successfully decrypted tokens for user ${hashForLogging(userId)}`);
        } catch (decryptError: any) {
            console.error(`[BoxTokenRefresh] Failed to decrypt tokens:`, decryptError.message);
            throw new Error('Failed to decrypt Box tokens. Please re-connect your Box account.');
        }

        // Check if access token is still valid (not expired)
        // If expiresAt is set and not expired, use the existing access token
        if (tokens.expiresAt && tokens.accessToken) {
            const expiresAt = tokens.expiresAt instanceof Date
                ? tokens.expiresAt
                : typeof tokens.expiresAt === 'string'
                    ? new Date(tokens.expiresAt)
                    : tokens.expiresAt?.toDate?.();

            if (expiresAt && expiresAt > new Date(Date.now() + 60000)) { // 1 minute buffer
                console.log(`[BoxTokenRefresh] Access token still valid, using existing token`);
                return {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt
                };
            }
        }

        // Token expired or no expiry info, refresh it
        if (!tokens.refreshToken) {
            console.error(`[BoxTokenRefresh] No refresh token available for user ${hashForLogging(userId)}`);
            throw new Error('No refresh token available. Please re-connect your Box account.');
        }

        console.log(`[BoxTokenRefresh] Refreshing access token for user ${hashForLogging(userId)}`);

        // Get Box config - try organization-specific config first, then fall back to defaults
        const defaultConfig = await getBoxConfig(organizationId);
        let boxConfig = {
            clientId: defaultConfig.clientId,
            clientSecret: defaultConfig.clientSecret
        };

        // Check if credentials are stored in the integration document (for user-provided credentials)
        if (integrationData?.oauthCredentials) {
            try {
                const storedCredentials = decryptTokens(integrationData.oauthCredentials);
                boxConfig.clientId = storedCredentials.clientId || boxConfig.clientId;
                boxConfig.clientSecret = storedCredentials.clientSecret || boxConfig.clientSecret;
                console.log(`[BoxTokenRefresh] Using credentials from integration document`);
            } catch (decryptError) {
                console.warn(`[BoxTokenRefresh] Failed to decrypt stored credentials, using Firebase config:`, decryptError);
            }
        }

        if (!boxConfig.clientId || !boxConfig.clientSecret) {
            throw new Error('Box client ID and secret must be configured.');
        }

        // Refresh token
        const BoxSDK = require('box-node-sdk');
        const boxSDK = new BoxSDK({
            clientID: boxConfig.clientId,
            clientSecret: boxConfig.clientSecret
        });

        let tokenInfo;
        try {
            tokenInfo = await boxSDK.getTokensRefreshGrant(tokens.refreshToken);
            console.log(`[BoxTokenRefresh] Successfully refreshed token for user ${hashForLogging(userId)}`);
        } catch (refreshError: any) {
            console.error(`[BoxTokenRefresh] Token refresh failed:`, {
                error: refreshError.message,
                stack: refreshError.stack,
                userId: hashForLogging(userId),
                organizationId
            });

            // Check if refresh token has expired
            const isRefreshTokenExpired =
                refreshError.message?.toLowerCase().includes('refresh token') &&
                refreshError.message?.toLowerCase().includes('expired');

            if (isRefreshTokenExpired || refreshError.statusCode === 400) {
                // Mark integration as inactive so user knows to reconnect
                try {
                    const orgLevelRef = admin.firestore()
                        .collection('organizations')
                        .doc(organizationId)
                        .collection('cloudIntegrations')
                        .doc('box');

                    await orgLevelRef.update({
                        isActive: false,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[BoxTokenRefresh] Marked Box integration as inactive due to expired refresh token`);
                } catch (updateError) {
                    console.warn(`[BoxTokenRefresh] Failed to mark integration as inactive:`, updateError);
                }

                // Send system alert
                await sendSystemAlert(
                    organizationId,
                    'Box Integration Failed',
                    'The Box integration has been disconnected due to an expired refresh token. Please re-authenticate in Integration Settings.',
                    {
                        error: refreshError.message,
                        statusCode: refreshError.statusCode
                    }
                );

                throw new Error('Box refresh token has expired. Please have an admin re-connect the Box account in Integration Settings.');
            }

            throw new Error(`Failed to refresh Box token: ${refreshError.message}. Please have an admin re-connect the Box account.`);
        }

        // Encrypt new tokens
        // Box may or may not return a new refresh token - if not provided, keep the existing one
        const newTokens = {
            accessToken: tokenInfo.accessToken,
            refreshToken: tokenInfo.refreshToken || tokens.refreshToken, // Use new refresh token if provided, otherwise keep existing
            expiresAt: tokenInfo.expiresAt
        };

        if (!newTokens.refreshToken) {
            console.warn(`[BoxTokenRefresh] No refresh token in refresh response, keeping existing token`);
        }

        const newEncryptedTokens = encryptTokens(newTokens);

        // Update Firestore - use new location format
        const expiresAtTimestamp = tokenInfo.expiresAt
            ? admin.firestore.Timestamp.fromDate(new Date(tokenInfo.expiresAt))
            : null;

        const updateData: any = {
            encryptedTokens: newEncryptedTokens,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: expiresAtTimestamp
        };

        // Always update/migrate to org-level location (box)
        const orgLevelRef = admin.firestore()
            .collection('organizations')
            .doc(organizationId)
            .collection('cloudIntegrations')
            .doc('box');

        if (integrationDoc.ref.path === orgLevelRef.path) {
            // Already in org-level location, just update
            await orgLevelRef.update(updateData);
            console.log(`[BoxTokenRefresh] Updated org-level token for org ${organizationId}`);
        } else {
            // Migrate to org-level location
            console.log(`[BoxTokenRefresh] Migrating token from ${integrationDoc.ref.path} to org-level location`);
            await orgLevelRef.set({
                ...integrationData,
                ...updateData,
                createdAt: integrationData?.createdAt || admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[BoxTokenRefresh] Successfully migrated to org-level token for org ${organizationId}`);
        }

        return newTokens;

    } catch (error) {
        console.error('[BoxTokenRefresh] Box token refresh failed:', {
            error: error instanceof Error ? error.message : String(error),
            userId: hashForLogging(userId),
            organizationId
        });
        throw error;
    }
}

/**
 * Get Box access token (decrypted)
 */
export const getBoxAccessToken = onCall(
    {
        region: 'us-central1',
        cors: true,
        secrets: [encryptionKey],
    },
    async (request) => {
        try {
            if (!request.auth) {
                throw new HttpsError('unauthenticated', 'Authentication required');
            }

            const userId = request.auth.uid;
            const organizationId = request.auth.token.organizationId || 'default';

            // Get and refresh organization-level tokens (this handles decryption)
            const tokens = await refreshBoxAccessToken(userId, organizationId);

            return createSuccessResponse({
                accessToken: tokens.accessToken,
                expiresAt: tokens.expiresAt instanceof Date
                    ? tokens.expiresAt.toISOString()
                    : typeof tokens.expiresAt === 'string'
                        ? tokens.expiresAt
                        : tokens.expiresAt?.toDate?.()?.toISOString() || null
            });

        } catch (error: any) {
            console.error('Failed to get Box access token:', error);
            
            // Preserve the original error message if it's user-friendly
            const errorMessage = error.message || 'Failed to get access token';
            
            // If it's already an HttpsError, preserve it
            if (error instanceof HttpsError) {
                throw error;
            }
            
            // For integration not found errors, use a more specific error code
            if (errorMessage.includes('not found') || errorMessage.includes('No tokens found')) {
                throw new HttpsError('not-found', errorMessage);
            }
            
            // For decryption errors, use failed-precondition (indicates user action needed)
            if (errorMessage.includes('Failed to decrypt') || 
                errorMessage.includes('decrypt') ||
                errorMessage.includes('corrupted') ||
                errorMessage.includes('encrypted with a different key')) {
                throw new HttpsError('failed-precondition', errorMessage);
            }
            
            // For other errors, use internal but preserve the message
            throw new HttpsError('internal', errorMessage);
        }
    }
);

/**
 * List Box folders
 */
export const listBoxFolders = functions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new Error('Authentication required');
        }

        const userId = context.auth.uid;
        const organizationId = context.auth.token.organizationId || 'default';
        const { folderId = '0' } = data; // '0' is root folder in Box

        // Get and refresh organization-level tokens
        const tokens = await refreshBoxAccessToken(userId, organizationId);

        if (!tokens || !tokens.accessToken) {
            throw new Error('No access token available. Please re-connect your Box account.');
        }

        const boxSDK = await getBoxSDK(organizationId);
        const client = boxSDK.getBasicClient(tokens.accessToken);

        // List folders
        let response;
        try {
            response = await client.folders.getItems(folderId, {
                fields: 'id,name,type,created_at,modified_at,parent',
                limit: 1000
            });

            // Handle case where response.entries might be undefined or empty
            if (!response || !response.entries || !Array.isArray(response.entries)) {
                return { success: true, folders: [] };
            }

            const folders = response.entries
                .filter((item: any) => item && item.type === 'folder')
                .map((folder: any) => ({
                    id: folder.id,
                    name: folder.name,
                    type: folder.type,
                    createdTime: folder.created_at,
                    modifiedTime: folder.modified_at,
                    parents: folder.parent ? [folder.parent.id] : []
                }));

            return createSuccessResponse({ folders });

        } catch (apiError: any) {
            if (apiError.statusCode === 401) {
                throw new Error('Box authentication failed. Please re-connect your Box account.');
            } else if (apiError.statusCode === 404) {
                throw new Error(`Box folder not found: ${folderId}`);
            } else if (apiError.statusCode === 403) {
                throw new Error('Access denied. Please check your Box account permissions.');
            } else {
                throw new Error(`Box API error: ${apiError.message || 'Unknown error'}`);
            }
        }

    } catch (error) {
        console.error('[BoxFolders] Failed to list Box folders:', error);
        return createErrorResponse('Failed to list folders', error instanceof Error ? error.message : 'Unknown error');
    }
});

/**
 * Get Box files in a folder
 */
export const getBoxFiles = functions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new Error('Authentication required');
        }

        const userId = context.auth.uid;
        const organizationId = context.auth.token.organizationId || 'default';
        const { folderId } = data;

        if (!folderId) {
            throw new Error('Folder ID is required');
        }

        // Get and refresh organization-level tokens
        const tokens = await refreshBoxAccessToken(userId, organizationId);
        const boxSDK = await getBoxSDK(organizationId);
        const client = boxSDK.getBasicClient(tokens.accessToken);

        // List files in folder
        const response = await client.folders.getItems(folderId, {
            fields: 'id,name,type,size,created_at,modified_at,shared_link',
            limit: 1000
        });

        const files = response.entries
            .filter((item: any) => item.type === 'file')
            .map((file: any) => ({
                id: file.id,
                name: file.name,
                type: file.type,
                size: file.size,
                createdTime: file.created_at,
                modifiedTime: file.modified_at,
                downloadUrl: file.shared_link?.download_url
            }));

        return createSuccessResponse({ files });

    } catch (error) {
        console.error('Failed to get Box files:', error);
        return createErrorResponse('Failed to get files', error instanceof Error ? error.message : 'Unknown error');
    }
});

/**
 * Create Box folder
 */
export const createBoxFolder = functions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new Error('Authentication required');
        }

        const userId = context.auth.uid;
        const organizationId = context.auth.token.organizationId || 'default';
        const { name, parentId = '0' } = data; // '0' is root folder in Box

        if (!name) {
            throw new Error('Folder name is required');
        }

        // Get and refresh tokens
        const tokens = await refreshBoxAccessToken(userId, organizationId);
        const boxSDK = await getBoxSDK(organizationId);
        const client = boxSDK.getBasicClient(tokens.accessToken);

        // Create folder
        const response = await client.folders.create(parentId, name);

        const folder = {
            id: response.id,
            name: response.name,
            type: response.type,
            createdTime: response.created_at,
            modifiedTime: response.modified_at,
            parents: response.parent ? [response.parent.id] : []
        };

        return createSuccessResponse({ folder });

    } catch (error) {
        console.error('Failed to create Box folder:', error);
        return createErrorResponse('Failed to create folder', error instanceof Error ? error.message : 'Unknown error');
    }
});

/**
 * Upload file to Box - HTTP version with CORS support
 */
export const uploadToBoxHttp = functions.https.onRequest(async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        // Handle preflight requests
        if (req.method === 'OPTIONS') {
            setCorsHeaders(req, res);
            res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.set('Access-Control-Max-Age', '3600');
            res.status(200).send('');
            return;
        }

        // Set CORS headers
        setCorsHeaders(req, res);

        // Only allow POST requests
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        // Verify user authentication
        const { userId, organizationId } = await verifyAuthToken(req);

        const { fileName, fileContent, folderId = '0' } = req.body;

        if (!fileName || !fileContent) {
            res.status(400).json(createErrorResponse('File name and content are required'));
            return;
        }

        // Get and refresh tokens
        const tokens = await refreshBoxAccessToken(userId, organizationId);
        const boxSDK = await getBoxSDK(organizationId);
        const client = boxSDK.getBasicClient(tokens.accessToken);

        // Convert base64 content to buffer
        const fileBuffer = Buffer.from(fileContent, 'base64');

        // Upload file
        let uploadResponse;
        try {
            uploadResponse = await client.files.uploadFile(folderId, fileName, fileBuffer, null);
        } catch (uploadError: any) {
            console.error(`[${requestId}] Box SDK uploadFile error:`, uploadError);
            throw uploadError;
        }

        const uploadedFile = uploadResponse?.entries?.[0] || uploadResponse;

        if (!uploadedFile || !uploadedFile.id) {
            throw new Error('Box upload response missing file ID');
        }

        // Create a shared link for the file so it can be accessed
        let sharedLink = uploadedFile.shared_link;
        if (!sharedLink) {
            try {
                const sharedLinkResponse = await client.files.update(uploadedFile.id, {
                    shared_link: {
                        access: 'open',
                        permissions: {
                            can_download: true,
                            can_preview: true
                        }
                    }
                });
                sharedLink = sharedLinkResponse.shared_link;
            } catch (linkError) {
                console.warn(`[${requestId}] ⚠️ Failed to create shared link (file still uploaded):`, linkError);
            }
        }

        const file = {
            id: String(uploadedFile.id),
            name: uploadedFile.name,
            type: uploadedFile.type,
            size: uploadedFile.size,
            createdTime: uploadedFile.created_at,
            modifiedTime: uploadedFile.modified_at,
            downloadUrl: sharedLink?.download_url || `https://app.box.com/file/${uploadedFile.id}`,
            webViewLink: sharedLink?.url || `https://app.box.com/file/${uploadedFile.id}`
        };

        res.status(200).json(createSuccessResponse({ file }));

    } catch (error: any) {
        console.error(`[${requestId}] ❌ Failed to upload to Box:`, error);

        // Handle specific Box API errors
        if (error?.statusCode === 409 || error?.status === 409) {
            const errorMessage = error?.body?.message || error?.message || 'A file with this name already exists';
            res.status(409).json(createErrorResponse('File already exists', errorMessage));
            return;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const statusCode = error?.statusCode || error?.status || 500;
        res.status(statusCode).json(createErrorResponse('Failed to upload file', errorMessage));
    }
});

/**
 * Index Box folder - List files and store metadata with shared links for organization-wide access
 */
export const indexBoxFolder = functions.https.onCall(async (data, context) => {
    try {
        // Verify authentication
        if (!context.auth) {
            return createErrorResponse('Authentication required', 'UNAUTHENTICATED');
        }

        const { folderId, organizationId } = data;
        const userId = context.auth.uid;

        if (!folderId || !organizationId) {
            return createErrorResponse('Folder ID and organization ID are required', 'INVALID_ARGUMENT');
        }

        // Get organization-level encrypted tokens from Firestore
        let integrationDoc = await admin.firestore()
            .collection('organizations')
            .doc(organizationId)
            .collection('cloudIntegrations')
            .doc('box')
            .get();

        // Fallback logic for migration...
        if (!integrationDoc.exists) {
            integrationDoc = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc('box_org')
                .get();
        }

        if (!integrationDoc.exists) {
            integrationDoc = await admin.firestore()
                .collection('organizations')
                .doc(organizationId)
                .collection('cloudIntegrations')
                .doc(`box_${userId}`)
                .get();
        }

        if (!integrationDoc.exists) {
            return createErrorResponse('Box not connected. Please have an admin connect the Box account.', 'NOT_FOUND');
        }

        const integrationData = integrationDoc.data();

        // Decrypt tokens and refresh if needed
        const tokens = await refreshBoxAccessToken(userId, organizationId);

        // Set up Box client
        const boxSDK = await getBoxSDK(organizationId);
        const client = boxSDK.getBasicClient(tokens.accessToken);

        // List files
        const folderItems = await client.folders.getItems(folderId, {
            fields: 'id,name,type,size,created_at,modified_at,shared_link,parent',
            limit: 1000
        });

        const files = folderItems.entries || [];

        // Filter to only files (not folders) and create shared links for video files
        const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv', '.mpg', '.mpeg'];
        const batch = admin.firestore().batch();
        const indexedFilesRef = admin.firestore()
            .collection('organizations')
            .doc(organizationId)
            .collection('boxIndexedFiles');

        let filesIndexed = 0;
        let sharedLinksCreated = 0;

        for (const item of files) {
            // Only process files, skip folders
            if (item.type !== 'file') {
                continue;
            }

            const fileName = item.name || '';
            const isVideo = videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));

            let sharedLink = item.shared_link?.url;

            // If it's a video file and doesn't have a shared link, create one
            if (isVideo && !sharedLink) {
                try {
                    const updatedFile = await client.files.update(item.id, {
                        shared_link: {
                            access: 'open', // Anyone with the link can view
                            permissions: {
                                can_download: true,
                                can_preview: true
                            }
                        }
                    });
                    sharedLink = updatedFile.shared_link?.url;
                    if (sharedLink) {
                        sharedLinksCreated++;
                    }
                } catch (linkError) {
                    console.warn(`⚠️ [BoxIndexing] Failed to create shared link for ${fileName}:`, linkError);
                }
            }

            // Store indexed file in Firestore
            const fileDoc = {
                name: fileName,
                boxFileId: item.id,
                mimeType: '', // Box API doesn't always provide mime type in list
                size: item.size || 0,
                webViewLink: sharedLink || undefined,
                downloadUrl: sharedLink || undefined,
                parentFolderId: folderId,
                boxUserId: userId,
                boxUserEmail: integrationData?.accountEmail || '',
                indexedBy: userId,
                indexedAt: admin.firestore.FieldValue.serverTimestamp(),
                organizationId: organizationId,
                createdAt: item.created_at || null,
                modifiedAt: item.modified_at || null,
                hasSharedLink: !!sharedLink,
                isVideo: isVideo
            };

            batch.set(indexedFilesRef.doc(item.id), fileDoc);
            filesIndexed++;
        }

        await batch.commit();

        return createSuccessResponse({
            success: true,
            filesIndexed: filesIndexed,
            folderId: folderId,
            sharedLinksCreated: sharedLinksCreated
        });

    } catch (error) {
        console.error('❌ [BoxIndexing] Failed to index Box folder:', error);
        return createErrorResponse('Failed to index folder', error instanceof Error ? error.message : 'Unknown error');
    }
});

/**
 * Proxy Box file streaming with authentication
 */
export const boxStream = functions.https.onRequest(async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        // Set CORS headers
        setCorsHeaders(req, res);

        if (req.method === 'OPTIONS') {
            res.status(200).send('');
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const authToken = req.query.auth as string;
        if (!authToken) {
            res.status(401).send('Authentication required');
            return;
        }

        let userId: string;
        let organizationId: string;
        try {
            const decoded = await admin.auth().verifyIdToken(authToken);
            userId = decoded.uid;
            organizationId = decoded.organizationId || 'default';
        } catch (tokenError) {
            res.status(401).send('Invalid authentication token');
            return;
        }

        const fileId = req.query.fileId as string;
        if (!fileId) {
            res.status(400).send('File ID is required');
            return;
        }

        // Get and refresh Box access token
        let tokens;
        try {
            tokens = await refreshBoxAccessToken(userId, organizationId);
        } catch (tokenError: any) {
            res.status(401).json({
                error: 'Failed to get Box access token',
                message: tokenError.message || 'Please reconnect your Box account'
            });
            return;
        }

        const range = req.headers.range;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${tokens.accessToken}`,
        };

        if (range) {
            headers['Range'] = range;
        }

        const https = require('https');
        const url = require('url');
        const boxUrl = `https://api.box.com/2.0/files/${fileId}/content`;
        const boxApiUrl = url.parse(boxUrl);

        // Response headers to forward
        const responseHeaders = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'cache-control',
            'etag',
        ];

        const proxyReq = https.request({
            hostname: boxApiUrl.hostname,
            path: boxApiUrl.path,
            method: req.method,
            headers,
        }, (proxyRes: any) => {
            res.status(proxyRes.statusCode || 200);

            responseHeaders.forEach(header => {
                const value = proxyRes.headers[header.toLowerCase()];
                if (value) {
                    res.set(header, value);
                }
            });

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (error: any) => {
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Failed to connect to Box API',
                    message: error.message
                });
            }
        });

        proxyReq.end();

    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to stream Box file',
                message: error.message || 'Unknown error'
            });
        }
    }
});

/**
 * Download Box file (proxy to avoid CORS issues)
 * Returns file content as base64-encoded string
 */
export const downloadBoxFile = onCall(
    {
        region: 'us-central1',
        cors: true,
        secrets: [encryptionKey],
        memory: '512MiB', // Increased from default 256MiB for large video files
        timeoutSeconds: 540, // 9 minutes (max for 2nd gen functions)
    },
    async (request) => {
        try {
            if (!request.auth) {
                throw new HttpsError('unauthenticated', 'Authentication required');
            }

            const { fileId, organizationId: providedOrgId } = request.data as { fileId: string; organizationId?: string };
            const userId = request.auth.uid;
            const organizationId = providedOrgId || request.auth.token.organizationId || 'default';

            if (!fileId) {
                throw new HttpsError('invalid-argument', 'File ID is required');
            }

            console.log(`📥 [BoxFiles] Downloading file ${fileId} for org: ${organizationId}`);

            // Get Box SDK and access token using the same logic as refreshBoxAccessToken
            const boxSDK = await getBoxSDK(organizationId);
            
            // Use the existing refreshBoxAccessToken function to get a valid token
            // This handles all the migration logic and token refresh automatically
            let tokens;
            try {
                tokens = await refreshBoxAccessToken(userId, organizationId);
            } catch (refreshError: any) {
                // Handle expired token errors specifically
                const errorMessage = refreshError?.message || String(refreshError);
                const isExpiredError = errorMessage.includes('expired') ||
                                     errorMessage.includes('Expired Auth') ||
                                     errorMessage.includes('invalid_grant') ||
                                     errorMessage.includes('refresh token');
                
                if (isExpiredError) {
                    console.log(`[BoxFiles] Token refresh failed due to expired token for org: ${organizationId}`);
                    throw new HttpsError(
                        'failed-precondition',
                        'Box connection has expired. Please reconnect your Box account in Integration Settings.'
                    );
                }
                
                // Re-throw other errors
                throw refreshError;
            }
            
            if (!tokens || !tokens.accessToken) {
                throw new HttpsError('failed-precondition', 'Box connection not found. Please connect Box in Integration Settings.');
            }

            // Get Box client with the refreshed access token
            const client = boxSDK.getBasicClient(tokens.accessToken);

            // Download file
            const fileStream = await client.files.getReadStream(fileId);
            
            // Get file info for metadata
            const fileInfo = await client.files.get(fileId);
            const fileName = fileInfo.name;
            
            // Box API doesn't provide MIME type directly, infer from file extension
            const mimeType = getMimeTypeFromFileName(fileName);

            // Upload directly to Firebase Storage (streaming to avoid memory issues)
            const storage = getStorage();
            const bucket = storage.bucket();
            
            // Create a unique storage path: box-files/{orgId}/{fileId}/{fileName}
            const storagePath = `box-files/${organizationId}/${fileId}/${fileName}`;
            const file = bucket.file(storagePath);

            console.log(`📤 [BoxFiles] Uploading to Firebase Storage: ${storagePath}`);

            // Stream the file directly to Storage (avoids loading entire file into memory)
            const writeStream = file.createWriteStream({
                metadata: {
                    contentType: mimeType,
                    metadata: {
                        boxFileId: fileId,
                        organizationId: organizationId,
                        originalFileName: fileName,
                        uploadedBy: userId,
                        uploadedAt: new Date().toISOString()
                    }
                }
            });

            // Pipe the Box stream to Storage with proper error handling
            await new Promise<void>((resolve, reject) => {
                fileStream.on('error', (error: Error) => {
                    writeStream.destroy();
                    reject(error);
                });
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
                fileStream.pipe(writeStream);
            });

            // Make file readable by authenticated users (or generate signed URL)
            await file.makePublic();

            // Generate signed URL (valid for 1 hour)
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 3600000 // 1 hour
            });

            console.log(`✅ [BoxFiles] File uploaded to Storage successfully: ${fileName} (${storagePath})`);

            return {
                success: true,
                downloadUrl: signedUrl,
                storagePath: storagePath,
                fileName,
                mimeType,
                fileSize: fileInfo.size || 0
            };

        } catch (error: any) {
            console.error('❌ [BoxFiles] Error downloading file:', error);
            
            if (error instanceof HttpsError) {
                throw error;
            }

            throw new HttpsError(
                'internal',
                error.message || 'Failed to download Box file'
            );
        }
    }
);
