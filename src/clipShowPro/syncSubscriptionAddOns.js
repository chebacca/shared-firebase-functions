"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeClipShowProAccess = exports.grantClipShowProAccess = exports.onUserDocumentUpdated = exports.syncSubscriptionAddOns = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const auth_1 = require("firebase-admin/auth");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
/**
 * Syncs subscription add-ons from Firestore user document to Firebase Auth custom claims
 * This ensures that subscription add-ons are immediately available in the user's token
 */
exports.syncSubscriptionAddOns = (0, https_1.onCall)(async (request) => {
    try {
        const { userId } = request.data;
        if (!userId) {
            throw new Error('User ID is required');
        }
        // Verify the user is authenticated
        if (!request.auth) {
            throw new Error('User must be authenticated');
        }
        // Only allow users to sync their own claims or admins to sync any user's claims
        if (request.auth.uid !== userId && !request.auth.token.admin) {
            throw new Error('Unauthorized: Can only sync your own subscription add-ons');
        }
        const db = (0, firestore_2.getFirestore)();
        const auth = (0, auth_1.getAuth)();
        // Get user document from Firestore
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new Error('User document not found');
        }
        const userData = userDoc.data();
        if (!userData) {
            throw new Error('User data not found');
        }
        // Get current custom claims
        const userRecord = await auth.getUser(userId);
        const currentClaims = userRecord.customClaims || {};
        // Prepare new subscription add-ons claims
        const subscriptionAddOns = userData.subscriptionAddOns || {};
        const permissions = userData.permissions || [];
        // Build new custom claims
        const newClaims = {
            ...currentClaims,
            subscriptionAddOns: {
                clipShowPro: Boolean(subscriptionAddOns.clipShowPro),
                callSheetPro: Boolean(subscriptionAddOns.callSheetPro),
                edlConverter: Boolean(subscriptionAddOns.edlConverter),
            },
            permissions: permissions,
            // Preserve other existing claims
            organizationId: userData.organizationId || currentClaims.organizationId,
            role: userData.role || currentClaims.role,
            userType: userData.userType || currentClaims.userType,
        };
        // Update custom claims
        await auth.setCustomUserClaims(userId, newClaims);
        firebase_functions_1.logger.info(`Successfully synced subscription add-ons for user ${userId}`, {
            userId,
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        });
        return {
            success: true,
            message: 'Subscription add-ons synced successfully',
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error('Error syncing subscription add-ons:', error);
        throw new Error(`Failed to sync subscription add-ons: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * Automatically syncs subscription add-ons when a user document is updated
 * This ensures that changes to subscription add-ons are immediately reflected in custom claims
 */
exports.onUserDocumentUpdated = (0, firestore_1.onDocumentUpdated)('users/{userId}', async (event) => {
    var _a, _b, _c, _d;
    try {
        const userId = event.params.userId;
        const beforeData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
        const afterData = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
        if (!beforeData || !afterData) {
            firebase_functions_1.logger.warn('User document update event missing data');
            return;
        }
        // Check if subscription add-ons or permissions have changed
        const subscriptionAddOnsChanged = JSON.stringify(beforeData.subscriptionAddOns) !== JSON.stringify(afterData.subscriptionAddOns);
        const permissionsChanged = JSON.stringify(beforeData.permissions) !== JSON.stringify(afterData.permissions);
        if (!subscriptionAddOnsChanged && !permissionsChanged) {
            firebase_functions_1.logger.info('No subscription add-ons or permissions changes detected, skipping sync');
            return;
        }
        const auth = (0, auth_1.getAuth)();
        // Get current custom claims
        const userRecord = await auth.getUser(userId);
        const currentClaims = userRecord.customClaims || {};
        // Prepare new subscription add-ons claims
        const subscriptionAddOns = afterData.subscriptionAddOns || {};
        const permissions = afterData.permissions || [];
        // Build new custom claims
        const newClaims = {
            ...currentClaims,
            subscriptionAddOns: {
                clipShowPro: Boolean(subscriptionAddOns.clipShowPro),
                callSheetPro: Boolean(subscriptionAddOns.callSheetPro),
                edlConverter: Boolean(subscriptionAddOns.edlConverter),
            },
            permissions: permissions,
            // Preserve other existing claims
            organizationId: afterData.organizationId || currentClaims.organizationId,
            role: afterData.role || currentClaims.role,
            userType: afterData.userType || currentClaims.userType,
        };
        // Update custom claims
        await auth.setCustomUserClaims(userId, newClaims);
        firebase_functions_1.logger.info(`Automatically synced subscription add-ons for user ${userId}`, {
            userId,
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
            changes: {
                subscriptionAddOnsChanged,
                permissionsChanged,
            },
        });
    }
    catch (error) {
        firebase_functions_1.logger.error('Error in automatic subscription add-ons sync:', error);
        // Don't throw error to avoid breaking the document update
    }
});
/**
 * Grants Clip Show Pro access to a user
 * This function can be called by admins to grant add-on access
 */
exports.grantClipShowProAccess = (0, https_1.onCall)(async (request) => {
    try {
        const { targetUserId, grantedBy } = request.data;
        if (!targetUserId) {
            throw new Error('Target user ID is required');
        }
        if (!grantedBy) {
            throw new Error('Granted by user ID is required');
        }
        // Verify the caller is authenticated and has admin privileges
        if (!request.auth) {
            throw new Error('User must be authenticated');
        }
        if (!request.auth.token.admin) {
            throw new Error('Unauthorized: Admin privileges required');
        }
        const db = (0, firestore_2.getFirestore)();
        const auth = (0, auth_1.getAuth)();
        // Get target user document
        const userDoc = await db.collection('users').doc(targetUserId).get();
        if (!userDoc.exists) {
            throw new Error('Target user document not found');
        }
        const userData = userDoc.data();
        if (!userData) {
            throw new Error('Target user data not found');
        }
        // Update user document with Clip Show Pro access
        await userDoc.ref.update({
            'subscriptionAddOns.clipShowPro': true,
            permissions: admin.firestore.FieldValue.arrayUnion('CLIP_SHOW_PRO'),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastModifiedBy: grantedBy,
        });
        // Get current custom claims
        const userRecord = await auth.getUser(targetUserId);
        const currentClaims = userRecord.customClaims || {};
        // Update custom claims
        const newClaims = {
            ...currentClaims,
            subscriptionAddOns: {
                ...(currentClaims.subscriptionAddOns || {}),
                clipShowPro: true,
            },
            permissions: [...new Set([...(currentClaims.permissions || []), 'CLIP_SHOW_PRO'])],
        };
        await auth.setCustomUserClaims(targetUserId, newClaims);
        firebase_functions_1.logger.info(`Granted Clip Show Pro access to user ${targetUserId}`, {
            targetUserId,
            grantedBy,
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        });
        return {
            success: true,
            message: 'Clip Show Pro access granted successfully',
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error('Error granting Clip Show Pro access:', error);
        throw new Error(`Failed to grant Clip Show Pro access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
/**
 * Revokes Clip Show Pro access from a user
 * This function can be called by admins to revoke add-on access
 */
exports.revokeClipShowProAccess = (0, https_1.onCall)(async (request) => {
    try {
        const { targetUserId, revokedBy } = request.data;
        if (!targetUserId) {
            throw new Error('Target user ID is required');
        }
        if (!revokedBy) {
            throw new Error('Revoked by user ID is required');
        }
        // Verify the caller is authenticated and has admin privileges
        if (!request.auth) {
            throw new Error('User must be authenticated');
        }
        if (!request.auth.token.admin) {
            throw new Error('Unauthorized: Admin privileges required');
        }
        const db = (0, firestore_2.getFirestore)();
        const auth = (0, auth_1.getAuth)();
        // Get target user document
        const userDoc = await db.collection('users').doc(targetUserId).get();
        if (!userDoc.exists) {
            throw new Error('Target user document not found');
        }
        const userData = userDoc.data();
        if (!userData) {
            throw new Error('Target user data not found');
        }
        // Update user document to remove Clip Show Pro access
        await userDoc.ref.update({
            'subscriptionAddOns.clipShowPro': false,
            permissions: admin.firestore.FieldValue.arrayRemove('CLIP_SHOW_PRO'),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastModifiedBy: revokedBy,
        });
        // Get current custom claims
        const userRecord = await auth.getUser(targetUserId);
        const currentClaims = userRecord.customClaims || {};
        // Update custom claims
        const newClaims = {
            ...currentClaims,
            subscriptionAddOns: {
                ...(currentClaims.subscriptionAddOns || {}),
                clipShowPro: false,
            },
            permissions: (currentClaims.permissions || []).filter((p) => p !== 'CLIP_SHOW_PRO'),
        };
        await auth.setCustomUserClaims(targetUserId, newClaims);
        firebase_functions_1.logger.info(`Revoked Clip Show Pro access from user ${targetUserId}`, {
            targetUserId,
            revokedBy,
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        });
        return {
            success: true,
            message: 'Clip Show Pro access revoked successfully',
            subscriptionAddOns: newClaims.subscriptionAddOns,
            permissions: newClaims.permissions,
        };
    }
    catch (error) {
        firebase_functions_1.logger.error('Error revoking Clip Show Pro access:', error);
        throw new Error(`Failed to revoke Clip Show Pro access: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
});
