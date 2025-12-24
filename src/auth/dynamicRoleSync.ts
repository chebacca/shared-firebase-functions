import * as admin from 'firebase-admin';
import { UnifiedUser, TeamMember } from '../../../shared-firebase-models/src/index';

/**
 * Resolves app-specific roles for a user without updating claims.
 * Returns the resolved app roles object.
 */
export async function resolveUserAppRoles(
    userId: string,
    organizationId?: string,
    injectedDb?: admin.firestore.Firestore
): Promise<Record<string, string>> {
    try {
        const db = injectedDb || admin.firestore();

        // Fetch User and TeamMember data
        const userDoc = await db.collection('users').doc(userId).get();
        let teamMemberDoc: admin.firestore.DocumentSnapshot | null = null;

        // If organizationId is provided, try to find the team member record
        if (organizationId) {
            const tmQuery = await db.collection('teamMembers')
                .where('userId', '==', userId)
                .where('organizationId', '==', organizationId)
                .limit(1)
                .get();

            if (!tmQuery.empty) {
                teamMemberDoc = tmQuery.docs[0];
            }
        }

        const userData = userDoc.data() as UnifiedUser | undefined;
        const teamMemberData = teamMemberDoc?.data() as TeamMember | undefined;

        if (!userData && !teamMemberData) {
            console.log(`⚠️ [DynamicRoleSync] No user or team member data found for ${userId}`);
            return {};
        }

        // --- RESOLVE APP ROLES ---

        // 1. Start with empty roles
        let resolvedAppRoles: Record<string, string> = {};

        // 2. Apply TeamMember default roles (Legacy / Baseline)
        if (teamMemberData && teamMemberData.role) {
            switch (teamMemberData.role) {
                case 'owner':
                case 'admin':
                    resolvedAppRoles = {
                        dashboardRole: 'ADMIN',
                        clipShowProRole: 'ADMIN',
                        callSheetRole: 'ADMIN',
                        cuesheetRole: 'ADMIN'
                    };
                    break;
                case 'member':
                    resolvedAppRoles = {
                        dashboardRole: 'EDITOR',
                        clipShowProRole: 'EDITOR',
                        callSheetRole: 'MEMBER',
                        cuesheetRole: 'EDITOR'
                    };
                    break;
                case 'viewer':
                    resolvedAppRoles = {
                        dashboardRole: 'VIEWER',
                        clipShowProRole: 'VIEWER',
                        callSheetRole: 'VIEWER',
                        cuesheetRole: 'VIEWER'
                    };
                    break;
            }
        }

        // 3. Apply TeamMember specific appRoles (overrides defaults)
        if (teamMemberData && teamMemberData.appRoles) {
            resolvedAppRoles = {
                ...resolvedAppRoles,
                ...teamMemberData.appRoles
            };
        }

        // 4. Apply User specific appRoles (global overrides, highest priority)
        if (userData && userData.appRoles) {
            resolvedAppRoles = {
                ...resolvedAppRoles,
                ...userData.appRoles
            };
        }

        return resolvedAppRoles;

    } catch (error) {
        console.error(`❌ [DynamicRoleSync] Failed to resolve roles for ${userId}:`, error);
        return {};
    }
}

/**
 * Syncs app-specific roles for a user.
 * Updates custom claims with the resolved roles.
 */
export async function syncUserAppRoles(
    userId: string,
    organizationId?: string,
    injectedDb?: admin.firestore.Firestore,
    injectedAuth?: admin.auth.Auth
): Promise<void> {
    try {
        const auth = injectedAuth || admin.auth();
        const resolvedAppRoles = await resolveUserAppRoles(userId, organizationId, injectedDb);

        // --- UPDATE CLAIMS ---

        const existingClaims = (await auth.getUser(userId)).customClaims || {};

        const newClaims = {
            ...existingClaims,
            // Add namespaced roles
            clipShowProRole: resolvedAppRoles.clipShowProRole,
            dashboardRole: resolvedAppRoles.dashboardRole,
            callSheetRole: resolvedAppRoles.callSheetRole,
            cuesheetRole: resolvedAppRoles.cuesheetRole,

            // Also update the generic 'appRoles' claim for frontend unified access
            appRoles: resolvedAppRoles
        };

        // Remove undefined keys
        Object.keys(newClaims).forEach(key => {
            const k = key as keyof typeof newClaims;
            if (newClaims[k] === undefined) delete newClaims[k];
        });

        await auth.setCustomUserClaims(userId, newClaims);
        console.log(`✅ [DynamicRoleSync] Synced app roles for user ${userId}`, resolvedAppRoles);

    } catch (error) {
        console.error(`❌ [DynamicRoleSync] Failed to sync roles for ${userId}:`, error);
        throw error;
    }
}
