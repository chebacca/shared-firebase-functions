import * as admin from 'firebase-admin';
import { ApiResponse } from './types';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();

export const createApiResponse = <T>(
  success: boolean,
  data?: T,
  error?: string,
  message?: string,
  errorDetails?: string
): ApiResponse<T> => ({
  success,
  data,
  error,
  message,
  errorDetails
});

export const createSuccessResponse = <T>(
  data: T,
  message?: string
): ApiResponse<T> => createApiResponse(true, data, undefined, message);

export const createErrorResponse = (
  error: string,
  errorDetails?: string,
  statusCode: number = 500
): ApiResponse => createApiResponse(false, undefined, error, undefined, errorDetails);

export const handleError = (error: any, context: string): ApiResponse => {
  console.error(`[${context}] Error:`, error);
  
  const errorMessage = error.message || 'Internal server error';
  const errorDetails = error.stack || error.toString();
  
  return createErrorResponse(errorMessage, errorDetails);
};

export const validateOrganizationAccess = async (
  userId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData?.organizationId === organizationId;
  } catch (error) {
    console.error('Error validating organization access:', error);
    return false;
  }
};

export const getUserOrganizationId = async (userId: string, userEmail: string): Promise<string | null> => {
  let organizationId: string | null = null;
  
  console.log(`🔍 [ORG LOOKUP] Starting lookup - userId: ${userId}, userEmail: "${userEmail}"`);
  
  // Special case: Handle enterprise user's dual organization issue
  if (userEmail === 'enterprise.user@enterprisemedia.com') {
    console.log(`✅ [ORG LOOKUP] Special handling for enterprise user - returning enterprise-media-org`);
    return 'enterprise-media-org';
  }

  // Special case: Handle admin.clipshow user organization
  if (userEmail === 'admin.clipshow@example.com') {
    console.log(`✅ [ORG LOOKUP] Special handling for admin.clipshow user - returning clip-show-pro-productions`);
    return 'clip-show-pro-productions';
  }
  
  console.log(`🔍 [ORG LOOKUP] No special case match, proceeding with database lookup...`);
  
  // Try to get from users collection first
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      organizationId = userData?.organizationId;
      if (organizationId) {
        console.log(`[ORG LOOKUP] Found organization in users collection: ${organizationId}`);
        return organizationId;
      }
    }
  } catch (error) {
    console.error('Error getting organization from users collection:', error);
  }
  
  // Try to get from teamMembers collection
  try {
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .limit(1)
      .get();
    
    if (!teamMemberQuery.empty) {
      const teamMemberDoc = teamMemberQuery.docs[0];
      const teamMemberData = teamMemberDoc.data();
      organizationId = teamMemberData?.organizationId;
      if (organizationId) {
        console.log(`[ORG LOOKUP] Found organization in teamMembers collection: ${organizationId}`);
        return organizationId;
      }
    }
  } catch (error) {
    console.error('Error getting organization from teamMembers collection:', error);
  }
  
  console.log(`[ORG LOOKUP] No organization found for user: ${userId}`);
  return null;
};

export const validateProjectAccess = async (
  userId: string,
  projectId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // Check if user has access to the organization
    const hasOrgAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasOrgAccess) {
      return false;
    }
    
    // Check if project belongs to the organization
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return false;
    }
    
    const projectData = projectDoc.data();
    return projectData?.organizationId === organizationId;
  } catch (error) {
    console.error('Error validating project access:', error);
    return false;
  }
};

export const validateDatasetAccess = async (
  userId: string,
  datasetId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // Check if user has access to the organization
    const hasOrgAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasOrgAccess) {
      return false;
    }
    
    // Check if dataset belongs to the organization
    const datasetDoc = await db.collection('datasets').doc(datasetId).get();
    if (!datasetDoc.exists) {
      return false;
    }
    
    const datasetData = datasetDoc.data();
    return datasetData?.organizationId === organizationId;
  } catch (error) {
    console.error('Error validating dataset access:', error);
    return false;
  }
};

export const validateSessionAccess = async (
  userId: string,
  sessionId: string,
  organizationId: string
): Promise<boolean> => {
  try {
    // Check if user has access to the organization
    const hasOrgAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasOrgAccess) {
      return false;
    }
    
    // Check if session belongs to the organization
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
      return false;
    }
    
    const sessionData = sessionDoc.data();
    return sessionData?.organizationId === organizationId;
  } catch (error) {
    console.error('Error validating session access:', error);
    return false;
  }
};

export const generateId = (): string => {
  return db.collection('_temp').doc().id;
};

export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const key in input) {
      sanitized[key] = sanitizeInput(input[key]);
    }
    return sanitized;
  }
  return input;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateRequiredFields = (data: any, requiredFields: string[]): string[] => {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missingFields.push(field);
    }
  }
  
  return missingFields;
};

export const formatDate = (date: Date | admin.firestore.Timestamp): Date => {
  if (date instanceof admin.firestore.Timestamp) {
    return date.toDate();
  }
  return date;
};

export const createTimestamp = (): admin.firestore.Timestamp => {
  return admin.firestore.Timestamp.now();
};

export const createFieldValue = () => admin.firestore.FieldValue;

export const batchWrite = async (operations: any[]): Promise<void> => {
  const batch = db.batch();
  
  for (const operation of operations) {
    if (operation.type === 'set') {
      batch.set(operation.ref, operation.data, operation.options);
    } else if (operation.type === 'update') {
      batch.update(operation.ref, operation.data);
    } else if (operation.type === 'delete') {
      batch.delete(operation.ref);
    }
  }
  
  await batch.commit();
};

export const paginateQuery = async (
  query: admin.firestore.Query,
  page: number = 1,
  limit: number = 10
): Promise<{ docs: admin.firestore.QueryDocumentSnapshot[], total: number }> => {
  const offset = (page - 1) * limit;
  
  // Get total count
  const countQuery = query.limit(1000); // Firestore limit for counting
  const countSnapshot = await countQuery.get();
  const total = countSnapshot.size;
  
  // Get paginated results
  const paginatedQuery = query.offset(offset).limit(limit);
  const snapshot = await paginatedQuery.get();
  
  return {
    docs: snapshot.docs,
    total
  };
};

export const createPaginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

export const logActivity = async (
  userId: string,
  organizationId: string,
  action: string,
  resource: string,
  resourceId: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await db.collection('activityLogs').add({
      userId,
      organizationId,
      action,
      resource,
      resourceId,
      metadata: metadata || {},
      timestamp: createTimestamp(),
      createdAt: createTimestamp()
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

export const sendNotification = async (
  userId: string,
  organizationId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, any>
): Promise<void> => {
  try {
    await db.collection('notifications').add({
      userId,
      organizationId,
      type,
      title,
      message,
      data: data || {},
      read: false,
      createdAt: createTimestamp(),
      updatedAt: createTimestamp()
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const updateCustomClaimsWithDualRoleSupport = async (
  userId: string,
  projectId: string,
  projectRole: string,
  projectHierarchy: number,
  licensingRole?: string
): Promise<any> => {
  try {
    const userRecord = await auth.getUser(userId);
    const currentClaims = userRecord.customClaims || {};
    
    // Determine licensing role (Tier 1: Organizational)
    // Priority: provided parameter > existing licensingRole > existing role > teamMemberRole
    const determinedLicensingRole = licensingRole || 
      currentClaims.licensingRole || 
      currentClaims.role || 
      (currentClaims.teamMemberRole ? currentClaims.teamMemberRole.toUpperCase() : 'MEMBER');
    
    // Determine if user is an owner
    const isOwner = determinedLicensingRole === 'OWNER' || 
      currentClaims.role === 'OWNER' || 
      currentClaims.isOrganizationOwner === true;
    const ownerHierarchy = isOwner ? 100 : 0;
    
    // Calculate effective hierarchy (max of owner and project hierarchy)
    const effectiveHierarchy = Math.max(ownerHierarchy, projectHierarchy || 0);
    
    // Preserve existing project assignments
    const existingProjectAssignments = currentClaims.projectAssignments || {};
    const updatedProjectAssignments = {
      ...existingProjectAssignments,
      [projectId]: {
        roleId: projectRole,
        roleName: projectRole,
        hierarchy: projectHierarchy,
        assignedAt: new Date().toISOString(),
        syncedFromLicensing: true
      }
    };
    
    // Create enhanced custom claims that preserve ownership
    const enhancedClaims = {
      ...currentClaims, // Preserve all existing claims
      
      // Tier 1: Licensing Website Role (Organizational)
      licensingRole: determinedLicensingRole,
      
      // Tier 2: App-Specific Roles (Functional)
      dashboardRole: currentClaims.dashboardRole || projectRole, // Use projectRole as dashboardRole if not set
      clipShowProRole: currentClaims.clipShowProRole,
      callSheetRole: currentClaims.callSheetRole,
      
      // Enhanced hierarchy system
      hierarchy: effectiveHierarchy,
      effectiveHierarchy: effectiveHierarchy,
      dashboardHierarchy: effectiveHierarchy,
      
      // Dual role system
      hasOwnershipRole: isOwner,
      hasProjectRoles: Object.keys(updatedProjectAssignments).length > 0,
      
      // Project assignments
      projectAssignments: updatedProjectAssignments,
      currentProjectId: projectId,
      currentProjectRole: projectRole,
      currentProjectHierarchy: projectHierarchy,
      
      // Admin access preservation
      isAdmin: effectiveHierarchy >= 90,
      canManageOrganization: isOwner || effectiveHierarchy >= 90,
      canAccessTimecardAdmin: effectiveHierarchy >= 90,
      
      // Legacy compatibility (keep for backward compatibility)
      role: determinedLicensingRole, // Primary role maps to licensingRole
      teamMemberRole: currentClaims.teamMemberRole || determinedLicensingRole.toLowerCase(),
      
      // Enhanced permissions
      permissions: [
        ...(currentClaims.permissions || []),
        'read:projects',
        'write:projects',
        ...(effectiveHierarchy >= 90 ? ['admin:organization', 'admin:timecard'] : [])
      ].filter((perm, index, arr) => arr.indexOf(perm) === index), // Remove duplicates
      
      // Update metadata
      lastUpdated: Date.now(),
      dualRoleSystemEnabled: true
    };
    
    await auth.setCustomUserClaims(userId, enhancedClaims);
    
    console.log(`[DUAL ROLE CLAIMS] Enhanced claims updated for user: ${userId}`);
    console.log(`   - Licensing Role (Tier 1): ${determinedLicensingRole}`);
    console.log(`   - Dashboard Role (Tier 2): ${enhancedClaims.dashboardRole}`);
    console.log(`   - Effective Hierarchy: ${effectiveHierarchy}`);
    console.log(`   - Is Owner: ${isOwner}`);
    console.log(`   - Admin Access: ${effectiveHierarchy >= 90}`);
    console.log(`   - Project Assignments: ${Object.keys(updatedProjectAssignments).length}`);
    
    return enhancedClaims;
  } catch (error) {
    console.error(`[DUAL ROLE CLAIMS] Error updating claims for user ${userId}:`, error);
    throw error;
  }
};

export const isAdminUser = (user: any): boolean => {
  return user.hierarchy >= 90 || user.role === 'OWNER' || user.isOrganizationOwner === true;
};

export const canManageOrganization = (user: any): boolean => {
  return isAdminUser(user) || user.canManageOrganization === true;
};

export const canAccessTimecardAdmin = (user: any): boolean => {
  return isAdminUser(user) || user.canAccessTimecardAdmin === true;
};

export const hasProjectAccess = (user: any, projectId: string): boolean => {
  if (isAdminUser(user)) {
    return true;
  }
  
  const projectAssignments = user.projectAssignments || {};
  return projectId in projectAssignments;
};

export const getProjectRole = (user: any, projectId: string): string | null => {
  const projectAssignments = user.projectAssignments || {};
  const assignment = projectAssignments[projectId];
  return assignment ? assignment.roleName : null;
};

export const getProjectHierarchy = (user: any, projectId: string): number => {
  const projectAssignments = user.projectAssignments || {};
  const assignment = projectAssignments[projectId];
  return assignment ? assignment.hierarchy : 0;
};

export const setCorsHeaders = (req: any, res: any): void => {
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://dashboard-1c3a5.web.app',
    'https://clipshowpro.web.app', // Added Clip Show Pro origin
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4002', // Licensing website
    'http://localhost:4003',
    'http://localhost:4006', // Standalone Call Sheet App (dev port)
    'http://localhost:4007', // Standalone Call Sheet App
    'http://localhost:4010',
    'http://localhost:5173',
    'null'
  ];
  
  const origin = req.headers.origin;
  
  // Always allow the origin that made the request in development mode
  if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
    res.set('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (origin && origin.includes('localhost')) {
    // Always allow localhost origins (for development/testing)
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    // In production, be more restrictive but still allow the request to proceed
    res.set('Access-Control-Allow-Origin', 'https://backbone-client.web.app');
  }
  
  // Set other CORS headers
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Max-Age', '3600'); // Cache preflight request for 1 hour
};
