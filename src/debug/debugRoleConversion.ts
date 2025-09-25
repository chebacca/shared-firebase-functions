/**
 * Debug Role Conversion Function
 * 
 * Debug utility for testing role conversion and hierarchy mapping
 */

import { onRequest } from 'firebase-functions/v2/https';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

export const debugRoleConversion = onRequest(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true
  },
  async (req, res) => {
    try {
      const { userRole, organizationRole, projectRole, testAll = false } = req.body;

      console.log(`🐛 [DEBUG ROLE] Testing role conversion for user: ${userRole}`);

      const debugResults = {
        input: {
          userRole,
          organizationRole,
          projectRole,
          testAll
        },
        roleConversion: {},
        hierarchyMapping: {},
        permissionMapping: {},
        testResults: [],
        timestamp: new Date()
      };

      if (testAll) {
        // Test all possible role combinations
        const allUserRoles = ['SUPERADMIN', 'ADMIN', 'admin', 'owner', 'MANAGER', 'MEMBER', 'member', 'viewer', 'USER', 'GUEST'];
        const allOrgRoles = ['SUPERADMIN', 'ADMIN', 'admin', 'owner', 'MANAGER', 'MEMBER', 'member', 'viewer', 'USER', 'GUEST'];
        const allProjectRoles = ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'];

        for (const userR of allUserRoles) {
          for (const orgR of allOrgRoles) {
            const availableRoles = getAvailableRolesForUser(userR, orgR);
            const effectiveRole = orgR || userR;
            
            debugResults.testResults.push({
              userRole: userR,
              organizationRole: orgR,
              effectiveRole,
              availableProjectRoles: availableRoles,
              availableRolesCount: availableRoles.length
            });
          }
        }
      } else {
        // Test specific role conversion
        if (userRole) {
          const availableRoles = getAvailableRolesForUser(userRole, organizationRole);
          const effectiveRole = organizationRole || userRole;
          
          debugResults.roleConversion = {
            userRole,
            organizationRole,
            effectiveRole,
            availableProjectRoles: availableRoles,
            availableRolesCount: availableRoles.length
          };

          // Test hierarchy mapping
          const hierarchyMapping: Record<string, number> = {};
          availableRoles.forEach(role => {
            hierarchyMapping[role] = getRoleHierarchy(role);
          });
          debugResults.hierarchyMapping = hierarchyMapping;

          // Test permission mapping
          const permissionMapping: Record<string, string[]> = {};
          availableRoles.forEach(role => {
            permissionMapping[role] = getRolePermissions(role);
          });
          debugResults.permissionMapping = permissionMapping;
        }
      }

      console.log(`🐛 [DEBUG ROLE] Role conversion debug completed`);

      return res.status(200).json(createSuccessResponse(debugResults, 'Role conversion debug completed successfully'));

    } catch (error: any) {
      console.error('❌ [DEBUG ROLE] Error:', error);
      return res.status(500).json(handleError(error, 'debugRoleConversion'));
    }
  }
);

function getAvailableRolesForUser(userRole: string, organizationRole?: string): string[] {
  // Role conversion mapping based on organization role
  const roleConversionMap: Record<string, string[]> = {
    'SUPERADMIN': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'ADMIN': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'admin': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'owner': ['PRODUCER', 'DIRECTOR', 'POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'MANAGER': ['POST_PRODUCER', 'POST_COORDINATOR', 'EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'MEMBER': ['EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'member': ['EDITOR', 'ASSISTANT_EDITOR', 'PRODUCTION_ASSISTANT', 'POST_PA', 'GUEST'],
    'viewer': ['GUEST'],
    'USER': ['GUEST'],
    'GUEST': ['GUEST']
  };

  // Use organization role if provided, otherwise use user role
  const effectiveRole = organizationRole || userRole;
  return roleConversionMap[effectiveRole] || ['GUEST'];
}

function getRoleHierarchy(role: string): number {
  const roleHierarchy: Record<string, number> = {
    'PRODUCER': 80,
    'DIRECTOR': 80,
    'POST_PRODUCER': 70,
    'POST_COORDINATOR': 70,
    'EDITOR': 60,
    'ASSISTANT_EDITOR': 55,
    'PRODUCTION_ASSISTANT': 40,
    'POST_PA': 35,
    'GUEST': 10
  };
  
  return roleHierarchy[role] || 30;
}

function getRolePermissions(role: string): string[] {
  const rolePermissions: Record<string, string[]> = {
    'PRODUCER': ['manage:project', 'assign:tasks', 'view:all', 'edit:all', 'delete:own'],
    'DIRECTOR': ['manage:project', 'assign:tasks', 'view:all', 'edit:all', 'delete:own'],
    'POST_PRODUCER': ['manage:project', 'view:all', 'edit:all', 'delete:own'],
    'POST_COORDINATOR': ['coordinate:project', 'view:all', 'edit:assigned', 'delete:own'],
    'EDITOR': ['edit:project', 'view:all', 'delete:own'],
    'ASSISTANT_EDITOR': ['edit:assigned', 'view:all', 'delete:own'],
    'PRODUCTION_ASSISTANT': ['view:assigned', 'edit:own'],
    'POST_PA': ['view:assigned', 'edit:own'],
    'GUEST': ['view:project']
  };
  
  return rolePermissions[role] || ['view:project'];
}
