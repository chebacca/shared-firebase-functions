/**
 * Delete Timecard Template Function
 * 
 * Deletes (soft deletes) a timecard template
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const deleteTimecardTemplate = onCall(
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

      const { templateId, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!templateId) {
        throw new HttpsError('invalid-argument', 'Template ID is required');
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
          console.warn(`🚨 [DELETE TIMECARD TEMPLATE] Security violation: User ${userId} attempted to delete template for org ${organizationId} without access`);
          throw new HttpsError('permission-denied', 'You do not have access to this organization');
        }
      }

      console.log(`⏰ [DELETE TIMECARD TEMPLATE] Deleting template ${templateId} for org: ${organizationId} by user: ${userId}`);

      // Get the template to verify it exists and belongs to the organization
      const templateDoc = await db.collection('timecardTemplates').doc(templateId).get();
      
      if (!templateDoc.exists) {
        throw new HttpsError('not-found', 'Template not found');
      }

      const templateData = templateDoc.data();
      if (templateData?.organizationId !== organizationId) {
        throw new HttpsError('permission-denied', 'Template does not belong to this organization');
      }

      // Soft delete: Set isActive to false instead of actually deleting
      await db.collection('timecardTemplates').doc(templateId).update({
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId
      });

      console.log(`⏰ [DELETE TIMECARD TEMPLATE] Template soft-deleted successfully: ${templateId}`);

      return createSuccessResponse({
        templateId,
        deleted: true
      }, 'Timecard template deleted successfully');

    } catch (error: any) {
      console.error('❌ [DELETE TIMECARD TEMPLATE] Error:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        error.message || 'Failed to delete timecard template',
        error.stack || error.toString()
      );
    }
  }
);

// HTTP function
export const deleteTimecardTemplateHttp = onRequest(
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

      const { templateId, organizationId, userId } = req.body;

      if (!templateId) {
        res.status(400).json(createErrorResponse('Template ID is required'));
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

      console.log(`⏰ [DELETE TIMECARD TEMPLATE HTTP] Deleting template ${templateId} for org: ${organizationId}`);

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

      // Soft delete: Set isActive to false instead of actually deleting
      await db.collection('timecardTemplates').doc(templateId).update({
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId
      });

      console.log(`⏰ [DELETE TIMECARD TEMPLATE HTTP] Template soft-deleted successfully: ${templateId}`);

      res.status(200).json(createSuccessResponse({
        templateId,
        deleted: true
      }, 'Timecard template deleted successfully'));

    } catch (error: any) {
      console.error('❌ [DELETE TIMECARD TEMPLATE HTTP] Error:', error);
      res.status(500).json(handleError(error, 'deleteTimecardTemplateHttp'));
    }
  }
);
