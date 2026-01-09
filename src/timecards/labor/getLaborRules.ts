/**
 * Get Labor Rules Function
 * 
 * Firebase Function to fetch labor rules from Firestore
 * Supports organization-specific overrides
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../../shared/utils';

const db = getFirestore();

interface GetLaborRulesRequest {
  organizationId: string;
  unionId?: string;
  ruleId?: string;
}

/**
 * Get labor rules (Callable Function)
 */
export const getLaborRules = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { organizationId, unionId, ruleId }: GetLaborRulesRequest = request.data || {};

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      let rules: any[] = [];

      if (ruleId) {
        // Get specific rule
        const ruleDoc = await db.collection('labor_rules').doc(ruleId).get();
        if (ruleDoc.exists) {
          const ruleData = ruleDoc.data();
          if (ruleData && ruleData.organizationId === organizationId) {
            rules = [{
              id: ruleDoc.id,
              ...ruleData,
              effectiveDate: ruleData.effectiveDate?.toDate?.()?.toISOString() || ruleData.effectiveDate,
              expirationDate: ruleData.expirationDate?.toDate?.()?.toISOString() || ruleData.expirationDate,
              createdAt: ruleData.createdAt?.toDate?.()?.toISOString() || ruleData.createdAt,
              updatedAt: ruleData.updatedAt?.toDate?.()?.toISOString() || ruleData.updatedAt
            }];
          }
        }
      } else if (unionId) {
        // Get rule for specific union
        // First check union contracts
        const contractsQuery = db.collection('union_contracts')
          .where('organizationId', '==', organizationId)
          .where('unionId', '==', unionId)
          .where('isActive', '==', true)
          .limit(1);
        
        const contractsSnapshot = await contractsQuery.get();
        
        if (!contractsSnapshot.empty) {
          const contract = contractsSnapshot.docs[0].data();
          if (contract.laborRuleId) {
            const ruleDoc = await db.collection('labor_rules').doc(contract.laborRuleId).get();
            if (ruleDoc.exists) {
              const ruleData = ruleDoc.data();
              rules = [{
                id: ruleDoc.id,
                ...ruleData,
                effectiveDate: ruleData?.effectiveDate?.toDate?.()?.toISOString() || ruleData?.effectiveDate,
                expirationDate: ruleData?.expirationDate?.toDate?.()?.toISOString() || ruleData?.expirationDate,
                createdAt: ruleData?.createdAt?.toDate?.()?.toISOString() || ruleData?.createdAt,
                updatedAt: ruleData?.updatedAt?.toDate?.()?.toISOString() || ruleData?.updatedAt
              }];
            }
          }
        } else {
          // Fallback: find rule by union affiliation
          const rulesQuery = db.collection('labor_rules')
            .where('organizationId', '==', organizationId)
            .where('isActive', '==', true);
          
          const rulesSnapshot = await rulesQuery.get();
          const now = new Date();
          
          for (const doc of rulesSnapshot.docs) {
            const rule = doc.data();
            const effectiveDate = rule.effectiveDate?.toDate?.() || new Date(rule.effectiveDate);
            const expirationDate = rule.expirationDate ? 
              (rule.expirationDate?.toDate?.() || new Date(rule.expirationDate)) : null;
            
            // Check if rule is currently effective
            if (effectiveDate > now || (expirationDate && expirationDate < now)) {
              continue;
            }
            
            // Check if rule applies to this union
            if (rule.appliesToUnions && rule.appliesToUnions.includes(unionId)) {
              rules = [{
                id: doc.id,
                ...rule,
                effectiveDate: effectiveDate.toISOString(),
                expirationDate: expirationDate?.toISOString() || null,
                createdAt: rule.createdAt?.toDate?.()?.toISOString() || rule.createdAt,
                updatedAt: rule.updatedAt?.toDate?.()?.toISOString() || rule.updatedAt
              }];
              break;
            }
          }
        }
      } else {
        // Get all rules for organization
        const rulesQuery = db.collection('labor_rules')
          .where('organizationId', '==', organizationId)
          .where('isActive', '==', true);
        
        const rulesSnapshot = await rulesQuery.get();
        rules = rulesSnapshot.docs.map(doc => {
          const ruleData = doc.data();
          return {
            id: doc.id,
            ...ruleData,
            effectiveDate: ruleData.effectiveDate?.toDate?.()?.toISOString() || ruleData.effectiveDate,
            expirationDate: ruleData.expirationDate?.toDate?.()?.toISOString() || ruleData.expirationDate,
            createdAt: ruleData.createdAt?.toDate?.()?.toISOString() || ruleData.createdAt,
            updatedAt: ruleData.updatedAt?.toDate?.()?.toISOString() || ruleData.updatedAt
          };
        });
      }

      return createSuccessResponse(rules, 'Labor rules retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET LABOR RULES] Error:', error);
      return handleError(error, 'getLaborRules');
    }
  }
);

/**
 * Get labor rules (HTTP Function)
 */
export const getLaborRulesHttp = onRequest(
  {
    memory: '256MiB',
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

      const { organizationId, unionId, ruleId } = req.body || req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      let rules: any[] = [];

      if (ruleId) {
        // Get specific rule
        const ruleDoc = await db.collection('labor_rules').doc(ruleId).get();
        if (ruleDoc.exists) {
          const ruleData = ruleDoc.data();
          if (ruleData && ruleData.organizationId === organizationId) {
            rules = [{
              id: ruleDoc.id,
              ...ruleData,
              effectiveDate: ruleData.effectiveDate?.toDate?.()?.toISOString() || ruleData.effectiveDate,
              expirationDate: ruleData.expirationDate?.toDate?.()?.toISOString() || ruleData.expirationDate,
              createdAt: ruleData.createdAt?.toDate?.()?.toISOString() || ruleData.createdAt,
              updatedAt: ruleData.updatedAt?.toDate?.()?.toISOString() || ruleData.updatedAt
            }];
          }
        }
      } else if (unionId) {
        // Get rule for specific union
        const contractsQuery = db.collection('union_contracts')
          .where('organizationId', '==', organizationId)
          .where('unionId', '==', unionId)
          .where('isActive', '==', true)
          .limit(1);
        
        const contractsSnapshot = await contractsQuery.get();
        
        if (!contractsSnapshot.empty) {
          const contract = contractsSnapshot.docs[0].data();
          if (contract.laborRuleId) {
            const ruleDoc = await db.collection('labor_rules').doc(contract.laborRuleId).get();
            if (ruleDoc.exists) {
              const ruleData = ruleDoc.data();
              rules = [{
                id: ruleDoc.id,
                ...ruleData,
                effectiveDate: ruleData?.effectiveDate?.toDate?.()?.toISOString() || ruleData?.effectiveDate,
                expirationDate: ruleData?.expirationDate?.toDate?.()?.toISOString() || ruleData?.expirationDate,
                createdAt: ruleData?.createdAt?.toDate?.()?.toISOString() || ruleData?.createdAt,
                updatedAt: ruleData?.updatedAt?.toDate?.()?.toISOString() || ruleData?.updatedAt
              }];
            }
          }
        } else {
          // Fallback: find rule by union affiliation
          const rulesQuery = db.collection('labor_rules')
            .where('organizationId', '==', organizationId)
            .where('isActive', '==', true);
          
          const rulesSnapshot = await rulesQuery.get();
          const now = new Date();
          
          for (const doc of rulesSnapshot.docs) {
            const rule = doc.data();
            const effectiveDate = rule.effectiveDate?.toDate?.() || new Date(rule.effectiveDate);
            const expirationDate = rule.expirationDate ? 
              (rule.expirationDate?.toDate?.() || new Date(rule.expirationDate)) : null;
            
            if (effectiveDate > now || (expirationDate && expirationDate < now)) {
              continue;
            }
            
            if (rule.appliesToUnions && rule.appliesToUnions.includes(unionId)) {
              rules = [{
                id: doc.id,
                ...rule,
                effectiveDate: effectiveDate.toISOString(),
                expirationDate: expirationDate?.toISOString() || null,
                createdAt: rule.createdAt?.toDate?.()?.toISOString() || rule.createdAt,
                updatedAt: rule.updatedAt?.toDate?.()?.toISOString() || rule.updatedAt
              }];
              break;
            }
          }
        }
      } else {
        // Get all rules for organization
        const rulesQuery = db.collection('labor_rules')
          .where('organizationId', '==', organizationId)
          .where('isActive', '==', true);
        
        const rulesSnapshot = await rulesQuery.get();
        rules = rulesSnapshot.docs.map(doc => {
          const ruleData = doc.data();
          return {
            id: doc.id,
            ...ruleData,
            effectiveDate: ruleData.effectiveDate?.toDate?.()?.toISOString() || ruleData.effectiveDate,
            expirationDate: ruleData.expirationDate?.toDate?.()?.toISOString() || ruleData.expirationDate,
            createdAt: ruleData.createdAt?.toDate?.()?.toISOString() || ruleData.createdAt,
            updatedAt: ruleData.updatedAt?.toDate?.()?.toISOString() || ruleData.updatedAt
          };
        });
      }

      res.status(200).json(createSuccessResponse(rules, 'Labor rules retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET LABOR RULES HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getLaborRulesHttp'));
    }
  }
);

