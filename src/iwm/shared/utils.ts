import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = getFirestore();
export const auth = admin.auth();

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  errorDetails?: string;
}

export const createSuccessResponse = <T>(
  data: T,
  message?: string
): ApiResponse<T> => ({
  success: true,
  data,
  message
});

export const createErrorResponse = (
  error: string,
  errorDetails?: string
): ApiResponse => ({
  success: false,
  error,
  errorDetails
});

export const handleError = (error: any, context: string): ApiResponse => {
  console.error(`[${context}] Error:`, error);
  
  const errorMessage = error.message || 'Internal server error';
  const errorDetails = error.stack || error.toString();
  
  return createErrorResponse(errorMessage, errorDetails);
};

export const setCorsHeaders = (req: any, res: any) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export const validateOrganizationAccess = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // Check teamMembers collection by userId field first (Firebase UID)
    let teamMembersQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!teamMembersQuery.empty) {
      return true;
    }

    // If not found by userId, try by document ID (in case userId is the document ID)
    const teamMemberDoc = await db.collection('teamMembers').doc(userId).get();
    if (teamMemberDoc.exists) {
      const teamMemberData = teamMemberDoc.data();
      return teamMemberData?.organizationId === organizationId;
    }

    return false;
  } catch (error) {
    console.error('Error validating organization access:', error);
    return false;
  }
};

