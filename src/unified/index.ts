/**
 * 🔥 SHARED FIREBASE FUNCTIONS
 * Common business logic for all applications
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { createErrorResponse } from '../shared/utils';
// Import helper functions for Clip Show Pro admin permissions
import { 
  generateAdminPagePermissions, 
  isClipShowProAdmin, 
  autoAddAdminPagePermissions 
} from '../clipShowPro/adminPermissionsHelper';

const db = getFirestore();
const auth = getAuth();

// ============================================================================
// UNIFIED USER MANAGEMENT
// ============================================================================

/**
 * Get user information with unified data model
 */
export const getUserInfo = onCall(async (request) => {
  try {
    const { uid } = request.data;
    
    if (!uid) {
      throw new Error('User ID is required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};

    // Get user from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create unified user object
    const unifiedUser = {
      id: uid,
      firebaseUid: uid,
      email: userRecord.email || '',
      name: userRecord.displayName || (userData as any).name || userRecord.email?.split('@')[0] || 'User',
      role: (customClaims as any).role || (userData as any).role || 'USER',
      organizationId: (customClaims as any).organizationId || (userData as any).organizationId || '',
      isTeamMember: (customClaims as any).isTeamMember || (userData as any).isTeamMember || false,
      isOrganizationOwner: (customClaims as any).isOrganizationOwner || (userData as any).isOrganizationOwner || false,
      licenseType: (customClaims as any).licenseType || (userData as any).licenseType || 'BASIC',
      projectAccess: (customClaims as any).projectAccess || (userData as any).projectAccess || [],
      permissions: (customClaims as any).permissions || (userData as any).permissions || [],
      
      // Hierarchy System Data
      teamMemberRole: (customClaims as any).teamMemberRole || (userData as any).teamMemberRole,
      dashboardRole: (customClaims as any).dashboardRole || (userData as any).dashboardRole,
      teamMemberHierarchy: (customClaims as any).teamMemberHierarchy || (userData as any).teamMemberHierarchy || 0,
      dashboardHierarchy: (customClaims as any).dashboardHierarchy || (userData as any).dashboardHierarchy || 0,
      effectiveHierarchy: (customClaims as any).effectiveHierarchy || (userData as any).effectiveHierarchy || 0,
      roleMapping: (customClaims as any).roleMapping || (userData as any).roleMapping,
      projectAssignments: (customClaims as any).projectAssignments || (userData as any).projectAssignments || {},
      
      // Application-specific flags
      isEDLConverter: (customClaims as any).isEDLConverter || (userData as any).isEDLConverter || false,
      isCallSheetUser: (customClaims as any).isCallSheetUser || (userData as any).isCallSheetUser || false,
      isStandaloneUser: (customClaims as any).isStandaloneUser || (userData as any).isStandaloneUser || false,
      
      // Metadata
      createdAt: (userData as any).createdAt || new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date()
    };

    return {
      success: true,
      user: unifiedUser
    };

  } catch (error) {
    console.error('Error getting user info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get user info'
    };
  }
});

/**
 * Find Firebase user by email and return UID
 */
export const findUserByEmail = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { email } = request.data;
      
      if (!email) {
        throw new Error('Email is required');
      }

      // Get user by email
      const userRecord = await auth.getUserByEmail(email);

      return {
        success: true,
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
      };

    } catch (error) {
      console.error('Error finding user by email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find user by email'
      };
    }
  }
);

/**
 * Create or update user document in Firestore (for standalone users)
 */
export const ensureUserDocument = onCall(
  {
    cors: true,
  },
  async (request) => {
    try {
      const { uid, userData } = request.data;
      
      if (!uid) {
        throw new Error('User ID is required');
      }

      // Get user record from Firebase Auth
      const userRecord = await auth.getUser(uid);
      const customClaims = userRecord.customClaims || {};

      // Build user document data
      const documentData: any = {
        email: userRecord.email || '',
        displayName: userRecord.displayName || userRecord.email?.split('@')[0] || 'User',
        uid: uid,
        role: customClaims.role || userData?.role || 'USER',
        organizationId: customClaims.organizationId || userData?.organizationId || 'standalone',
        isTeamMember: Boolean(customClaims.isTeamMember || userData?.isTeamMember),
        isOrganizationOwner: Boolean(customClaims.isOrganizationOwner || userData?.isOrganizationOwner),
        licenseType: customClaims.licenseType || userData?.licenseType || 'BASIC',
        projectAccess: customClaims.projectAccess || userData?.projectAccess || [],
        permissions: customClaims.permissions || userData?.permissions || [],
        teamMemberRole: customClaims.teamMemberRole || userData?.teamMemberRole,
        dashboardRole: customClaims.dashboardRole || userData?.dashboardRole,
        teamMemberHierarchy: customClaims.teamMemberHierarchy || userData?.teamMemberHierarchy || 0,
        dashboardHierarchy: customClaims.dashboardHierarchy || userData?.dashboardHierarchy || 0,
        effectiveHierarchy: customClaims.effectiveHierarchy || userData?.effectiveHierarchy || 0,
        roleMapping: customClaims.roleMapping || userData?.roleMapping,
        projectAssignments: customClaims.projectAssignments || userData?.projectAssignments || {},
        subscriptionAddOns: customClaims.subscriptionAddOns || userData?.subscriptionAddOns,
        isEDLConverter: Boolean(customClaims.isEDLConverter || userData?.isEDLConverter),
        isCallSheetUser: Boolean(customClaims.isCallSheetUser || userData?.isCallSheetUser),
        isStandaloneUser: Boolean(customClaims.isStandaloneUser !== undefined ? customClaims.isStandaloneUser : (userData?.isStandaloneUser !== undefined ? userData.isStandaloneUser : true)),
        isParserBrainUser: Boolean(customClaims.isParserBrainUser || userData?.isParserBrainUser),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // LONG-TERM FIX: Check if user is Clip Show Pro admin and auto-add pagePermissions to claims
      // This ensures admins always have permissions even if claims haven't been updated yet
      await autoAddAdminPagePermissions(uid, customClaims);
      
      // Only set createdAt if document doesn't exist
      const userDocRef = db.collection('users').doc(uid);
      const userDoc = await userDocRef.get();
      
      if (!userDoc.exists) {
        documentData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        await userDocRef.set(documentData);
        console.log(`✅ [ensureUserDocument] Created user document for ${uid}`);
      } else {
        await userDocRef.update(documentData);
        console.log(`✅ [ensureUserDocument] Updated user document for ${uid}`);
      }

      return {
        success: true,
        message: 'User document ensured in Firestore',
        uid: uid
      };

    } catch (error) {
      console.error('Error ensuring user document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to ensure user document'
      };
    }
  }
);

/**
 * Update user custom claims with unified data model
 */
export const updateUserClaims = onCall(
  {
    cors: true,
  },
  async (request) => {
  try {
    const { uid, claims } = request.data;
    
    if (!uid || !claims) {
      throw new Error('User ID and claims are required');
    }

    // Get current user record
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};

    // Merge with new claims
    // IMPORTANT: If pagePermissions is provided, merge it properly instead of replacing
    let updatedClaims = {
      ...currentClaims,
      ...claims,
      lastUpdated: Date.now()
    };
    
    // If pagePermissions are being updated, merge them properly
    if (claims.pagePermissions && typeof claims.pagePermissions === 'object') {
      updatedClaims.pagePermissions = {
        ...(currentClaims.pagePermissions || {}),
        ...claims.pagePermissions
      };
    }
    
    // Also ensure individual page permission claims (page:{pageId}:read, page:{pageId}:write) are set
    // These are used for fast permission checks
    Object.keys(claims).forEach(key => {
      if (key.startsWith('page:') && (key.endsWith(':read') || key.endsWith(':write'))) {
        updatedClaims[key] = claims[key];
      }
    });
    
    // LONG-TERM FIX: Automatically add full pagePermissions for Clip Show Pro admin users
    // if they don't already have any pagePermissions set
    const permissionsAdded = await autoAddAdminPagePermissions(uid, updatedClaims);
    if (permissionsAdded) {
      // Re-fetch claims to get the updated pagePermissions
      const updatedUserRecord = await auth.getUser(uid);
      updatedClaims.pagePermissions = updatedUserRecord.customClaims?.pagePermissions || updatedClaims.pagePermissions;
      updatedClaims.permissionsUpdatedAt = Date.now();
    }

    // Check if claims exceed 1000 character limit
    const claimsStr = JSON.stringify(updatedClaims);
    if (claimsStr.length > 1000) {
      console.warn(`⚠️ Claims exceed 1000 char limit (${claimsStr.length} chars), optimizing...`);
      
      // Optimize by keeping only essential claims
      // IMPORTANT: Must preserve subscriptionAddOns for access checks
      updatedClaims = {
        // Essential identity
        role: updatedClaims.role,
        organizationId: updatedClaims.organizationId,
        
        // Essential Clip Show Pro flags (required for access check)
        // Preserve subscriptionAddOns if it exists
        ...(updatedClaims.subscriptionAddOns && {
          subscriptionAddOns: updatedClaims.subscriptionAddOns
        }),
        
        // Preserve permissions array if it exists (alternative access check)
        ...(updatedClaims.permissions && Array.isArray(updatedClaims.permissions) && updatedClaims.permissions.length > 0 && {
          permissions: updatedClaims.permissions
        }),
        
        // Page permissions (most important)
        pagePermissions: updatedClaims.pagePermissions,
        permissionsUpdatedAt: updatedClaims.permissionsUpdatedAt || Date.now()
      };
      
      const optimizedStr = JSON.stringify(updatedClaims);
      if (optimizedStr.length > 1000) {
        console.error(`❌ Optimized claims still exceed limit (${optimizedStr.length} chars)`);
        throw new Error(`Claims too large even after optimization: ${optimizedStr.length} characters`);
      }
      console.log(`✅ Optimized claims to ${optimizedStr.length} characters`);
    }

    // Update custom claims
    await auth.setCustomUserClaims(uid, updatedClaims);

    // Update Firestore user document
    await db.collection('users').doc(uid).update({
      ...claims,
      updatedAt: new Date()
    });

    return {
      success: true,
      message: 'User claims updated successfully'
    };

  } catch (error) {
    console.error('Error updating user claims:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update user claims'
    };
  }
});

/**
 * Sync user data between Firebase Auth and Firestore
 */
export const syncUserData = onCall(async (request) => {
  try {
    const { uid } = request.data;
    
    if (!uid) {
      throw new Error('User ID is required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};

    // Get user from Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Determine which data source is more recent
    const authLastUpdated = (customClaims as any).lastUpdated || 0;
    const firestoreLastUpdated = (userData as any).updatedAt?.toMillis() || 0;

    let syncData;
    let syncSource;

    if (authLastUpdated > firestoreLastUpdated) {
      // Auth data is more recent, sync to Firestore
      syncData = {
        email: userRecord.email,
        displayName: userRecord.displayName,
        ...customClaims,
        updatedAt: new Date()
      };
      syncSource = 'auth';
    } else {
      // Firestore data is more recent, sync to Auth
      syncData = {
        ...userData,
        lastUpdated: Date.now()
      };
      syncSource = 'firestore';
    }

    // Update both sources
    await auth.setCustomUserClaims(uid, syncData);
    await db.collection('users').doc(uid).set(syncData, { merge: true });

    return {
      success: true,
      message: `User data synced from ${syncSource}`,
      syncSource
    };

  } catch (error) {
    console.error('Error syncing user data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync user data'
    };
  }
});

// ============================================================================
// UNIFIED LICENSE MANAGEMENT
// ============================================================================

/**
 * Validate user license for specific application
 */
export const validateLicense = onCall(async (request) => {
  try {
    const { uid, appType } = request.data;
    
    if (!uid || !appType) {
      throw new Error('User ID and app type are required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};

    let isValid = false;

    switch (appType) {
      case 'EDL_CONVERTER':
        isValid = Boolean(customClaims.isEDLConverter);
        break;
      case 'CALL_SHEET':
        isValid = Boolean(customClaims.isCallSheetUser);
        break;
      case 'PARSER_BRAIN':
        isValid = Boolean(customClaims.isParserBrainUser) || 
                  ['SUPERADMIN', 'ADMIN'].includes(customClaims.role);
        break;
      case 'DASHBOARD':
        isValid = Boolean(customClaims.organizationId) || 
                  Boolean(customClaims.isStandaloneUser);
        break;
      case 'LICENSING':
        isValid = true; // All authenticated users have licensing access
        break;
      default:
        isValid = false;
    }

    return {
      success: true,
      isValid,
      appType,
      licenseType: customClaims.licenseType || 'BASIC'
    };

  } catch (error) {
    console.error('Error validating license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate license'
    };
  }
});

/**
 * Grant application access to user
 */
export const grantAppAccess = onCall(async (request) => {
  try {
    const { uid, appType, granted } = request.data;
    
    if (!uid || !appType) {
      throw new Error('User ID and app type are required');
    }

    // Get current user record
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};

    // Update claims based on app type
    const updatedClaims = { ...currentClaims };
    
    switch (appType) {
      case 'EDL_CONVERTER':
        updatedClaims.isEDLConverter = Boolean(granted);
        break;
      case 'CALL_SHEET':
        updatedClaims.isCallSheetUser = Boolean(granted);
        break;
      case 'PARSER_BRAIN':
        updatedClaims.isParserBrainUser = Boolean(granted);
        break;
      case 'STANDALONE':
        updatedClaims.isStandaloneUser = Boolean(granted);
        break;
    }

    updatedClaims.lastUpdated = Date.now();

    // Update custom claims
    await auth.setCustomUserClaims(uid, updatedClaims);

    // Update Firestore user document
    await db.collection('users').doc(uid).update({
      [appType.toLowerCase()]: Boolean(granted),
      updatedAt: new Date()
    });

    return {
      success: true,
      message: `App access ${granted ? 'granted' : 'revoked'} for ${appType}`
    };

  } catch (error) {
    console.error('Error granting app access:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to grant app access'
    };
  }
});

// ============================================================================
// UNIFIED ORGANIZATION MANAGEMENT
// ============================================================================

/**
 * Get user's organization data
 */
export const getUserOrganization = onCall(async (request) => {
  try {
    const { uid } = request.data;
    
    if (!uid) {
      throw new Error('User ID is required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};
    const organizationId = customClaims.organizationId;

    if (!organizationId) {
      return {
        success: true,
        organization: null,
        message: 'User has no organization'
      };
    }

    // Get organization data
    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    
    if (!orgDoc.exists) {
      return {
        success: true,
        organization: null,
        message: 'Organization not found'
      };
    }

    const orgData = orgDoc.data();

    // Get team members for this organization
    const teamMembersQuery = await db.collection('teamMembers')
      .where('organizationId', '==', organizationId)
      .get();

    const teamMembers = teamMembersQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      organization: {
        id: organizationId,
        ...orgData,
        teamMembers
      }
    };

  } catch (error) {
    console.error('Error getting user organization:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get organization'
    };
  }
});

/**
 * Update user's organization
 */
export const updateUserOrganization = onCall(async (request) => {
  try {
    const { uid, organizationId } = request.data;
    
    if (!uid || !organizationId) {
      throw new Error('User ID and organization ID are required');
    }

    // Verify organization exists
    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    if (!orgDoc.exists) {
      throw new Error('Organization not found');
    }

    // Get current user record
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};

    // Update claims
    const updatedClaims = {
      ...currentClaims,
      organizationId,
      lastUpdated: Date.now()
    };

    // Update custom claims
    await auth.setCustomUserClaims(uid, updatedClaims);

    // Update Firestore user document
    await db.collection('users').doc(uid).update({
      organizationId,
      updatedAt: new Date()
    });

    return {
      success: true,
      message: 'User organization updated successfully'
    };

  } catch (error) {
    console.error('Error updating user organization:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update organization'
    };
  }
});

// ============================================================================
// UNIFIED PROJECT MANAGEMENT
// ============================================================================

/**
 * Get user's accessible projects
 */
export const getUserProjects = onCall(async (request) => {
  try {
    const { uid } = request.data;
    
    if (!uid) {
      throw new Error('User ID is required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};
    const organizationId = customClaims.organizationId;
    const projectAccess = customClaims.projectAccess || [];

    let projectsQuery;

    if (organizationId) {
      // Get projects for user's organization
      projectsQuery = await db.collection('projects')
        .where('organizationId', '==', organizationId)
        .get();
    } else {
      // Get projects where user has specific access
      projectsQuery = await db.collection('projects')
        .where('assignedUsers', 'array-contains', uid)
        .get();
    }

    const projects = projectsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filter by project access if specified
    const accessibleProjects = projectAccess.length > 0 
      ? projects.filter(project => projectAccess.includes(project.id))
      : projects;

    return {
      success: true,
      projects: accessibleProjects,
      totalCount: accessibleProjects.length
    };

  } catch (error) {
    console.error('Error getting user projects:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get projects'
    };
  }
});

// ============================================================================
// UNIFIED COLLECTIONS DISCOVERY
// ============================================================================

/**
 * Discover collections with intelligent categorization
 */
export const discoverCollections = onCall(async (request) => {
  try {
    const { organizationId } = request.data;
    
    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    // Define collection categories
    const collectionCategories = {
      core: ['users', 'organizations', 'teamMembers'],
      projects: ['projects', 'sessions', 'timecards', 'inventoryItems', 'reports'],
      licensing: ['licenses', 'subscriptions', 'standaloneLicenses'],
      media: ['networkDeliveryBibles', 'edlFiles', 'edlFileMetadata', 'edlFileChunks'],
      callsheets: ['callsheetCallSheets', 'callsheetPersonnel', 'callsheetTemplates', 'callsheetPublishedCallSheets', 'callsheetLinks'],
      system: ['notifications', '_system']
    };

    // Get all collections
    const collections = await db.listCollections();
    const collectionNames = collections.map(col => col.id);

    // Categorize collections
    const categorizedCollections: Record<string, string[]> = {
      core: [],
      projects: [],
      licensing: [],
      media: [],
      callsheets: [],
      system: [],
      other: []
    };

    collectionNames.forEach(name => {
      let categorized = false;
      
      for (const [category, patterns] of Object.entries(collectionCategories)) {
        if (patterns.includes(name)) {
          categorizedCollections[category].push(name);
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categorizedCollections.other.push(name);
      }
    });

    return {
      success: true,
      collections: categorizedCollections,
      totalCollections: collectionNames.length,
      source: 'firebase-admin'
    };

  } catch (error) {
    console.error('Error discovering collections:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to discover collections'
    };
  }
});

/**
 * HTTP version of discover collections for API calls
 */
export const discoverCollectionsHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req: any, res: any): Promise<void> => {
    try {
      // Set CORS headers
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
      res.set('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId, includeMetadata = true, categorize = true } = req.body || req.query;
      
      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`🔍 [DISCOVER COLLECTIONS HTTP] Discovering collections for org: ${organizationId}`);

      // Define collection categories
      const collectionCategories = {
        core: ['users', 'organizations', 'teamMembers'],
        projects: ['projects', 'sessions', 'timecards', 'inventoryItems', 'reports'],
        licensing: ['licenses', 'subscriptions', 'standaloneLicenses'],
        media: ['networkDeliveryBibles', 'edlFiles', 'edlFileMetadata', 'edlFileChunks'],
        callsheets: ['callsheetCallSheets', 'callsheetPersonnel', 'callsheetTemplates', 'callsheetPublishedCallSheets', 'callsheetLinks'],
        system: ['notifications', '_system']
      };

      // Get all collections
      const collections = await db.listCollections();
      const collectionNames = collections.map(col => col.id);

      let result;
      
      if (categorize) {
        // Categorize collections
        const categorizedCollections: Record<string, string[]> = {
          core: [],
          projects: [],
          licensing: [],
          media: [],
          callsheets: [],
          system: [],
          other: []
        };

        collectionNames.forEach(name => {
          let categorized = false;
          
          for (const [category, patterns] of Object.entries(collectionCategories)) {
            if (patterns.includes(name)) {
              categorizedCollections[category].push(name);
              categorized = true;
              break;
            }
          }
          
          if (!categorized) {
            categorizedCollections.other.push(name);
          }
        });

        result = {
          collections: categorizedCollections,
          totalCollections: collectionNames.length,
          lastUpdated: new Date().toISOString(),
          source: 'firebase-admin'
        };
      } else {
        result = {
          collections: collectionNames,
          totalCollections: collectionNames.length,
          lastUpdated: new Date().toISOString(),
          source: 'firebase-admin'
        };
      }

      console.log(`✅ [DISCOVER COLLECTIONS HTTP] Found ${result.totalCollections} collections`);

      res.status(200).json({
        success: true,
        ...result
      });

    } catch (error: any) {
      console.error('❌ [DISCOVER COLLECTIONS HTTP] Error:', error);
      res.status(500).json(createErrorResponse('Failed to discover collections', error instanceof Error ? error.message : String(error)));
    }
  }
);

// ============================================================================
// UNIFIED CROSS-APP INTEGRATION
// ============================================================================

/**
 * Transfer authentication token between apps
 */
export const transferAuthToken = onCall(async (request) => {
  try {
    const { uid, targetApp } = request.data;
    
    if (!uid || !targetApp) {
      throw new Error('User ID and target app are required');
    }

    // Get user from Firebase Auth
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims || {};

    // Validate user has access to target app
    let hasAccess = false;
    
    switch (targetApp) {
      case 'edl-converter':
        hasAccess = Boolean(customClaims.isEDLConverter);
        break;
      case 'call-sheet':
        hasAccess = Boolean(customClaims.isCallSheetUser);
        break;
      case 'parser-brain':
        hasAccess = Boolean(customClaims.isParserBrainUser) || 
                    ['SUPERADMIN', 'ADMIN'].includes(customClaims.role);
        break;
      case 'dashboard':
        hasAccess = Boolean(customClaims.organizationId) || 
                    Boolean(customClaims.isStandaloneUser);
        break;
      case 'licensing':
        hasAccess = true; // All authenticated users have licensing access
        break;
      default:
        hasAccess = false;
    }

    if (!hasAccess) {
      throw new Error(`User does not have access to ${targetApp}`);
    }

    // Generate custom token for target app
    const customToken = await auth.createCustomToken(uid, {
      ...customClaims,
      targetApp,
      transferredAt: Date.now()
    });

    return {
      success: true,
      customToken,
      targetApp,
      expiresIn: 3600 // 1 hour
    };

  } catch (error) {
    console.error('Error transferring auth token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer auth token'
    };
  }
});

// ============================================================================
// UNIFIED SYSTEM UTILITIES
// ============================================================================

/**
 * Get system statistics
 */
export const getSystemStats = onCall(async (request) => {
  try {
    // Get user count
    const userList = await auth.listUsers(1000);
    const userCount = userList.users.length;

    // Get collection counts
    const collections = await db.listCollections();
    const collectionStats = {};

    for (const collection of collections) {
      const snapshot = await collection.limit(1000).get();
      collectionStats[collection.id] = snapshot.size;
    }

    return {
      success: true,
      stats: {
        totalUsers: userCount,
        totalCollections: collections.length,
        collectionStats,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error getting system stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get system stats'
    };
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check endpoint
 */
export const healthCheck = onRequest(async (req, res) => {
  try {
    // Check Firebase services
    await auth.listUsers(1);
    await db.collection('_system').doc('health').get();

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        auth: 'healthy',
        firestore: 'healthy'
      },
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});