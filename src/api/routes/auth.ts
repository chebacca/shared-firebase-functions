import express from 'express';
import { authenticateToken } from '../../shared/middleware';
import * as admin from 'firebase-admin';
import { computeUserClaims } from '../../auth/unifiedAuth';

const router = express.Router();

/**
 * @route POST /api/auth/sync-claims
 * @desc Manually trigger claim sync via REST (Alternative to Callable)
 */
router.post('/sync-claims', authenticateToken, async (req: any, res) => {
    try {
        const uid = req.user.uid;
        const email = req.user.email;

        console.log(`🔄 [API REST] Syncing claims via REST for ${email} (${uid})`);

        // Get current claims
        const userRecord = await admin.auth().getUser(uid);
        const currentClaims = userRecord.customClaims || {};

        // Compute fresh claims
        const freshClaims = await computeUserClaims({ uid, email });

        // Merge with existing claims
        const mergedClaims = {
            ...currentClaims,
            ...freshClaims,
            organizationId: freshClaims.organizationId || currentClaims.organizationId,
            lastUpdated: Date.now()
        };

        const currentClaimsStr = JSON.stringify(currentClaims);
        const mergedClaimsStr = JSON.stringify(mergedClaims);

        if (currentClaimsStr !== mergedClaimsStr) {
            await admin.auth().setCustomUserClaims(uid, mergedClaims);
            console.log(`✅ [API REST] Claims synced for ${email} (${uid})`);
            res.json({ success: true, updated: true, claims: mergedClaims });
        } else {
            res.json({ success: true, updated: false, claims: mergedClaims });
        }
    } catch (error: any) {
        console.error('❌ [API REST] Sync claims failed:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
