/**
 * Get Extended Users Function
 * 
 * Retrieves users with resolved labor rules and rates for an organization
 * Resolves effective labor rule based on hierarchy: User > Template > Project > Organization
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../../shared/utils';

const db = getFirestore();

interface ResolvedUserData {
  id: string;
  email: string;
  displayName?: string;
  organizationId?: string;
  primaryUnionAffiliation?: string;
  effectiveLaborRuleId?: string | null;
  effectiveHourlyRate?: number | null;
  effectiveDayRate?: number | null;
  laborRuleSource?: 'user' | 'template' | 'project' | 'organization' | null;
  [key: string]: any; // Allow other ExtendedUser fields
}

/**
 * Resolve effective labor rule for a user
 * Hierarchy: User Override > Timecard Template > Project Default > Organization Default
 */
async function resolveEffectiveLaborRule(
  userId: string,
  organizationId: string,
  projectId?: string,
  templateId?: string
): Promise<{ laborRuleId: string | null; hourlyRate: number | null; dayRate: number | null; source: 'user' | 'template' | 'project' | 'organization' | null }> {
  try {
    // 1. Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { laborRuleId: null, hourlyRate: null, dayRate: null, source: null };
    }
    
    const userData = userDoc.data();
    const user = { id: userDoc.id, ...userData } as any;
    
    // 2. Check User Override (highest priority)
    if (user.laborRuleId) {
      const ruleDoc = await db.collection('labor_rules').doc(user.laborRuleId).get();
      if (ruleDoc.exists && ruleDoc.data()?.isActive) {
        return {
          laborRuleId: user.laborRuleId,
          hourlyRate: user.rates?.hourlyRate || null,
          dayRate: user.rates?.dayRate || null,
          source: 'user'
        };
      }
    }
    
    // 3. Check Timecard Template
    if (templateId) {
      const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
      if (templateDoc.exists) {
        const template = templateDoc.data();
        if (template?.laborRuleId) {
          const ruleDoc = await db.collection('labor_rules').doc(template.laborRuleId).get();
          if (ruleDoc.exists && ruleDoc.data()?.isActive) {
            return {
              laborRuleId: template.laborRuleId,
              hourlyRate: template.hourlyRate || user.rates?.hourlyRate || null,
              dayRate: user.rates?.dayRate || null,
              source: 'template'
            };
          }
        }
      }
    }
    
    // 4. Check Project Default
    if (projectId) {
      const projectDoc = await db.collection('projects').doc(projectId).get();
      if (projectDoc.exists) {
        const project = projectDoc.data();
        if (project?.defaultLaborRuleId) {
          const ruleDoc = await db.collection('labor_rules').doc(project.defaultLaborRuleId).get();
          if (ruleDoc.exists && ruleDoc.data()?.isActive) {
            return {
              laborRuleId: project.defaultLaborRuleId,
              hourlyRate: user.rates?.hourlyRate || null,
              dayRate: user.rates?.dayRate || null,
              source: 'project'
            };
          }
        }
      }
    }
    
    // 5. Organization Default - find rule based on user's primary union
    if (user.primaryUnionAffiliation) {
      const unionRulesQuery = await db.collection('labor_rules')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .where('appliesToUnions', 'array-contains', user.primaryUnionAffiliation)
        .limit(1)
        .get();
      
      if (!unionRulesQuery.empty) {
        const rule = unionRulesQuery.docs[0];
        return {
          laborRuleId: rule.id,
          hourlyRate: user.rates?.hourlyRate || null,
          dayRate: user.rates?.dayRate || null,
          source: 'organization'
        };
      }
    }
    
    // 6. Fallback: Get first active rule for organization
    const orgRulesQuery = await db.collection('labor_rules')
      .where('organizationId', '==', organizationId)
      .where('isActive', '==', true)
      .limit(1)
      .get();
    
    if (!orgRulesQuery.empty) {
      const rule = orgRulesQuery.docs[0];
      return {
        laborRuleId: rule.id,
        hourlyRate: user.rates?.hourlyRate || null,
        dayRate: user.rates?.dayRate || null,
        source: 'organization'
      };
    }
    
    // No rule found
    return {
      laborRuleId: null,
      hourlyRate: user.rates?.hourlyRate || null,
      dayRate: user.rates?.dayRate || null,
      source: null
    };
  } catch (error) {
    console.error('[getExtendedUsers] Error resolving labor rule:', error);
    return { laborRuleId: null, hourlyRate: null, dayRate: null, source: null };
  }
}

export const getExtendedUsers = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { organizationId, projectId } = request.data;
      const callerId = request.auth.uid;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Security check
      const hasAccess = await import('../../shared/utils').then(m => m.validateOrganizationAccess(callerId, organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          throw new Error('Permission denied');
        }
      }

      // Get all users for the organization
      const usersQuery = await db.collection('users')
        .where('organizationId', '==', organizationId)
        .get();

      const resolvedUsers: ResolvedUserData[] = [];

      for (const userDoc of usersQuery.docs) {
        const userData = userDoc.data();
        const user = { id: userDoc.id, ...userData } as any;
        
        // Get user's assigned template if available
        let templateId: string | undefined;
        if (user.timecardTemplateId) {
          templateId = user.timecardTemplateId;
        } else {
          // Try to find template assignment
          const assignmentQuery = await db.collection('timecardAssignments')
            .where('userId', '==', user.id)
            .where('isActive', '==', true)
            .limit(1)
            .get();
          
          if (!assignmentQuery.empty) {
            templateId = assignmentQuery.docs[0].data().templateId;
          }
        }

        // Resolve effective labor rule
        const resolved = await resolveEffectiveLaborRule(
          user.id,
          organizationId,
          projectId,
          templateId
        );

        resolvedUsers.push({
          ...user,
          email: user.email,
          displayName: user.displayName || user.name,
          organizationId: user.organizationId,
          primaryUnionAffiliation: user.primaryUnionAffiliation,
          effectiveLaborRuleId: resolved.laborRuleId,
          effectiveHourlyRate: resolved.hourlyRate,
          effectiveDayRate: resolved.dayRate,
          laborRuleSource: resolved.source,
          // Include other ExtendedUser fields
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          position: user.position,
          department: user.department,
          unionAffiliations: user.unionAffiliations,
          laborRuleId: user.laborRuleId, // Original user override
          rates: user.rates
        });
      }

      return createSuccessResponse({
        users: resolvedUsers,
        count: resolvedUsers.length
      }, 'Extended users retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET EXTENDED USERS] Error:', error);
      return handleError(error, 'getExtendedUsers');
    }
  }
);

export const getExtendedUsersHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      setCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId, projectId } = req.body || req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      // Get all users for the organization
      const usersQuery = await db.collection('users')
        .where('organizationId', '==', organizationId)
        .get();

      const resolvedUsers: ResolvedUserData[] = [];

      for (const userDoc of usersQuery.docs) {
        const userData = userDoc.data();
        const user = { id: userDoc.id, ...userData } as any;
        
        // Get user's assigned template if available
        let templateId: string | undefined;
        if (user.timecardTemplateId) {
          templateId = user.timecardTemplateId;
        } else {
          // Try to find template assignment
          const assignmentQuery = await db.collection('timecardAssignments')
            .where('userId', '==', user.id)
            .where('isActive', '==', true)
            .limit(1)
            .get();
          
          if (!assignmentQuery.empty) {
            templateId = assignmentQuery.docs[0].data().templateId;
          }
        }

        // Resolve effective labor rule
        const resolved = await resolveEffectiveLaborRule(
          user.id,
          organizationId,
          projectId,
          templateId
        );

        resolvedUsers.push({
          ...user,
          email: user.email,
          displayName: user.displayName || user.name,
          organizationId: user.organizationId,
          primaryUnionAffiliation: user.primaryUnionAffiliation,
          effectiveLaborRuleId: resolved.laborRuleId,
          effectiveHourlyRate: resolved.hourlyRate,
          effectiveDayRate: resolved.dayRate,
          laborRuleSource: resolved.source,
          // Include other ExtendedUser fields
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          position: user.position,
          department: user.department,
          unionAffiliations: user.unionAffiliations,
          laborRuleId: user.laborRuleId,
          rates: user.rates
        });
      }

      res.status(200).json(createSuccessResponse({
        users: resolvedUsers,
        count: resolvedUsers.length
      }, 'Extended users retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET EXTENDED USERS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getExtendedUsersHttp'));
    }
  }
);

