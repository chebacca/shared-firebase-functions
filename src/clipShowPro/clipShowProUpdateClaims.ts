/**
 * Clip Show Pro Update Claims Function
 * 
 * Centralized function for managing all Clip Show Pro custom claims.
 * Ensures all user types have proper claims aligned with permissions matrix.
 * 
 * Label: clipshowprorules
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';
import {
  getRoleDefaults,
  mapContactRoleToClipShowRole,
  ClipShowProRole,
  PageId,
  PagePermission,
} from './clipShowProRoleDefaults';

// Initialize Firebase Admin
try {
  initializeApp();
} catch (error) {
  // App already initialized
}

const auth = getAuth();
const db = getFirestore();

/**
 * Internal function to update claims (can be called directly or via callable)
 */
interface UpdateClaimsInternalParams {
  uid: string;
  role?: string;
  organizationId: string;
  pagePermissions?: Array<{
    pageId: PageId;
    read: boolean;
    write: boolean;
  }>;
  preserveExistingClaims?: boolean;
  additionalClaims?: Record<string, any>;
}

interface UpdateClaimsRequest {
  uid: string;
  role?: string;
  organizationId: string;
  pagePermissions?: Array<{
    pageId: PageId;
    read: boolean;
    write: boolean;
  }>;
  preserveExistingClaims?: boolean;
}

/**
 * Format page permissions as Firebase custom claims
 * Format: page:{pageId}:read and page:{pageId}:write
 */
function formatPagePermissionsAsClaims(
  pagePermissions: Record<PageId, PagePermission>
): Record<string, boolean> {
  const claims: Record<string, boolean> = {};

  for (const [pageId, permission] of Object.entries(pagePermissions)) {
    claims[`page:${pageId}:read`] = permission.read;
    claims[`page:${pageId}:write`] = permission.write;
  }

  return claims;
}

/**
 * Merge permissions matrix permissions with role defaults
 */
function mergePagePermissions(
  roleDefaults: Record<PageId, PagePermission>,
  matrixPermissions?: Array<{ pageId: PageId; read: boolean; write: boolean }>
): Record<PageId, PagePermission> {
  const merged = { ...roleDefaults };

  if (matrixPermissions && matrixPermissions.length > 0) {
    for (const perm of matrixPermissions) {
      if (perm.pageId in merged) {
        merged[perm.pageId] = {
          read: perm.read,
          write: perm.write,
        };
      }
    }
  }

  return merged;
}

/**
 * Optimize claims to stay under 1000 character limit
 */
function optimizeClaimsSize(claims: Record<string, any>): Record<string, any> {
  const claimsStr = JSON.stringify(claims);
  if (claimsStr.length <= 1000) {
    return claims;
  }

  console.warn(`⚠️ Claims exceed 1000 char limit (${claimsStr.length} chars), optimizing...`);

  // Compress pagePermissions FIRST - only keep permissions that are true (read or write)
  // This saves significant space by removing false/false entries
  const compressedPagePermissions: Record<string, { read: boolean; write: boolean }> = {};
  if (claims.pagePermissions) {
    Object.keys(claims.pagePermissions).forEach((pageId) => {
      const perm = claims.pagePermissions[pageId];
      // Only include if at least one permission is true
      if (perm && (perm.read === true || perm.write === true)) {
        compressedPagePermissions[pageId] = {
          read: perm.read === true,
          write: perm.write === true
        };
      }
      // Skip false/false permissions entirely to save space
    });
  }

  // Keep essential claims only - start minimal
  const optimized: Record<string, any> = {
    // Essential identity
    role: claims.role,
    organizationId: claims.organizationId,

    // Essential Clip Show Pro flags (REQUIRED for access check)
    clipShowProAccess: claims.clipShowProAccess,
    isClipShowProUser: claims.isClipShowProUser,

    // Page permissions (CRITICAL - must be preserved, but compressed)
    // Store as nested object with only true permissions (more compact)
    pagePermissions: compressedPagePermissions,

    // App Roles (Important for multi-app access)
    appRoles: claims.appRoles,
    clipShowProRole: claims.clipShowProRole,
    dashboardRole: claims.dashboardRole,
    callSheetRole: claims.callSheetRole,
    cuesheetRole: claims.cuesheetRole,
  };

  // Check size first
  let optimizedStr = JSON.stringify(optimized);

  // Only add subscriptionAddOns if there's plenty of space (saves ~50-100 chars)
  if (optimizedStr.length < 850 && claims.subscriptionAddOns) {
    optimized.subscriptionAddOns = claims.subscriptionAddOns;
    optimizedStr = JSON.stringify(optimized);
  }

  // DO NOT add flat format claims - they're redundant and waste space
  // Frontend checks nested format (pagePermissions[pageId].read) which is sufficient

  if (optimizedStr.length > 1000) {
    // Remove subscriptionAddOns if it exists (not critical)
    if (optimized.subscriptionAddOns) {
      delete optimized.subscriptionAddOns;
      optimizedStr = JSON.stringify(optimized);
      console.log(`✅ Optimized claims to ${optimizedStr.length} characters (removed subscriptionAddOns)`);
    }

    if (optimizedStr.length > 1000) {
      // Last resort: keep only essential + pagePermissions
      const minimal = {
        role: optimized.role,
        organizationId: optimized.organizationId,
        clipShowProAccess: optimized.clipShowProAccess,
        isClipShowProUser: optimized.isClipShowProUser,
        pagePermissions: optimized.pagePermissions, // CRITICAL: Must keep
      };

      const minimalStr = JSON.stringify(minimal);
      if (minimalStr.length > 1000) {
        // pagePermissions should already be compressed, but if still too large, try even more aggressive compression
        console.warn(`⚠️ Minimal format still too large (${minimalStr.length} chars) even after compression`);
        console.warn(`   pagePermissions size: ${JSON.stringify(minimal.pagePermissions).length} chars`);
        console.warn(`   Pages with permissions: ${Object.keys(minimal.pagePermissions).length}`);

        // Try storing only read permissions (most critical) - remove write if needed
        const readOnlyPermissions: Record<string, { read: boolean }> = {};
        Object.keys(minimal.pagePermissions).forEach((pageId) => {
          const perm = minimal.pagePermissions[pageId];
          if (perm.read === true) {
            // Only store read=true, write is implied as false
            readOnlyPermissions[pageId] = { read: true };
          }
        });

        const readOnly = {
          role: minimal.role,
          organizationId: minimal.organizationId,
          clipShowProAccess: minimal.clipShowProAccess,
          isClipShowProUser: minimal.isClipShowProUser,
          pagePermissions: readOnlyPermissions,
        };

        const readOnlyStr = JSON.stringify(readOnly);
        if (readOnlyStr.length > 1000) {
          console.error(`❌ Even read-only claims exceed limit (${readOnlyStr.length} chars)`);
          console.error(`   pagePermissions alone is ${JSON.stringify(readOnlyPermissions).length} chars`);
          console.error(`   User has ${Object.keys(readOnlyPermissions).length} pages with read access`);
          throw new HttpsError('internal', `Claims too large (${readOnlyStr.length} chars) - even read-only pagePermissions exceed limit. User has too many permissions (${Object.keys(readOnlyPermissions).length} pages). Consider reducing permissions.`);
        }

        // Use read-only version
        Object.keys(optimized).forEach(key => {
          if (!['role', 'organizationId', 'clipShowProAccess', 'isClipShowProUser', 'pagePermissions'].includes(key)) {
            delete optimized[key];
          }
        });
        optimized.pagePermissions = readOnlyPermissions;
        console.log(`✅ Optimized claims to ${readOnlyStr.length} characters (read-only format - write permissions removed)`);
      } else {
        // Replace with minimal
        Object.keys(optimized).forEach(key => {
          if (!['role', 'organizationId', 'clipShowProAccess', 'isClipShowProUser', 'pagePermissions'].includes(key)) {
            delete optimized[key];
          }
        });
        console.log(`✅ Optimized claims to ${minimalStr.length} characters (minimal format - pagePermissions only)`);
      }
    }
  } else {
    console.log(`✅ Optimized claims to ${optimizedStr.length} characters`);
  }

  // CRITICAL: Ensure pagePermissions is always present
  if (!optimized.pagePermissions || Object.keys(optimized.pagePermissions).length === 0) {
    console.error(`❌ CRITICAL ERROR: pagePermissions was removed during optimization!`);
    throw new HttpsError('internal', 'Cannot optimize claims: pagePermissions is required and cannot be removed');
  }

  // Final size check - throw error if still too large
  const finalStr = JSON.stringify(optimized);
  if (finalStr.length > 1000) {
    console.error(`❌ Claims too large even after optimization: ${finalStr.length} characters`);
    console.error(`   Essential fields: role=${optimized.role}, orgId=${optimized.organizationId}`);
    console.error(`   pagePermissions keys: ${Object.keys(optimized.pagePermissions || {}).length}`);
    console.error(`   pagePermissions size: ${JSON.stringify(optimized.pagePermissions).length} chars`);
    throw new HttpsError('internal', `Claims too large even after optimization: ${finalStr.length} characters`);
  }

  return optimized;
}

/**
 * Internal function to update claims (shared logic)
 */
export async function updateClipShowProClaimsInternal(
  params: UpdateClaimsInternalParams
): Promise<{ success: boolean; role: ClipShowProRole; hierarchy: number }> {
  const { uid, role, organizationId, pagePermissions, preserveExistingClaims = true, additionalClaims = {} } = params;

  if (!uid || !organizationId) {
    throw new Error('User ID and organization ID are required');
  }

  // Get user record
  let userRecord;
  try {
    userRecord = await auth.getUser(uid);
  } catch (error: any) {
    throw new Error(`User not found: ${error.message}`);
  }

  const currentClaims = userRecord.customClaims || {};

  // Determine role - use provided role, or map from contact role, or use existing
  let clipShowRole: ClipShowProRole;

  // New: Check for appRoles in current claims or additionalClaims
  const existingAppRoles = currentClaims.appRoles || {};
  const providedAppRoles = additionalClaims.appRoles || {};
  const effectiveAppRoles = { ...existingAppRoles, ...providedAppRoles };

  if (effectiveAppRoles.clipShowProRole) {
    // 1st Priority: Explicit App Role override
    clipShowRole = effectiveAppRoles.clipShowProRole as ClipShowProRole;
    console.log(`ℹ️ Using explicit Clip Show Pro role from appRoles: ${clipShowRole}`);
  } else if (role) {
    // 2nd Priority: Provided generic role (mapped)
    // Map contact role to Clip Show Pro role if needed
    clipShowRole = mapContactRoleToClipShowRole(role);
  } else if (currentClaims.clipShowProRole) {
    // 3rd Priority: Existing specific CSP role claim
    clipShowRole = currentClaims.clipShowProRole as ClipShowProRole;
  } else if (currentClaims.role) {
    // 4th Priority: Existing generic role claim
    clipShowRole = currentClaims.role as ClipShowProRole;
  } else {
    // Default to CONTACT if no role specified
    clipShowRole = 'CONTACT';
  }

  // Get role defaults
  const roleDefaults = getRoleDefaults(clipShowRole);

  // Merge page permissions from matrix with role defaults
  const finalPagePermissions = mergePagePermissions(
    roleDefaults.pagePermissions,
    pagePermissions
  );

  // Compress pagePermissions immediately - only keep permissions that are true
  // This saves significant space by removing false/false entries
  const compressedFinalPagePermissions: Record<PageId, PagePermission> = {} as Record<PageId, PagePermission>;
  Object.keys(finalPagePermissions).forEach((pageId) => {
    const perm = finalPagePermissions[pageId as PageId];
    // Only include if at least one permission is true
    if (perm && (perm.read === true || perm.write === true)) {
      compressedFinalPagePermissions[pageId as PageId] = {
        read: perm.read === true,
        write: perm.write === true
      };
    }
    // Skip false/false permissions entirely to save space
  });

  // Build comprehensive claims
  // When preserving existing claims, be selective - don't preserve everything
  const newClaims: Record<string, any> = preserveExistingClaims
    ? {
      // Only preserve essential claims that don't change
      role: currentClaims.role,
      organizationId: currentClaims.organizationId,
      clipShowProAccess: currentClaims.clipShowProAccess,
      isClipShowProUser: currentClaims.isClipShowProUser,
      // Preserve subscriptionAddOns if it exists (small, important)
      ...(currentClaims.subscriptionAddOns && {
        subscriptionAddOns: currentClaims.subscriptionAddOns
      }),
      // Preserve permissions array if it exists (critical for legacy checks)
      ...(currentClaims.permissions && {
        permissions: currentClaims.permissions
      }),
      // Preserve isOrganizationOwner flag from registration
      ...(currentClaims.isOrganizationOwner !== undefined && {
        isOrganizationOwner: currentClaims.isOrganizationOwner
      }),
      // Preserve appRoles
      ...(currentClaims.appRoles && {
        appRoles: currentClaims.appRoles
      }),
      // Preserve individual app role claims
      ...(currentClaims.clipShowProRole && { clipShowProRole: currentClaims.clipShowProRole }),
      ...(currentClaims.dashboardRole && { dashboardRole: currentClaims.dashboardRole }),
      ...(currentClaims.callSheetRole && { callSheetRole: currentClaims.callSheetRole }),
      ...(currentClaims.cuesheetRole && { cuesheetRole: currentClaims.cuesheetRole }),
      // Preserve hierarchy level and sync effectiveHierarchy
      // Preserve hierarchy level and sync effectiveHierarchy
      ...(currentClaims.hierarchy !== undefined && {
        hierarchy: currentClaims.hierarchy,
        effectiveHierarchy: currentClaims.hierarchy
      }),
    }
    : {};

  // Core identity (always set)
  newClaims.role = clipShowRole;
  newClaims.organizationId = organizationId;

  // Clip Show Pro access flags (REQUIRED for app access)
  newClaims.clipShowProAccess = true;
  newClaims.isClipShowProUser = true;
  // Removed canAccessProjects - redundant (clipShowProAccess implies this)

  // Explicitly set the resolved Clip Show Pro role
  newClaims.clipShowProRole = clipShowRole;

  // Ensure appRoles object is up to date in the claim
  newClaims.appRoles = {
    ...(newClaims.appRoles || effectiveAppRoles || {}),
    clipShowProRole: clipShowRole
  };

  // Hierarchy (only add if there's space - optimization will remove if needed)
  // Don't add initially to keep claims small
  // newClaims.effectiveHierarchy = roleDefaults.hierarchy;
  // newClaims.hierarchy = roleDefaults.hierarchy;

  // Basic permissions array (only add if there's space - optimization will remove if needed)
  // Don't add initially to keep claims small - pagePermissions is more important
  // newClaims.permissions = [...roleDefaults.permissions];

  // Store pagePermissions as object for easy access (compressed version)
  // NOTE: We do NOT add flat format claims (page:pageId:read) to save space
  // The frontend checks both nested (pagePermissions[pageId].read) and flat (page:pageId:read)
  // but we'll rely on nested format only to stay under 1000 char limit
  newClaims.pagePermissions = compressedFinalPagePermissions;

  // Admin flags (only if admin role - saves space for non-admins)
  if (clipShowRole === 'ADMIN' || clipShowRole === 'SUPERADMIN' || clipShowRole === 'OWNER') {
    newClaims.isAdmin = true;
    newClaims.isOrganizationOwner = true;
    newClaims.canManageUsers = true;
    newClaims.canManageOrganization = true;
    newClaims.canAccessAdminPanel = true;

    if (clipShowRole === 'SUPERADMIN') {
      newClaims.superAdmin = true;
    }
  }

  // Don't add subscriptionAddOns initially - optimization will add it only if there's space
  // This saves ~50-100 characters for most users

  // Apply any additional claims (e.g., isContact, contactId)
  Object.assign(newClaims, additionalClaims);

  // Don't add metadata fields - they're not critical and take up space
  // Removed: permissionsUpdatedAt, lastUpdated, claimsSource

  // Optimize claims size - CRITICAL: Ensure pagePermissions is always preserved
  const optimizedClaims = optimizeClaimsSize(newClaims);

  // VERIFICATION: Ensure pagePermissions wasn't removed during optimization
  if (!optimizedClaims.pagePermissions || Object.keys(optimizedClaims.pagePermissions).length === 0) {
    console.error(`❌ [clipShowProUpdateClaims] CRITICAL: pagePermissions was removed during optimization!`);
    console.error(`   Restoring pagePermissions from finalPagePermissions...`);
    // Force restore pagePermissions - this should never happen if optimizeClaimsSize works correctly
    optimizedClaims.pagePermissions = finalPagePermissions;

    // Check if claims are still too large
    const claimsStr = JSON.stringify(optimizedClaims);
    if (claimsStr.length > 1000) {
      console.error(`❌ [clipShowProUpdateClaims] Claims still too large (${claimsStr.length} chars) even with pagePermissions only`);
      // Remove everything except essential + pagePermissions
      const minimal = {
        role: optimizedClaims.role,
        organizationId: optimizedClaims.organizationId,
        clipShowProAccess: optimizedClaims.clipShowProAccess,
        isClipShowProUser: optimizedClaims.isClipShowProUser,
        pagePermissions: finalPagePermissions,
        permissionsUpdatedAt: Date.now()
      };
      const minimalStr = JSON.stringify(minimal);
      if (minimalStr.length > 1000) {
        throw new HttpsError('internal', `Claims too large (${minimalStr.length} chars) - pagePermissions alone exceeds 1000 char limit`);
      }
      Object.assign(optimizedClaims, minimal);
      console.warn(`⚠️ [clipShowProUpdateClaims] Using minimal claims format to preserve pagePermissions`);
    }
  }

  // Verify all permissions from matrix are in optimized claims (nested format only)
  if (pagePermissions && pagePermissions.length > 0) {
    const missingPermissions: string[] = [];
    pagePermissions.forEach(perm => {
      const hasNested = optimizedClaims.pagePermissions?.[perm.pageId]?.read === perm.read;
      // Only check nested format - flat format is not used to save space
      if (!hasNested && perm.read) {
        missingPermissions.push(perm.pageId);
      }
    });

    if (missingPermissions.length > 0) {
      console.warn(`⚠️ [clipShowProUpdateClaims] Some permissions missing after optimization: ${missingPermissions.join(', ')}`);
      // Restore missing permissions (nested format only)
      missingPermissions.forEach(pageId => {
        const perm = pagePermissions.find(p => p.pageId === pageId);
        if (perm) {
          if (!optimizedClaims.pagePermissions) {
            optimizedClaims.pagePermissions = {};
          }
          optimizedClaims.pagePermissions[pageId] = {
            read: perm.read,
            write: perm.write
          };
          // Do NOT add flat format - saves space
        }
      });

      // Re-optimize after restoring permissions
      const reOptimized = optimizeClaimsSize(optimizedClaims);
      Object.assign(optimizedClaims, reOptimized);
    }
  }

  // Set custom claims
  await auth.setCustomUserClaims(uid, optimizedClaims);

  // VERIFICATION: Verify claims were set correctly
  const verifyUserRecord = await auth.getUser(uid);
  const verifyClaims = verifyUserRecord.customClaims || {};
  const hasPagePermissions = !!verifyClaims.pagePermissions && Object.keys(verifyClaims.pagePermissions).length > 0;

  if (!hasPagePermissions) {
    console.error(`❌ [clipShowProUpdateClaims] VERIFICATION FAILED: pagePermissions not in claims after update!`);
    throw new HttpsError('internal', 'Failed to set pagePermissions in claims - verification failed');
  }

  const pagesWithAccess = Object.keys(finalPagePermissions).filter(p => finalPagePermissions[p as PageId].read).length;
  console.log(`✅ [clipShowProUpdateClaims] Updated claims for user ${uid}`);
  console.log(`   Role: ${clipShowRole}, Hierarchy: ${roleDefaults.hierarchy}`);
  console.log(`   Organization: ${organizationId}`);
  console.log(`   Pages with access: ${pagesWithAccess}`);
  console.log(`   pagePermissions keys: ${Object.keys(verifyClaims.pagePermissions || {}).length}`);
  console.log(`   Claims size: ${JSON.stringify(optimizedClaims).length} characters`);

  // Update user document in Firestore
  try {
    await db.collection('users').doc(uid).set({
      ...optimizedClaims,
      updatedAt: new Date(),
    }, { merge: true });
    console.log(`✅ [clipShowProUpdateClaims] Updated user document in Firestore`);
  } catch (firestoreError) {
    console.warn(`⚠️ [clipShowProUpdateClaims] Could not update Firestore user document:`, firestoreError);
    // Don't fail if Firestore update fails
  }

  return {
    success: true,
    role: clipShowRole,
    hierarchy: roleDefaults.hierarchy,
  };
}

/**
 * Clip Show Pro Update Claims - Main Callable Function
 * 
 * Updates Firebase custom claims for a user based on their role and permissions matrix.
 */
export const clipShowProUpdateClaims = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { uid, role, organizationId, pagePermissions, preserveExistingClaims = true } =
        request.data as UpdateClaimsRequest;

      if (!uid || !organizationId) {
        throw new HttpsError('invalid-argument', 'User ID and organization ID are required');
      }

      // Verify user is authenticated
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const callerUid = request.auth.uid;
      const callerClaims = (request.auth.token || {}) as any;
      const callerRole = callerClaims.role;

      // SECURITY CHECK: Authorization Logic
      // 1. Is caller modifying another user?
      if (callerUid !== uid) {
        // Must be ADMIN, SUPERADMIN, or OWNER to modify others
        const isAdmin = ['ADMIN', 'SUPERADMIN', 'OWNER'].includes(callerRole);
        if (!isAdmin) {
          throw new HttpsError('permission-denied', 'Insufficient permissions to modify other users');
        }
      } else {
        // 2. Caller is modifying self
        // Users cannot set their own role to anything. Role must be determined by system/invite/license.
        // We ignore the 'role' parameter from the request if it differs from current or calculated.

        // If a role is passed in the request, we verify it matches their current entitlement
        // For now, to be safe, we will ONLY allow ADMINs to set the 'role' parameter explicitly.
        // If a non-admin calls this on themselves, we use their EXISTING role or 'CONTACT'.

        // Exception: If they are already an admin, they might be refreshing their own claims, 
        // effectively "setting" their role to what it already is.

        const isSelfAdmin = ['ADMIN', 'SUPERADMIN', 'OWNER'].includes(callerRole);

        if (!isSelfAdmin && role && ['ADMIN', 'SUPERADMIN', 'OWNER'].includes(role)) {
          // Standard user trying to escalate to Admin
          throw new HttpsError('permission-denied', 'Users cannot elevate their own role');
        }

        // If user is not admin, ignore the requested role and use existing or safe default
        if (!isSelfAdmin && role && role !== callerRole) {
          console.warn(`⚠️ [clipShowProUpdateClaims] User ${callerUid} tried to set role to ${role}, ignoring.`);
          // The internal function will default to existing or CONTACT if valid role not passed?
          // Actually, we should pass 'undefined' for role to force internal logic to pick safe default or existing
          // But internal logic uses "role" param if present.

          // Let's rely on internal logic: 
          // "Determine role - use provided role, or map from contact role, or use existing"
          // We will Modify the call to internal function below to potentially strip 'role' if unauthorized.
        }
      }

      // Safe Role Determination
      let safeRole = role;
      if (callerUid === uid) {
        const isSelfAdmin = ['ADMIN', 'SUPERADMIN', 'OWNER'].includes(callerRole);
        // If a normal user tries to pass a role, we ignore it and force it to be undefined 
        // so internal logic falls back to current claims or defaults.
        // Unless they are already that role (refreshing).
        if (!isSelfAdmin) {
          safeRole = undefined; // Force recalculation/usage of existing
        }
      }

      const result = await updateClipShowProClaimsInternal({
        uid,
        role: safeRole,
        organizationId,
        pagePermissions,
        preserveExistingClaims,
      });

      return {
        message: 'User claims updated successfully',
        ...result,
        organizationId,
        success: true,
      };

    } catch (error: any) {
      console.error('❌ [clipShowProUpdateClaims] Error updating claims:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        `Failed to update user claims: ${error.message}`
      );
    }
  }
);

