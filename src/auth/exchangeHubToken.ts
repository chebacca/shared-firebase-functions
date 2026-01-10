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

        // 2. Create a custom token for the same user
        // We can optionally pass additional claims, but usually standard custom token 
        // claims are sufficient as they trigger a refresh of the user's claims 
        // from the backend anyway.
        const customToken = await admin.auth().createCustomToken(uid, {
            authMethod: 'hub-sso'
        });

        console.log(`[Auth] Exchanged Hub token for Custom Token for user: ${uid}`);

        return {
            customToken
        };
    } catch (error) {
        console.error('[Auth] Token exchange failed:', error);
        throw new functions.https.HttpsError('unauthenticated', 'Invalid token or token exchange failed');
    }
});
