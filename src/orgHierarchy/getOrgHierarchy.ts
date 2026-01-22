/**
 * Get Org Hierarchy Function
 * 
 * Retrieves the complete organizational hierarchy tree for an organization
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';
import type { OrgHierarchyTree, OrgHierarchyNode } from 'shared-firebase-types';

const db = getFirestore();

export const getOrgHierarchy = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId: providedOrgId } = request.data;
      const userId = request.auth?.uid;

      if (!userId) {
        throw new Error('Authentication required');
      }

      // Get user's organization
      const userRecord = await getAuth().getUser(userId);
      const userOrgId = userRecord.customClaims?.organizationId as string;

      // Use provided orgId or user's orgId
      const organizationId = providedOrgId || userOrgId;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Verify user has access to this organization
      if (providedOrgId && providedOrgId !== userOrgId) {
        throw new Error('Access denied: Cannot access other organization');
      }

      console.log(`⏰ [GET ORG HIERARCHY] Getting org hierarchy for: ${organizationId}`);

      // Get all team members
      const teamMembersSnapshot = await db.collection('teamMembers')
        .where('organizationId', '==', organizationId)
        .get();

      if (teamMembersSnapshot.empty) {
        return createSuccessResponse<OrgHierarchyTree>({
          rootNodes: [],
          totalMembers: 0,
          totalRelationships: 0,
          departments: []
        }, 'No team members found');
      }

      // Get all org hierarchy relationships
      const relationshipsSnapshot = await db.collection('orgHierarchy')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      // Build maps for quick lookup
      const teamMemberMap = new Map<string, any>();
      const relationshipMap = new Map<string, string>(); // employeeId -> managerId
      const childrenMap = new Map<string, string[]>(); // managerId -> employeeIds[]

      teamMembersSnapshot.forEach(doc => {
        const data = doc.data();
        teamMemberMap.set(doc.id, { id: doc.id, ...data });
      });

      relationshipsSnapshot.forEach(doc => {
        const data = doc.data();
        const employeeId = data.employeeId;
        const managerId = data.managerId;

        if (employeeId && managerId) {
          relationshipMap.set(employeeId, managerId);
          
          if (!childrenMap.has(managerId)) {
            childrenMap.set(managerId, []);
          }
          childrenMap.get(managerId)!.push(employeeId);
        }
      });

      // Build tree structure
      const nodeMap = new Map<string, OrgHierarchyNode>();
      const rootNodes: OrgHierarchyNode[] = [];

      // Create all nodes
      teamMemberMap.forEach((member, memberId) => {
        const name = member.name || 
          `${member.firstName || ''} ${member.lastName || ''}`.trim() || 
          member.email?.split('@')[0] || 
          'Unknown';

        const node: OrgHierarchyNode = {
          id: memberId,
          name: name,
          email: member.email,
          role: member.role || member.dashboardRole || member.orgRole || 'MEMBER',
          position: member.position,
          department: member.department,
          children: [],
          metadata: {
            status: member.status,
            phone: member.phone,
            joinedAt: member.joinedAt || member.createdAt
          }
        };

        nodeMap.set(memberId, node);
      });

      // Build parent-child relationships
      relationshipMap.forEach((managerId, employeeId) => {
        const employeeNode = nodeMap.get(employeeId);
        const managerNode = nodeMap.get(managerId);

        if (employeeNode && managerNode) {
          if (!managerNode.children) {
            managerNode.children = [];
          }
          managerNode.children.push(employeeNode);
        }
      });

      // Find root nodes (nodes without managers)
      nodeMap.forEach((node, nodeId) => {
        if (!relationshipMap.has(nodeId)) {
          rootNodes.push(node);
        }
      });

      // Sort nodes by role hierarchy
      const roleOrder: Record<string, number> = {
        'OWNER': 1,
        'ADMIN': 2,
        'MANAGER': 3,
        'SUPERVISOR': 4,
        'COORDINATOR': 5,
        'MEMBER': 6,
        'VIEWER': 7
      };

      const sortNodes = (nodes: OrgHierarchyNode[]): OrgHierarchyNode[] => {
        return nodes
          .map(node => ({
            ...node,
            children: node.children ? sortNodes(node.children) : undefined
          }))
          .sort((a, b) => {
            const aOrder = roleOrder[a.role || 'MEMBER'] || 99;
            const bOrder = roleOrder[b.role || 'MEMBER'] || 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.name.localeCompare(b.name);
          });
      };

      const sortedRootNodes = sortNodes(rootNodes);

      // Get unique departments
      const departments = Array.from(new Set(
        Array.from(teamMemberMap.values())
          .map(m => m.department)
          .filter(Boolean)
      ));

      const hierarchyTree: OrgHierarchyTree = {
        rootNodes: sortedRootNodes,
        totalMembers: teamMemberMap.size,
        totalRelationships: relationshipsSnapshot.size,
        departments: departments as string[]
      };

      console.log(`✅ [GET ORG HIERARCHY] Built tree with ${sortedRootNodes.length} root nodes, ${teamMemberMap.size} total members`);

      return createSuccessResponse(hierarchyTree, 'Organizational hierarchy retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET ORG HIERARCHY] Error:', error);
      return handleError(error, 'getOrgHierarchy');
    }
  }
);
