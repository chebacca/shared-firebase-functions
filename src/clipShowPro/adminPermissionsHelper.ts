/**
 * Helper functions for Clip Show Pro admin pagePermissions
 * Used across Firebase Functions to auto-add permissions for admin users
 */

import { getAuth } from 'firebase-admin/auth';

const auth = getAuth();

/**
 * All Clip Show Pro pages (matching the APP_PAGES constant in frontend)
 */
export const CLIP_SHOW_PRO_PAGES = [
  'projects',
  'pitching-clearance',
  'stories',
  'edit',
  'clips-budget-tracker',
  'contacts',
  'messages',
  'calendar',
  'shows-management',
  'converter',
  'budget',
  'cuesheets',
  'indexed-files'
] as const;

/**
 * Generate full pagePermissions for Clip Show Pro admin users
 * Returns pagePermissions object with read/write access to all pages
 */
export function generateAdminPagePermissions(): Record<string, boolean> {
  const pagePermissions: Record<string, boolean> = {};
  CLIP_SHOW_PRO_PAGES.forEach(pageId => {
    pagePermissions[`page:${pageId}:read`] = true;
    pagePermissions[`page:${pageId}:write`] = true;
  });
  
  return pagePermissions;
}

/**
 * Check if user is a Clip Show Pro admin based on claims
 */
export function isClipShowProAdmin(claims: Record<string, any>): boolean {
  // Admin users in Clip Show Pro have role 'ADMIN' and organizationId that includes 'clip-show'
  // Or they have isAdmin: true or superAdmin: true
  const role = claims.role;
  const orgId = claims.organizationId;
  const isAdmin = claims.isAdmin === true;
  const superAdmin = claims.superAdmin === true;
  
  // Check if this is a Clip Show Pro admin
  return (
    (role === 'ADMIN' && orgId && typeof orgId === 'string' && orgId.includes('clip-show')) ||
    (isAdmin && orgId && typeof orgId === 'string' && orgId.includes('clip-show')) ||
    superAdmin === true
  );
}

/**
 * Auto-add pagePermissions to Clip Show Pro admin user claims if missing
 * Returns true if permissions were added, false otherwise
 */
export async function autoAddAdminPagePermissions(uid: string, currentClaims: Record<string, any>): Promise<boolean> {
  const isAdmin = isClipShowProAdmin(currentClaims);
  const hasPagePermissions = currentClaims.pagePermissions && 
                             typeof currentClaims.pagePermissions === 'object' &&
                             Object.keys(currentClaims.pagePermissions).length > 0;
  
  if (isAdmin && !hasPagePermissions) {
    console.log(`🔧 [autoAddAdminPagePermissions] Auto-adding pagePermissions for Clip Show Pro admin: ${uid}`);
    try {
      const adminPagePermissions = generateAdminPagePermissions();
      const updatedClaims = {
        ...currentClaims,
        pagePermissions: adminPagePermissions,
        permissionsUpdatedAt: Date.now(),
        lastUpdated: Date.now()
      };
      
      await auth.setCustomUserClaims(uid, updatedClaims);
      console.log(`✅ [autoAddAdminPagePermissions] Auto-added ${Object.keys(adminPagePermissions).length} page permissions for admin`);
      return true;
    } catch (claimsError) {
      console.warn(`⚠️ [autoAddAdminPagePermissions] Failed to auto-add pagePermissions:`, claimsError);
      return false;
    }
  }
  
  return false;
}


