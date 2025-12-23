/**
 * Calculate Budget Variance Function
 * 
 * Calculates variance for a budget and its line items
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

export const calculateBudgetVariance = onCall(
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

      const { budgetId } = request.data;
      const callerId = request.auth.uid;

      if (!budgetId) {
        throw new Error('Budget ID is required');
      }

      // Get budget
      const budgetDoc = await db.collection('production_budgets').doc(budgetId).get();
      if (!budgetDoc.exists) {
        throw new Error('Budget not found');
      }

      const budgetData = budgetDoc.data();
      const budget: any = { id: budgetDoc.id, ...budgetData };

      // Security check
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(callerId, budget.organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          throw new Error('Permission denied: You do not have access to this budget');
        }
      }

      // Get line items
      const lineItemsSnapshot = await db.collection('budget_line_items')
        .where('budgetId', '==', budgetId)
        .get();

      const lineItems = lineItemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate variances
      const variances = lineItems.map((item: any) => {
        const variance = (item.actualAmount || 0) - (item.budgetedAmount || 0);
        const variancePercentage = (item.budgetedAmount || 0) > 0 
          ? (variance / item.budgetedAmount) * 100 
          : 0;
        
        return {
          budgetId,
          lineItemId: item.id,
          category: item.category,
          phase: item.phase,
          budgetedAmount: item.budgetedAmount || 0,
          actualAmount: item.actualAmount || 0,
          committedAmount: item.committedAmount || 0,
          variance,
          variancePercentage,
          isOverBudget: variance > 0,
          alertLevel: variancePercentage > 10 ? 'critical' : variancePercentage > 5 ? 'warning' : 'none',
          calculatedAt: new Date().toISOString()
        };
      });

      // Calculate overall variance
      const totalBudgeted = lineItems.reduce((sum: number, item: any) => sum + (item.budgetedAmount || 0), 0);
      const totalActual = lineItems.reduce((sum: number, item: any) => sum + (item.actualAmount || 0), 0);
      const overallVariance = totalActual - totalBudgeted;
      const overallVariancePercentage = totalBudgeted > 0 ? (overallVariance / totalBudgeted) * 100 : 0;

      return createSuccessResponse({
        variances,
        overall: {
          budgetedAmount: totalBudgeted,
          actualAmount: totalActual,
          variance: overallVariance,
          variancePercentage: overallVariancePercentage,
          isOverBudget: overallVariance > 0,
          alertLevel: overallVariancePercentage > 10 ? 'critical' : overallVariancePercentage > 5 ? 'warning' : 'none'
        },
        budgetId
      }, 'Variance calculated successfully');

    } catch (error: any) {
      console.error('❌ [CALCULATE BUDGET VARIANCE] Error:', error);
      return handleError(error, 'calculateBudgetVariance');
    }
  }
);

export const calculateBudgetVarianceHttp = onRequest(
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

      const { budgetId } = req.query;

      if (!budgetId) {
        res.status(400).json(createErrorResponse('Budget ID is required'));
        return;
      }

      // Get budget
      const budgetDoc = await db.collection('production_budgets').doc(budgetId as string).get();
      if (!budgetDoc.exists) {
        res.status(404).json(createErrorResponse('Budget not found'));
        return;
      }

      const budget = { id: budgetDoc.id, ...budgetDoc.data() };

      // Get line items
      const lineItemsSnapshot = await db.collection('budget_line_items')
        .where('budgetId', '==', budgetId)
        .get();

      const lineItems = lineItemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate variances
      const variances = lineItems.map((item: any) => {
        const variance = (item.actualAmount || 0) - (item.budgetedAmount || 0);
        const variancePercentage = (item.budgetedAmount || 0) > 0 
          ? (variance / item.budgetedAmount) * 100 
          : 0;
        
        return {
          budgetId,
          lineItemId: item.id,
          category: item.category,
          phase: item.phase,
          budgetedAmount: item.budgetedAmount || 0,
          actualAmount: item.actualAmount || 0,
          committedAmount: item.committedAmount || 0,
          variance,
          variancePercentage,
          isOverBudget: variance > 0,
          alertLevel: variancePercentage > 10 ? 'critical' : variancePercentage > 5 ? 'warning' : 'none',
          calculatedAt: new Date().toISOString()
        };
      });

      // Calculate overall variance
      const totalBudgeted = lineItems.reduce((sum: number, item: any) => sum + (item.budgetedAmount || 0), 0);
      const totalActual = lineItems.reduce((sum: number, item: any) => sum + (item.actualAmount || 0), 0);
      const overallVariance = totalActual - totalBudgeted;
      const overallVariancePercentage = totalBudgeted > 0 ? (overallVariance / totalBudgeted) * 100 : 0;

      res.status(200).json(createSuccessResponse({
        variances,
        overall: {
          budgetedAmount: totalBudgeted,
          actualAmount: totalActual,
          variance: overallVariance,
          variancePercentage: overallVariancePercentage,
          isOverBudget: overallVariance > 0,
          alertLevel: overallVariancePercentage > 10 ? 'critical' : overallVariancePercentage > 5 ? 'warning' : 'none'
        },
        budgetId
      }, 'Variance calculated successfully'));

    } catch (error: any) {
      console.error('❌ [CALCULATE BUDGET VARIANCE HTTP] Error:', error);
      res.status(500).json(handleError(error, 'calculateBudgetVarianceHttp'));
    }
  }
);

