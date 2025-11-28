/**
 * Update EDL Converter Claims
 * 
 * Sets the isEDLConverter claim for users who should have access to the EDL Converter
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

export const updateEDLConverterClaims = functions.https.onCall(async (data: any, context: any) => {
  try {
    // Check if user is authenticated
    if (!context.auth) {
      return createErrorResponse('User not authenticated');
    }

    const userId = context.auth.uid;
    const { targetUserId, enableEDLConverter } = data;

    // Allow users to update their own claims or require admin privileges
    const isUpdatingSelf = userId === targetUserId;
    const isAdmin = context.auth.token.role === 'SUPER_ADMIN' || 
                   context.auth.token.hierarchy >= 90 ||
                   context.auth.token.isAdmin === true;

    if (!isUpdatingSelf && !isAdmin) {
      return createErrorResponse('Insufficient permissions to update claims');
    }

    // Get current user claims
    const userRecord = await admin.auth().getUser(targetUserId);
    const currentClaims = userRecord.customClaims || {};

    // Update claims with EDL Converter access
    const updatedClaims = {
      ...currentClaims,
      isEDLConverter: enableEDLConverter === true,
      lastUpdated: Date.now()
    };

    // Set updated claims
    await admin.auth().setCustomUserClaims(targetUserId, updatedClaims);

    console.log(`✅ [updateEDLConverterClaims] Updated claims for user ${targetUserId}:`, {
      isEDLConverter: enableEDLConverter,
      updatedBy: userId
    });

    return createSuccessResponse({
      userId: targetUserId,
      isEDLConverter: enableEDLConverter,
      claims: updatedClaims
    }, 'EDL Converter claims updated successfully');

  } catch (error) {
    return handleError(error, 'updateEDLConverterClaims');
  }
});

/**
 * Grant EDL Converter access to ENTERPRISE users
 */
export const grantEDLConverterAccessToEnterpriseUsers = functions.https.onCall(async (data: any, context: any) => {
  try {
    // Check if user is admin
    if (!context.auth || 
        (context.auth.token.role !== 'SUPER_ADMIN' && 
         context.auth.token.hierarchy < 90 && 
         context.auth.token.isAdmin !== true)) {
      return createErrorResponse('Admin privileges required');
    }

    // Get all users with ENTERPRISE license type
    const users = await admin.auth().listUsers();
    const enterpriseUsers = users.users.filter(user => {
      const claims = user.customClaims || {};
      return claims.licenseType === 'ENTERPRISE' || claims.role === 'SUPER_ADMIN';
    });

    const results = [];

    for (const user of enterpriseUsers) {
      try {
        const currentClaims = user.customClaims || {};
        
        // Only update if isEDLConverter is not already true
        if (currentClaims.isEDLConverter !== true) {
          const updatedClaims = {
            ...currentClaims,
            isEDLConverter: true,
            lastUpdated: Date.now()
          };

          await admin.auth().setCustomUserClaims(user.uid, updatedClaims);
          
          results.push({
            uid: user.uid,
            email: user.email,
            updated: true
          });

          console.log(`✅ [grantEDLConverterAccessToEnterpriseUsers] Granted EDL access to ${user.email}`);
        } else {
          results.push({
            uid: user.uid,
            email: user.email,
            updated: false,
            reason: 'Already has EDL Converter access'
          });
        }
      } catch (error) {
        console.error(`❌ [grantEDLConverterAccessToEnterpriseUsers] Error updating user ${user.email}:`, error);
        results.push({
          uid: user.uid,
          email: user.email,
          updated: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return createSuccessResponse({
      totalUsers: enterpriseUsers.length,
      results
    }, `Processed ${enterpriseUsers.length} enterprise users`);

  } catch (error) {
    return handleError(error, 'grantEDLConverterAccessToEnterpriseUsers');
  }
});
