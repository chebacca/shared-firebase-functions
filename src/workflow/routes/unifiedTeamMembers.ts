
import { Router } from 'express';

import * as admin from 'firebase-admin';
import { db } from '../../shared/utils';
import { FieldValue } from 'firebase-admin/firestore';

// Note: authenticateToken might need to be imported from a middleware file if circular dependency occurs.
// For now assuming it is available or we duplicate logic/import from middleware.
// Actually, looking at dynamicRoles.ts, it imports `enhancedAuthMiddleware` from `../middleware/tierAuth`.
// I'll use that if possible, or `authenticateToken` if I can access it.
// dynamicRoles.ts imports `enhancedAuthMiddleware`.

import { enhancedAuthMiddleware, requirePermission } from '../middleware/tierAuth';

const router: Router = Router();

// Handle OPTIONS preflight requests for CORS
router.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        const origin = req.headers.origin;
        if (origin) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.header('Access-Control-Max-Age', '3600');
        return res.status(204).send();
    }
    next();
});

// Apply authentication
router.use(enhancedAuthMiddleware);

/**
 * POST /create
 * Create a new team member with app roles
 */
router.post('/create',
    requirePermission('userManagement', 'manage_team'), // Start with standard permission
    async (req, res) => {
        // Set CORS headers
        const origin = req.headers.origin;
        if (origin) {
            res.header('Access-Control-Allow-Origin', origin);
            res.header('Access-Control-Allow-Credentials', 'true');
        }
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');

        try {
            const {
                email,
                firstName,
                lastName,
                role, // Base role (e.g. 'MEMBER', 'ADMIN')
                department,
                position,
                phone,
                organizationId,
                temporaryPassword,
                appRoles
            } = req.body;

            console.log('✨ [TeamMembers] Creating team member:', { email, organizationId, hasAppRoles: !!appRoles });

            // Verify user belongs to this organization
            if (req.user?.organizationId !== organizationId) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied to this organization'
                });
            }

            // Check if user already exists
            try {
                await admin.auth().getUserByEmail(email);
                return res.status(409).json({
                    success: false,
                    error: 'User with this email already exists'
                });
            } catch (error: any) {
                if (error.code !== 'auth/user-not-found') {
                    throw error;
                }
                // User not found, proceed to create
            }

            // Create Firebase Auth User
            const userRecord = await admin.auth().createUser({
                email,
                emailVerified: false,
                password: temporaryPassword,
                displayName: `${firstName} ${lastName}`
            });

            console.log('✅ [TeamMembers] Auth user created:', userRecord.uid);

            // Prepare Custom Claims
            const customClaims: any = {
                organizationId: organizationId,
                tier: (req.user as any)?.tier || 'BASIC',
                role: role, // Base role
                isTeamMember: true,
                projectAssignments: {} // Initialize empty
            };

            // Set App Roles in Custom Claims
            if (appRoles) {
                if (appRoles.dashboardRole) customClaims.dashboardRole = appRoles.dashboardRole;
                if (appRoles.clipShowProRole) customClaims.clipShowProRole = appRoles.clipShowProRole;
                if (appRoles.callSheetRole) customClaims.callSheetRole = appRoles.callSheetRole;
                if (appRoles.cuesheetRole) customClaims.cuesheetRole = appRoles.cuesheetRole;
            }

            await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);
            console.log('✅ [TeamMembers] Custom claims set');

            // Create Team Member Document in Firestore
            const teamMemberData = {
                id: userRecord.uid, // Use Auth UID as ID
                firebaseUid: userRecord.uid,
                email,
                firstName,
                lastName,
                displayName: `${firstName} ${lastName}`,
                name: `${firstName} ${lastName}`,
                role: role || 'MEMBER',
                baseRole: role || 'MEMBER',
                department: department || '',
                position: position || '',
                phone: phone || '',
                organizationId,
                appRoles: appRoles || {},
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                joinedAt: FieldValue.serverTimestamp(),
                createdBy: req.user?.uid,
                status: 'active',
                inviteStatus: 'accepted' // Auto-accepted since we set password? Or 'pending'?
                // UnifiedDataService sets temporaryPassword, so they are effectively pre-created.
            };

            // Save to 'teamMembers' collection
            // Check if teamMembers collection exists or is at root. 
            // UnifiedDataService reads from 'teamMembers' at root.
            await db.collection('teamMembers').doc(userRecord.uid).set(teamMemberData);

            // Also potentially update 'users' collection if used
            await db.collection('users').doc(email).set({
                ...teamMemberData,
                isEmailVerified: false
            });

            console.log('✅ [TeamMembers] Firestore documents created');

            return res.status(201).json({
                success: true,
                data: {
                    teamMember: teamMemberData,
                    id: userRecord.uid
                },
                message: 'Team member created successfully'
            });

        } catch (error: any) {
            console.error('❌ [TeamMembers] Error creating team member:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to create team member',
                errorDetails: error.message
            });
        }
    }
);

export default router;
