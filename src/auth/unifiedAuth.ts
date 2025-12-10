import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Ensure Firebase Admin is initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

/**
 * 🔐 CENTRALIZED AUTH LOGIC
 * Calculates standard user claims based on:
 * 1. Hardcoded Super Users (Legacy Support)
 * 2. `teamMembers` collection (Organization Users)
 * 3. `users` collection (Standard Users)
 */

interface UnifiedClaims {
    organizationId?: string;
    role: string;
    permissions: string[];
    isOwnerOrAdmin: boolean;

    // Feature Flags
    hasClipShowProAccess: boolean;
    hasCueSheetAccess: boolean;

    // Multi-tenant Access
    allowedOrganizations?: string[];

    // Legacy / Compatibility
    email?: string;
    [key: string]: any;
}

// Hardcoded Super Users (Legacy Migration)
const SUPER_USERS: Record<string, Partial<UnifiedClaims>> = {
    'admin.clipshow@example.com': {
        organizationId: 'clip-show-pro-productions',
        role: 'SUPERADMIN',
        allowedOrganizations: ['clip-show-pro-productions'],
        permissions: ['ALL_ACCESS'],
        isOwnerOrAdmin: true,
        hasClipShowProAccess: true,
        hasCueSheetAccess: true
    },
    'enterprise.user@enterprisemedia.com': {
        organizationId: 'enterprise-media-org',
        role: 'ADMIN',
        // Access to both organizations and legacy ID
        allowedOrganizations: ['enterprise-media-org', 'enterprise-org-001', 'enterprise_media_org'],
        permissions: ['ALL_ACCESS'],
        isOwnerOrAdmin: true,
        hasClipShowProAccess: true,
        hasCueSheetAccess: true
    }
};

/**
 * Computes the unified claims for a given user.
 * This logic is the SINGLE SOURCE OF TRUTH for "Who is this user?".
 */
async function computeUserClaims(user: { uid: string; email?: string }): Promise<UnifiedClaims> {
    const { uid, email } = user;
    const safeEmail = email?.toLowerCase() || '';

    // 1. DEFAULT CLAIMS
    const claims: UnifiedClaims = {
        role: 'USER',
        permissions: [],
        isOwnerOrAdmin: false,
        hasClipShowProAccess: false,
        hasCueSheetAccess: false
    };

    // 2. HARDCODED SUPER USER OVERRIDES
    if (safeEmail && SUPER_USERS[safeEmail]) {
        return {
            ...claims,
            ...SUPER_USERS[safeEmail],
            email: safeEmail
        };
    }

    // 3. DATABASE LOOKUP (Team Member Priority)
    // Check teamMembers collection first as it's the primary source for Org Users
    let userData: any = null;
    let sourceCollection = '';

    const teamMemberQuery = await db.collection('teamMembers')
        .where('email', '==', safeEmail)
        .limit(1)
        .get();

    if (!teamMemberQuery.empty) {
        userData = teamMemberQuery.docs[0].data();
        sourceCollection = 'teamMembers';
    } else {
        // Fallback to 'users' collection
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            userData = userDoc.data();
            sourceCollection = 'users';
        }
    }

    if (userData) {
        console.log(`✅ Found user data in ${sourceCollection} for ${safeEmail}`);
        // 4. MAPPING DATA TO CLAIMS
        claims.organizationId = userData.organizationId;
        claims.role = userData.role || userData.teamMemberRole || 'USER';
        claims.permissions = userData.permissions || [];

        // Determine Admin Status
        const roleUpper = claims.role.toUpperCase();
        if (['OWNER', 'ADMIN', 'SUPERADMIN'].includes(roleUpper)) {
            claims.isOwnerOrAdmin = true;
        }

        // Hierarchy Calculation (matching legacy middleware logic)
        const hierarchy = userData.hierarchy || 50;
        const dashboardHierarchy = userData.dashboardHierarchy || 50;
        claims.effectiveHierarchy = Math.max(hierarchy, dashboardHierarchy);

        // Feature Access
        if (userData.hasClipShowProAccess || claims.permissions.includes('CLIP_SHOW_PRO')) {
            claims.hasClipShowProAccess = true;
        }
        if (userData.hasCueSheetAccess || claims.permissions.includes('CUE_SHEET')) {
            claims.hasCueSheetAccess = true;
        }
    }

    return claims;
}

/**
 * ⚡️ ON CALLABLE: REFRESH CLAIMS
 * Client calls this to force-refresh their ID token claims.
 * This function is available to all apps via shared-firebase-functions.
 */
export const refreshAuthClaims = functions.https.onCall(async (data: any, context: any) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in to refresh claims.');
    }

    const uid = context.auth.uid;
    const email = context.auth.token.email;

    console.log(`🔄 [UnifiedAuth] Refreshing claims for ${email} (${uid})`);

    try {
        const claims = await computeUserClaims({ uid, email });

        // Set Custom Claims
        await admin.auth().setCustomUserClaims(uid, claims);

        // Force token refresh on client side is needed after this
        return { success: true, claims };
    } catch (error) {
        console.error(`❌ [UnifiedAuth] Failed to refresh claims for ${uid}:`, error);
        throw new functions.https.HttpsError('internal', 'Failed to compute claims.');
    }
});

/**
 * 🛑 BLOCKING FUNCTION: BEFORE SIGN IN
 * Runs before the user completes sign-in. Mints claims so they are ready immediately.
 * Note: Requires Identity Platform (GCIP) enabled.
 */
// export const beforeSignIn = functions.auth.user().beforeSignIn(async (user, context) => {
//   const claims = await computeUserClaims({ uid: user.uid, email: user.email });
//   return {
//     customClaims: claims
//   };
// });

// Note: For now, we export a background trigger as a fallback if blocking functions aren't enabled
export const onUserLoginTrigger = (functions as any).auth.user().onCreate(async (user: any) => {
    console.log(`🆕 [UnifiedAuth] New user created: ${user.email}. Minting initial claims.`);
    const claims = await computeUserClaims({ uid: user.uid, email: user.email });
    await admin.auth().setCustomUserClaims(user.uid, claims);
});
