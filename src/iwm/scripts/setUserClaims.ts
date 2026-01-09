/**
 * Set User Claims Script
 * 
 * This script sets custom claims for all Firebase Auth users based on their
 * organization membership in Firestore.
 * 
 * Usage:
 *   pnpm run build && node lib/scripts/setUserClaims.js
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  // Set project ID from environment or use default
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'backbone-logic';
  
  admin.initializeApp({
    projectId: projectId,
  });
  
  console.log(`🔥 Firebase Admin SDK initialized with project: ${projectId}`);
}

const db = admin.firestore();
const auth = admin.auth();

interface UserClaims {
  organizationId?: string;
  role?: string;
  teamMemberRole?: string;
  isAdmin?: boolean;
  superAdmin?: boolean;
  canAccessAdminPanel?: boolean;
  projectAssignments?: Record<string, string>;
  pagePermissions?: Record<string, { read: boolean; write: boolean }>;
  [key: string]: any; // Allow flat page permission claims
}

/**
 * Get organization ID for a user from Firestore
 */
async function getUserOrganization(userId: string, email: string): Promise<string | null> {
  try {
    // Method 1: Check teamMembers collection by userId field first (Firebase UID)
    const teamMembersByUserIdQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (!teamMembersByUserIdQuery.empty) {
      const teamMemberData = teamMembersByUserIdQuery.docs[0].data();
      if (teamMemberData?.organizationId) {
        console.log(`  ✅ Found organizationId in teamMembers collection (by userId): ${teamMemberData.organizationId}`);
        return teamMemberData.organizationId;
      }
    }

    // Method 2: Check teamMembers collection by email
    const teamMembersByEmailQuery = await db.collection('teamMembers')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!teamMembersByEmailQuery.empty) {
      const teamMemberData = teamMembersByEmailQuery.docs[0].data();
      if (teamMemberData?.organizationId) {
        console.log(`  ✅ Found organizationId in teamMembers collection (by email): ${teamMemberData.organizationId}`);
        return teamMemberData.organizationId;
      }
    }

    // Method 3: Check organizations collection where user is a member
    const orgsQuery = await db.collection('organizations')
      .where('members', 'array-contains', userId)
      .limit(1)
      .get();

    if (!orgsQuery.empty) {
      const orgId = orgsQuery.docs[0].id;
      console.log(`  ✅ Found organizationId in organizations collection: ${orgId}`);
      return orgId;
    }

    console.log(`  ⚠️ No organization found for user`);
    return null;
  } catch (error) {
    console.error(`  ❌ Error getting organization:`, error);
    return null;
  }
}

/**
 * Get user role from Firestore
 */
async function getUserRole(userId: string, email: string, organizationId: string): Promise<{ role?: string; teamMemberRole?: string; isAdmin?: boolean }> {
  try {
    // Check teamMembers collection by userId field first (Firebase UID)
    let teamMembersQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    // If not found by userId, try by email
    if (teamMembersQuery.empty) {
      teamMembersQuery = await db.collection('teamMembers')
        .where('email', '==', email)
        .where('organizationId', '==', organizationId)
        .limit(1)
        .get();
    }

    if (!teamMembersQuery.empty) {
      const teamMemberData = teamMembersQuery.docs[0].data();
      const role = teamMemberData?.role || 'TEAM_MEMBER';
      return {
        role: role,
        teamMemberRole: role,
        isAdmin: ['owner', 'admin', 'ADMIN', 'OWNER', 'SUPERADMIN', 'SUPER_ADMIN'].includes(role)
      };
    }

    return { role: 'TEAM_MEMBER', isAdmin: false };
  } catch (error) {
    console.error(`  ❌ Error getting user role:`, error);
    return { role: 'TEAM_MEMBER', isAdmin: false };
  }
}

/**
 * Get user project assignments
 */
async function getUserProjectAssignments(userId: string, organizationId: string): Promise<Record<string, string>> {
  try {
    const projectsQuery = await db.collection('projects')
      .where('organizationId', '==', organizationId)
      .where('members', 'array-contains', userId)
      .get();

    const assignments: Record<string, string> = {};
    projectsQuery.docs.forEach(doc => {
      assignments[doc.id] = 'member';
    });

    return assignments;
  } catch (error) {
    console.error(`  ❌ Error getting project assignments:`, error);
    return {};
  }
}

/**
 * Get user page permissions from userPagePermissions collection
 */
async function getUserPagePermissions(userId: string, organizationId: string): Promise<Record<string, { read: boolean; write: boolean }> | null> {
  try {
    // Try to get by userId
    const permDoc = await db.collection('userPagePermissions').doc(userId).get();
    
    if (permDoc.exists) {
      const permData = permDoc.data();
      if (permData && permData.organizationId === organizationId && permData.permissions) {
        // Convert permissions array to object
        const pagePerms: Record<string, { read: boolean; write: boolean }> = {};
        const flatPerms: Record<string, boolean> = {};
        
        if (Array.isArray(permData.permissions)) {
          permData.permissions.forEach((perm: any) => {
            if (perm.pageId) {
              pagePerms[perm.pageId] = {
                read: perm.read || false,
                write: perm.write || false,
              };
              // Also create flat format
              flatPerms[`page:${perm.pageId}:read`] = perm.read || false;
              flatPerms[`page:${perm.pageId}:write`] = perm.write || false;
            }
          });
        }
        
        return { ...pagePerms, ...flatPerms } as any;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`  ⚠️ Error getting page permissions:`, error);
    return null;
  }
}

/**
 * Set custom claims for a user
 */
async function setUserClaims(userId: string, email: string): Promise<void> {
  try {
    console.log(`\n👤 Processing user: ${email} (${userId})`);

    // Get organization ID
    const organizationId = await getUserOrganization(userId, email);
    
    if (!organizationId) {
      console.log(`  ⚠️ Skipping user - no organization found. Setting as standalone user.`);
      
      // Set minimal claims for standalone users
      const standaloneClaims: UserClaims = {
        organizationId: 'standalone',
        role: 'USER',
        isAdmin: false,
      };

      await auth.setCustomUserClaims(userId, standaloneClaims);
      console.log(`  ✅ Set standalone claims`);
      return;
    }

    // Get user role
    const roleInfo = await getUserRole(userId, email, organizationId);

    // Get project assignments
    const projectAssignments = await getUserProjectAssignments(userId, organizationId);

    // Get page permissions
    const pagePermissions = await getUserPagePermissions(userId, organizationId);

    // Build claims object
    const claims: UserClaims = {
      organizationId,
      role: roleInfo.role || 'USER',
      isAdmin: roleInfo.isAdmin || false,
      canAccessAdminPanel: roleInfo.isAdmin || false,
    };

    // Add teamMemberRole if available
    if (roleInfo.teamMemberRole) {
      claims.teamMemberRole = roleInfo.teamMemberRole;
    }

    // Add project assignments if any
    if (Object.keys(projectAssignments).length > 0) {
      claims.projectAssignments = projectAssignments;
    }

    // Add page permissions if available
    if (pagePermissions) {
      // Extract pagePermissions object (without flat format)
      const pagePermsObj: Record<string, { read: boolean; write: boolean }> = {};
      Object.keys(pagePermissions).forEach(key => {
        if (!key.startsWith('page:') && pagePermissions[key] && typeof pagePermissions[key] === 'object') {
          pagePermsObj[key] = pagePermissions[key] as { read: boolean; write: boolean };
        }
      });
      
      if (Object.keys(pagePermsObj).length > 0) {
        claims.pagePermissions = pagePermsObj;
      }
      
      // Add flat format permissions
      Object.keys(pagePermissions).forEach(key => {
        if (key.startsWith('page:') && (key.endsWith(':read') || key.endsWith(':write'))) {
          const permValue = pagePermissions[key];
          if (typeof permValue === 'object' && permValue !== null) {
            claims[key] = (permValue as any).read || (permValue as any).write || false;
          } else {
            claims[key] = Boolean(permValue);
          }
        }
      });
    }

    // Set superAdmin for specific emails or roles
    if (roleInfo.role === 'SUPERADMIN' || roleInfo.role === 'SUPER_ADMIN') {
      claims.superAdmin = true;
    }

    // Set custom claims
    await auth.setCustomUserClaims(userId, claims);

    console.log(`  ✅ Set claims:`, JSON.stringify(claims, null, 2));

  } catch (error) {
    console.error(`  ❌ Error setting claims for user ${email}:`, error);
  }
}

/**
 * Main function to process all users
 */
async function setAllUserClaims() {
  console.log('\n🚀 Starting user claims update process...\n');
  console.log('=' .repeat(60));

  try {
    // List all users
    let nextPageToken: string | undefined;
    let totalUsers = 0;
    let processedUsers = 0;
    let errorUsers = 0;

    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      
      for (const userRecord of listUsersResult.users) {
        totalUsers++;
        
        try {
          await setUserClaims(userRecord.uid, userRecord.email || 'no-email@example.com');
          processedUsers++;
        } catch (error) {
          errorUsers++;
          console.error(`❌ Failed to process user ${userRecord.email}:`, error);
        }
      }

      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ User claims update complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Successfully processed: ${processedUsers}`);
    console.log(`   Errors: ${errorUsers}`);
    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error in setAllUserClaims:', error);
    process.exit(1);
  }
}

/**
 * Set claims for a single user by email
 */
async function setClaimsForEmail(email: string) {
  console.log(`\n🎯 Setting claims for specific user: ${email}\n`);
  console.log('=' .repeat(60));

  try {
    const userRecord = await auth.getUserByEmail(email);
    await setUserClaims(userRecord.uid, email);
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Claims updated successfully!\n');
  } catch (error) {
    console.error(`\n❌ Error processing user ${email}:`, error);
    process.exit(1);
  }
}

// Run the script
const args = process.argv.slice(2);

if (args.length > 0 && args[0] === '--email' && args[1]) {
  // Set claims for specific user
  setClaimsForEmail(args[1])
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
} else {
  // Set claims for all users
  setAllUserClaims()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

