import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { updateClipShowProClaimsInternal } from '../clipShowPro/clipShowProUpdateClaims';
import { ClipShowProRole } from '../clipShowPro/clipShowProRoleDefaults';
import { resolveUserAppRoles } from '../auth/dynamicRoleSync';

const auth = getAuth();
const db = getFirestore();

/**
 * Triggers when a license document is written (created, updated, or deleted)
 * Recalculates user permissions and updates custom claims.
 */
export const onLicenseWrite = onDocumentWritten(
    'licenses/{licenseId}',
    async (event) => {
        try {
            const before = event.data?.before;
            const after = event.data?.after;

            // Get user ID from the document (either before or after)
            const data = after?.data() || before?.data();

            if (!data) {
                console.log('ℹ️ [LicenseTrigger] No data found, skipping');
                return;
            }

            const userId = data.userId;
            const organizationId = data.organizationId;

            if (!userId) {
                console.log('ℹ️ [LicenseTrigger] No userId found in license, skipping');
                return;
            }

            console.log(`🔄 [LicenseTrigger] License change detected for user ${userId}`);

            // Recalculate entitlements for this user
            await syncUserLicenseClaims(userId, organizationId);

        } catch (error: any) {
            console.error('❌ [LicenseTrigger] Error processing license trigger:', error);
        }
    }
);

/**
 * Internal function to sync user claims based on active licenses
 */
async function syncUserLicenseClaims(userId: string, organizationId?: string): Promise<void> {
    try {
        // 1. Get all active licenses for this user
        const licensesSnapshot = await db.collection('licenses')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .get();

        const activeLicenses = licensesSnapshot.docs.map(doc => doc.data());

        // 2. Determine entitlements
        let hasClipShowPro = false;
        let hasCueSheet = false;

        activeLicenses.forEach(license => {
            if (license.type === 'CLIP_SHOW_PRO') hasClipShowPro = true;
            if (license.type === 'CUE_SHEET') hasCueSheet = true;
            // Check features array if needed
            if (license.features && Array.isArray(license.features)) {
                if (license.features.includes('CLIP_SHOW_PRO')) hasClipShowPro = true;
            }
        });

        // Also check subscriptions (legacy or alternative source)
        // Some implementations might use a 'subscriptions' collection
        const subscriptionsSnapshot = await db.collection('subscriptions')
            .where('userId', '==', userId)
            .where('status', 'in', ['active', 'trialing'])
            .get();

        subscriptionsSnapshot.docs.forEach(doc => {
            const sub = doc.data();
            // Check items or metadata for app access
            if (sub.items && Array.isArray(sub.items)) {
                // simplified check
                const itemsStr = JSON.stringify(sub.items);
                if (itemsStr.includes('clip-show') || itemsStr.includes('clip_show')) hasClipShowPro = true;
            }
        });

        console.log(`✅ [LicenseTrigger] Entitlements for ${userId}: ClipShowPro=${hasClipShowPro}, CueSheet=${hasCueSheet}`);

        // 3. Get current user claims to preserve role
        let userRecord;
        try {
            userRecord = await auth.getUser(userId);
        } catch (e) {
            console.log(`⚠️ User ${userId} not found in Auth, skipping sync`);
            return;
        }

        // 4. Update Custom Claims
        // We use the internal update function to ensure consistency
        // We construct the "subscriptionAddOns" object that the rules expect

        const currentClaims = userRecord.customClaims || {};
        const effectiveOrgId = organizationId || currentClaims.organizationId;

        if (!effectiveOrgId) {
            console.log(`⚠️ User ${userId} has no organizationId, cannot fully sync app claims yet.`);
            return;
        }

        const subscriptionAddOns = {
            clipShowPro: hasClipShowPro,
            cuesheet: hasCueSheet
        };

        // NEW: Resolve app roles to pass into claim update
        const appRoles = await resolveUserAppRoles(userId, effectiveOrgId);
        console.log(`ℹ️ [LicenseTrigger] Resolved app roles for sync:`, appRoles);

        // Update via the secure internal function
        // We pass 'undefined' for role to preserve existing role
        await updateClipShowProClaimsInternal({
            uid: userId,
            organizationId: effectiveOrgId,
            role: undefined, // Preserves existing role
            preserveExistingClaims: true,
            additionalClaims: {
                subscriptionAddOns, // Valid source of truth from licenses
                isClipShowProUser: hasClipShowPro, // Direct flag
                clipShowProAccess: hasClipShowPro,    // Direct flag
                appRoles: appRoles // Pass resolved app roles
            }
        });

        console.log(`✅ [LicenseTrigger] Successfully synced claims for ${userId}`);

    } catch (error) {
        console.error(`❌ Error syncing user license claims:`, error);
        throw error;
    }
}
