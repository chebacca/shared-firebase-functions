import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Ensure Firebase Admin is initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Exchanges a valid ID token (from Hub) for a Custom Token.
 * This allows apps to sign in without re-entering credentials.
 */
export const exchangeHubToken = functions.https.onCall(async (data: any, context: any) => {
    const hubIdToken = data.hubIdToken;

    if (!hubIdToken) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing hubIdToken');
    }

    try {
        // 1. Verify the ID token
        const decodedToken = await admin.auth().verifyIdToken(hubIdToken);
        const uid = decodedToken.uid;

        // 2. Determine claims to burn into the custom token
        const claims: Record<string, any> = {
            authMethod: 'hub-sso'
        };

        const requestedOrgId = data.organizationId;
        const requestedProjectId = data.projectId;

        // Extract claims from the decoded token
        const userClaims = decodedToken as any;
        const isOwnerOrAdmin =
            userClaims.role === 'OWNER' ||
            userClaims.role === 'ADMIN' ||
            userClaims.isAdmin === true ||
            userClaims.isOrganizationOwner === true;

        const allowedOrgs = userClaims.allowedOrganizations || [];

        // Apply Organization ID if validated
        if (requestedOrgId) {
            // Check properly if user is allowed to access this org
            const isAllowed =
                isOwnerOrAdmin ||
                userClaims.organizationId === requestedOrgId ||
                allowedOrgs.includes(requestedOrgId) ||
                (userClaims.appRoles && Object.values(userClaims.appRoles || {}).includes(`admin:${requestedOrgId}`)); // Hypothetical check

            // For now, if Owner/Admin or explicitly allowed, permit the switch
            // If checking fails, we DON'T set it, falling back to default user claims behavior
            if (isAllowed) {
                claims.organizationId = requestedOrgId;
                console.log(`[Auth] Burning organizationId context: ${requestedOrgId}`);
            } else {
                console.warn(`[Auth] User ${uid} requested org ${requestedOrgId} but is not authorized. Claims:`, Object.keys(userClaims));
            }
        }

        // Apply Project ID if requested (less strict validation for now, relies on Firestore rules later)
        if (requestedProjectId) {
            claims.projectId = requestedProjectId;
            claims.currentProjectId = requestedProjectId; // Alias for safety
            console.log(`[Auth] Burning projectId context: ${requestedProjectId}`);
        }

        // 3. Create a custom token with context claims
        const customToken = await admin.auth().createCustomToken(uid, claims);

        console.log(`[Auth] Exchanged Hub token for Custom Token for user: ${uid}`);

        return {
            customToken
        };
    } catch (error) {
        console.error('[Auth] Token exchange failed:', error);
        throw new functions.https.HttpsError('unauthenticated', 'Invalid token or token exchange failed');
    }
});
