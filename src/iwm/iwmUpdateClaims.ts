/**
 * IWM Update Claims
 * 
 * Updates Firebase custom claims for IWM users based on their role and page permissions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { auth, db } from '../shared/utils';

interface UpdateClaimsRequest {
  uid: string;
  role?: string;
  organizationId: string;
  pagePermissions?: Array<{
    pageId: string;
    read: boolean;
    write: boolean;
  }>;
  preserveExistingClaims?: boolean;
}

/**
 * IWM Update Claims - Main Callable Function
 * 
 * Updates Firebase custom claims for a user based on their role and permissions matrix.
 */
export const iwmUpdateClaims = onCall(
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
      // Only admins can modify other users' claims
      if (callerUid !== uid) {
        // Check caller's role from claims first
        let isAdmin = false;
        const callerRoleUpper = callerRole ? String(callerRole).toUpperCase() : '';
        
        isAdmin = ['ADMIN', 'SUPERADMIN', 'OWNER', 'ORGANIZATION_OWNER'].includes(callerRoleUpper) ||
                  callerClaims.isAdmin === true ||
                  callerClaims.superAdmin === true ||
                  callerClaims.canAccessAdminPanel === true;

        // If not admin from claims, check teamMembers collection
        if (!isAdmin) {
          try {
            const callerTeamMemberQuery = db.collection('teamMembers')
              .where('userId', '==', callerUid)
              .limit(1);
            const callerTeamMemberSnapshot = await callerTeamMemberQuery.get();
            
            if (!callerTeamMemberSnapshot.empty) {
              const callerTeamMemberData = callerTeamMemberSnapshot.docs[0].data();
              const callerTeamRole = callerTeamMemberData?.role || '';
              const callerTeamRoleUpper = String(callerTeamRole).toUpperCase();
              
              isAdmin = ['ADMIN', 'SUPERADMIN', 'OWNER', 'ORGANIZATION_OWNER'].includes(callerTeamRoleUpper) ||
                       callerTeamMemberData?.isAdmin === true;
            }
          } catch (error) {
            console.warn('⚠️ [iwmUpdateClaims] Could not check caller role from teamMembers:', error);
          }
        }

        if (!isAdmin) {
          console.error('❌ [iwmUpdateClaims] Access denied:', {
            callerUid,
            callerRole,
            callerClaims: {
              isAdmin: callerClaims.isAdmin,
              superAdmin: callerClaims.superAdmin,
              canAccessAdminPanel: callerClaims.canAccessAdminPanel,
            }
          });
          throw new HttpsError('permission-denied', 'Insufficient permissions to modify other users');
        }
      }

      // Get current user record
      const userRecord = await auth.getUser(uid);
      const currentClaims = userRecord.customClaims || {};

      // Get user's role from teamMembers if not provided
      let userRole = role;
      if (!userRole) {
        try {
          const teamMemberQuery = db.collection('teamMembers')
            .where('userId', '==', uid)
            .limit(1);
          const teamMemberSnapshot = await teamMemberQuery.get();
          
          if (!teamMemberSnapshot.empty) {
            const teamMemberData = teamMemberSnapshot.docs[0].data();
            userRole = teamMemberData.role || currentClaims.role || 'MEMBER';
          } else {
            userRole = currentClaims.role || 'MEMBER';
          }
        } catch (error) {
          console.warn('⚠️ [iwmUpdateClaims] Could not fetch role from teamMembers:', error);
          userRole = currentClaims.role || 'MEMBER';
        }
      }

      // Determine if user is admin
      const isAdmin = userRole && ['ADMIN', 'SUPERADMIN', 'OWNER', 'ORGANIZATION_OWNER'].includes(userRole.toUpperCase()) ||
                     currentClaims.isAdmin === true ||
                     currentClaims.superAdmin === true;

      // Build updated claims
      let updatedClaims: Record<string, any> = {};

      if (preserveExistingClaims) {
        // Preserve existing claims
        updatedClaims = {
          ...currentClaims,
        };
      }

      // Update role and organization
      updatedClaims.role = userRole || 'MEMBER';
      updatedClaims.organizationId = organizationId;
      updatedClaims.isAdmin = isAdmin;
      updatedClaims.superAdmin = userRole ? (userRole.toUpperCase() === 'SUPERADMIN' || userRole.toUpperCase() === 'OWNER') : false;

      // Update page permissions if provided
      // OPTIMIZATION: Only store nested format to save space (removed flat format)
      if (pagePermissions && Array.isArray(pagePermissions)) {
        // Build pagePermissions object (nested format only)
        const pagePermsObj: Record<string, { read: boolean; write: boolean }> = {};

        pagePermissions.forEach(perm => {
          if (perm.pageId) {
            pagePermsObj[perm.pageId] = {
              read: perm.read || false,
              write: perm.write || false,
            };
          }
        });

        updatedClaims.pagePermissions = pagePermsObj;
      } else if (preserveExistingClaims && currentClaims.pagePermissions) {
        // Preserve existing page permissions if not provided
        updatedClaims.pagePermissions = currentClaims.pagePermissions;
      }

      // Add timestamp
      updatedClaims.lastUpdated = Date.now();

      // Check if claims exceed 1000 character limit (Firebase Auth limit)
      const claimsStr = JSON.stringify(updatedClaims);
      if (claimsStr.length > 1000) {
        console.warn(`⚠️ [iwmUpdateClaims] Claims size: ${claimsStr.length} chars (limit: 1000)`);
        
        // Optimize by keeping only essential claims (nested format only, no flat format)
        updatedClaims = {
          role: updatedClaims.role,
          organizationId: updatedClaims.organizationId,
          isAdmin: updatedClaims.isAdmin,
          superAdmin: updatedClaims.superAdmin,
          pagePermissions: updatedClaims.pagePermissions,
          lastUpdated: updatedClaims.lastUpdated,
        };

        const optimizedStr = JSON.stringify(updatedClaims);
        if (optimizedStr.length > 1000) {
          console.error(`❌ [iwmUpdateClaims] Optimized claims still exceed limit (${optimizedStr.length} chars)`);
          throw new HttpsError(
            'resource-exhausted',
            `Claims too large: ${optimizedStr.length} characters (limit: 1000). Please reduce the number of page permissions.`
          );
        }
        console.log(`✅ [iwmUpdateClaims] Optimized claims to ${optimizedStr.length} characters`);
      }

      // Update custom claims
      await auth.setCustomUserClaims(uid, updatedClaims);

      console.log(`✅ [iwmUpdateClaims] Updated claims for user ${uid}:`, {
        role: userRole,
        organizationId,
        pagePermissionsCount: pagePermissions?.length || 0,
        updatedBy: callerUid,
      });

      return {
        success: true,
        message: 'User claims updated successfully',
        role: userRole,
        organizationId,
        pagePermissionsCount: pagePermissions?.length || 0,
      };

    } catch (error: any) {
      console.error('❌ [iwmUpdateClaims] Error updating claims:', error);

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

