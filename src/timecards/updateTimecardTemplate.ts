/**
 * Update Timecard Template Function
 * 
 * Updates an existing timecard template
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const updateTimecardTemplate = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
      }

      const { templateId, updates, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!templateId) {
        throw new HttpsError('invalid-argument', 'Template ID is required');
      }

      if (!updates || Object.keys(updates).length === 0) {
        throw new HttpsError('invalid-argument', 'Updates are required');
      }

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      if (!hasAccess) {
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;
        if (!isAdmin) {
          console.warn(`🚨 [UPDATE TIMECARD TEMPLATE] Security violation: User ${userId} attempted to update template for org ${organizationId} without access`);
          throw new HttpsError('permission-denied', 'You do not have access to this organization');
        }
      }

      console.log(`⏰ [UPDATE TIMECARD TEMPLATE] Updating template ${templateId} for org: ${organizationId} by user: ${userId}`);

      // Get the template to verify it exists and belongs to the organization
      const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
      
      if (!templateDoc.exists) {
        throw new HttpsError('not-found', 'Template not found');
      }

      const templateData = templateDoc.data();
      if (templateData?.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Template does not belong to this organization');
      }

      // Update the template
      const updateData = {
        ...updates,
        updatedAt: new Date(),
        updatedBy: userId
      };

      await db.collection('timecardTemplates').doc(templateId).update(updateData);

      // Get the updated template
      const updatedDoc = await db.collection('timecardTemplates').doc(templateId).get();
      const updatedTemplate = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      };

      console.log(`⏰ [UPDATE TIMECARD TEMPLATE] Template updated successfully: ${templateId}`);

      return createSuccessResponse({
        template: updatedTemplate
      }, 'Timecard template updated successfully');

    } catch (error: any) {
      console.error('❌ [UPDATE TIMECARD TEMPLATE] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to update timecard template',
        error.stack || error.toString()
      );
    }
  }
);

// HTTP function
export const updateTimecardTemplateHttp = onRequest(
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

      const { templateId, updates, organizationId, userId } = req.body;

      if (!templateId) {
        res.status(400).json(createErrorResponse('Template ID is required'));
        return;
      }

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json(createErrorResponse('Updates are required'));
        return;
      }

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      if (!userId) {
        res.status(400).json(createErrorResponse('User ID is required'));
        return;
      }

      console.log(`⏰ [UPDATE TIMECARD TEMPLATE HTTP] Updating template ${templateId} for org: ${organizationId}`);

      // Get the template to verify it exists
      const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
      
      if (!templateDoc.exists) {
        res.status(404).json(createErrorResponse('Template not found'));
        return;
      }

      const templateData = templateDoc.data();
      if (templateData?.organizationId !== organizationId) {
        res.status(403).json(createErrorResponse('Template does not belong to this organization'));
        return;
      }

      // Update the template
      const updateData = {
        ...updates,
        updatedAt: new Date(),
        updatedBy: userId
      };

      await db.collection('timecardTemplates').doc(templateId).update(updateData);

      // Get the updated template
      const updatedDoc = await db.collection('timecardTemplates').doc(templateId).get();
      const updatedTemplate = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      };

      console.log(`⏰ [UPDATE TIMECARD TEMPLATE HTTP] Template updated successfully: ${templateId}`);

      res.status(200).json(createSuccessResponse({
        template: updatedTemplate
      }, 'Timecard template updated successfully'));

    } catch (error: any) {
      console.error('❌ [UPDATE TIMECARD TEMPLATE HTTP] Error:', error);
      res.status(500).json(handleError(error, 'updateTimecardTemplateHttp'));
    }
  }
);
