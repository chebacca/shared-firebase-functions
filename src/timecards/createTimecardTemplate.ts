/**
 * Create Timecard Template Function
 * 
 * Creates a new timecard template
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const createTimecardTemplate = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      // Verify authentication
      if (!request.auth) {
        throw new Error('User must be authenticated');
      }

      const { templateData, organizationId } = request.data;
      const userId = request.auth.uid;

      if (!templateData) {
        throw new Error('Template data is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // 🔒 SECURITY CHECK: Verify user belongs to the organization
      // This prevents users from creating templates for organizations they don't belong to
      const hasAccess = await import('../shared/utils').then(m => m.validateOrganizationAccess(userId, organizationId));
      if (!hasAccess) {
        // Also check if user is admin/owner via custom claims as a fallback/bypass
        const token = request.auth.token;
        const isAdmin = token.role === 'ADMIN' || token.role === 'OWNER' || token.isAdmin === true;

        if (!isAdmin) {
          console.warn(`🚨 [CREATE TIMECARD TEMPLATE] Security violation: User ${userId} attempted to create template for org ${organizationId} without access`);
          throw new Error('Permission denied: You do not have access to this organization');
        }
      }

      console.log(`⏰ [CREATE TIMECARD TEMPLATE] Creating template for org: ${organizationId} by user: ${userId}`);

      const template = {
        ...templateData,
        organizationId,
        createdBy: userId, // 🔒 Trust auth.uid, not request body
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      const docRef = await db.collection('timecardTemplates').add(template);

      console.log(`⏰ [CREATE TIMECARD TEMPLATE] Template created: ${docRef.id}`);

      return createSuccessResponse({
        templateId: docRef.id,
        template: {
          id: docRef.id,
          ...template
        }
      }, 'Timecard template created successfully');

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD TEMPLATE] Error:', error);
      return handleError(error, 'createTimecardTemplate');
    }
  }
);

// HTTP function
export const createTimecardTemplateHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (req, res) => {
    try {
      const { templateData, organizationId, userId } = req.body;

      if (!templateData) {
        res.status(400).json(createErrorResponse('Template data is required'));
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

      console.log(`⏰ [CREATE TIMECARD TEMPLATE HTTP] Creating template for org: ${organizationId}`);

      const template = {
        ...templateData,
        organizationId,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
      };

      const docRef = await db.collection('timecardTemplates').add(template);

      console.log(`⏰ [CREATE TIMECARD TEMPLATE HTTP] Template created: ${docRef.id}`);

      res.status(201).json(createSuccessResponse({
        templateId: docRef.id,
        template: {
          id: docRef.id,
          ...template
        }
      }, 'Timecard template created successfully'));

    } catch (error: any) {
      console.error('❌ [CREATE TIMECARD TEMPLATE HTTP] Error:', error);
      res.status(500).json(handleError(error, 'createTimecardTemplateHttp'));
    }
  }
);
