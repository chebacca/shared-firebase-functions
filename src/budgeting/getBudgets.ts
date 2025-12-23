/**
 * Get Budgets Function
 * 
 * Retrieves all budgets for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

export const getBudgets = onCall(
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
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(callerId, organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          throw new Error('Permission denied: You do not have access to this organization');
        }
      }

      let query = db.collection('production_budgets')
        .where('organizationId', '==', organizationId);

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      query = query.orderBy('updatedAt', 'desc');

      const budgetsSnapshot = await query.get();
      const budgets: any[] = budgetsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load line items for each budget
      for (const budget of budgets) {
        const lineItemsSnapshot = await db.collection('budget_line_items')
          .where('budgetId', '==', budget.id)
          .get();
        budget.lineItems = lineItemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      return createSuccessResponse({
        budgets,
        count: budgets.length,
        organizationId,
        projectId
      }, 'Budgets retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET BUDGETS] Error:', error);
      return handleError(error, 'getBudgets');
    }
  }
);

export const getBudgetsHttp = onRequest(
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

      const { organizationId, projectId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      let query = db.collection('production_budgets')
        .where('organizationId', '==', organizationId);

      if (projectId) {
        query = query.where('projectId', '==', projectId);
      }

      query = query.orderBy('updatedAt', 'desc');

      const budgetsSnapshot = await query.get();
      const budgets: any[] = budgetsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Load line items for each budget
      for (const budget of budgets) {
        const lineItemsSnapshot = await db.collection('budget_line_items')
          .where('budgetId', '==', budget.id)
          .get();
        budget.lineItems = lineItemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      res.status(200).json(createSuccessResponse({
        budgets,
        count: budgets.length,
        organizationId,
        projectId
      }, 'Budgets retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET BUDGETS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getBudgetsHttp'));
    }
  }
);

