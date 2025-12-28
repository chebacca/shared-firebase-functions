/**
 * Authentication Helpers for ML Functions
 * 
 * Provides centralized authentication and organization validation
 * to ensure proper tenant isolation in all ML operations.
 */

import { getAuth } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import { getUserOrganizationId } from '../shared/utils';

const auth = getAuth();

export interface AuthenticatedUser {
  userId: string;
  organizationId: string;
  email?: string;
}

/**
 * Get authenticated user's organization ID from auth token
 * This ensures tenant isolation - users can only access their own organization's data
 */
export async function getAuthenticatedUserOrg(request: any): Promise<AuthenticatedUser> {
  // 1. Extract userId from request.auth
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // 2. Get user record
  const userRecord = await auth.getUser(userId);
  const email = userRecord.email || '';

  // 3. Get organizationId from custom claims first
  let organizationId = userRecord.customClaims?.organizationId as string | undefined;

  // 4. If not in claims, get from database
  if (!organizationId) {
    organizationId = await getUserOrganizationId(userId, email) || undefined;
  }

  // 5. Validate user has organization
  if (!organizationId) {
    throw new HttpsError(
      'permission-denied',
      'User not associated with any organization'
    );
  }

  return {
    userId,
    organizationId,
    email
  };
}

/**
 * Validate that a user has access to a specific organization
 * Returns true only if the user's organization matches the requested one
 */
export async function validateOrgAccess(
  userId: string,
  requestedOrgId: string
): Promise<boolean> {
  // Get user's actual organizationId
  const userRecord = await auth.getUser(userId);
  const email = userRecord.email || '';
  
  let userOrgId = userRecord.customClaims?.organizationId as string | undefined;
  
  if (!userOrgId) {
    userOrgId = await getUserOrganizationId(userId, email) || undefined;
  }

  // Return true only if they match
  return userOrgId === requestedOrgId;
}

