/**
 * Project Permissions Helper Functions
 * 
 * Provides permission checking utilities for project resource management
 */

import * as admin from 'firebase-admin';
import { db, getUserOrganizationId } from './utils';

/**
 * Check if user is an organization admin
 */
export async function isOrgAdmin(
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return false;
    }

    const userData = userDoc.data();
    
    // Check if user belongs to the organization
    if (userData?.organizationId !== organizationId) {
      return false;
    }

    // Check role in users collection
    const role = userData?.role || '';
    const isAdminRole = ['OWNER', 'ADMIN', 'SUPERADMIN', 'SUPER_ADMIN'].includes(role);
    
    if (isAdminRole) {
      return true;
    }

    // Check teamMembers collection for admin role
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!teamMemberQuery.empty) {
      const teamMemberData = teamMemberQuery.docs[0].data();
      const teamRole = teamMemberData?.role || '';
      const hierarchy = teamMemberData?.hierarchy || 0;
      
      return ['OWNER', 'ADMIN', 'SUPERADMIN', 'SUPER_ADMIN'].includes(teamRole) || hierarchy >= 90;
    }

    return false;
  } catch (error) {
    console.error('Error checking org admin status:', error);
    return false;
  }
}

/**
 * Check if user is a project admin
 */
export async function isProjectAdmin(
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    // Get project document
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return false;
    }

    const projectData = projectDoc.data();
    const organizationId = projectData?.organizationId;

    if (!organizationId) {
      return false;
    }

    // First check if user is org admin (org admins can manage all projects)
    const isAdmin = await isOrgAdmin(userId, organizationId);
    if (isAdmin) {
      return true;
    }

    // Check if user is project owner
    if (projectData?.ownerId === userId || projectData?.createdBy === userId) {
      return true;
    }

    // Check teamMembers for project-specific admin role
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!teamMemberQuery.empty) {
      const teamMemberData = teamMemberQuery.docs[0].data();
      const projectAssignments = teamMemberData?.projectAssignments || {};
      const projectAssignment = projectAssignments[projectId];

      if (projectAssignment) {
        // Check project-specific hierarchy (>= 70 is project admin level)
        const projectHierarchy = projectAssignment.hierarchy || 0;
        const projectRole = projectAssignment.role || '';
        
        return projectHierarchy >= 70 || 
               ['PROJECT_ADMIN', 'PROJECT_MANAGER', 'OWNER'].includes(projectRole);
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking project admin status:', error);
    return false;
  }
}

/**
 * Check if user can assign resources to a project
 */
export async function canAssignResourcesToProject(
  userId: string,
  projectId: string
): Promise<boolean> {
  // Org admins and project admins can assign resources
  const projectDoc = await db.collection('projects').doc(projectId).get();
  if (!projectDoc.exists) {
    return false;
  }

  const projectData = projectDoc.data();
  const organizationId = projectData?.organizationId;

  if (!organizationId) {
    return false;
  }

  // Check if user is org admin
  const isAdmin = await isOrgAdmin(userId, organizationId);
  if (isAdmin) {
    return true;
  }

  // Check if user is project admin
  return await isProjectAdmin(userId, projectId);
}

/**
 * Check if user can checkout inventory to a project
 */
export async function canCheckoutInventory(
  userId: string,
  inventoryItemId: string,
  projectId: string
): Promise<boolean> {
  // Same permissions as assigning resources
  return await canAssignResourcesToProject(userId, projectId);
}

/**
 * Check if user is a member of a project
 */
export async function isProjectMember(
  userId: string,
  projectId: string
): Promise<boolean> {
  try {
    const projectDoc = await db.collection('projects').doc(projectId).get();
    if (!projectDoc.exists) {
      return false;
    }

    const projectData = projectDoc.data();
    const organizationId = projectData?.organizationId;

    if (!organizationId) {
      return false;
    }

    // Check if user belongs to organization
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.organizationId === organizationId) {
        // For global projects, all org members have access
        if (projectData?.scope === 'GLOBAL' || projectData?.applicationType === 'GLOBAL') {
          return true;
        }
      }
    }

    // Check teamMembers for project assignment
    const teamMemberQuery = await db.collection('teamMembers')
      .where('userId', '==', userId)
      .where('organizationId', '==', organizationId)
      .limit(1)
      .get();

    if (!teamMemberQuery.empty) {
      const teamMemberData = teamMemberQuery.docs[0].data();
      const projectAssignments = teamMemberData?.projectAssignments || {};
      
      // For global projects, all org team members have access
      if (projectData?.scope === 'GLOBAL' || projectData?.applicationType === 'GLOBAL') {
        return true;
      }

      // For standalone projects, check specific assignment
      return projectAssignments[projectId] != null;
    }

    return false;
  } catch (error) {
    console.error('Error checking project membership:', error);
    return false;
  }
}

