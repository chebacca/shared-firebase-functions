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
      const { templateData, organizationId, userId } = request.data;

      if (!templateData) {
        throw new Error('Template data is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      if (!userId) {
        throw new Error('User ID is required');
      }

      console.log(`⏰ [CREATE TIMECARD TEMPLATE] Creating template for org: ${organizationId}`);

      const template = {
        ...templateData,
        organizationId,
        createdBy: userId,
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
