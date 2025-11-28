/**
 * Get Timecard Templates Function
 * 
 * Retrieves timecard templates for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getTimecardTemplates = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    // Allow unauthenticated access for testing
    // Skip authentication check for now
    try {
      const { organizationId } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET TIMECARD TEMPLATES] Getting templates for org: ${organizationId}`);

      const templatesQuery = await db.collection('timecardTemplates')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      const templates = templatesQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET TIMECARD TEMPLATES] Found ${templates.length} templates`);

      return createSuccessResponse({
        templates,
        count: templates.length,
        organizationId
      }, 'Timecard templates retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD TEMPLATES] Error:', error);
      return handleError(error, 'getTimecardTemplates');
    }
  }
);

// HTTP function
export const getTimecardTemplatesHttp = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    try {
      // Set CORS headers
      setCorsHeaders(req, res);
      
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      const { organizationId } = req.query;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`⏰ [GET TIMECARD TEMPLATES HTTP] Getting templates for org: ${organizationId}`);

      const templatesQuery = await db.collection('timecardTemplates')
        .where('organizationId', '==', organizationId)
        .get();

      const templates = templatesQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter((template: any) => template.isActive === true).sort((a: any, b: any) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return bTime.getTime() - aTime.getTime();
      });

      console.log(`⏰ [GET TIMECARD TEMPLATES HTTP] Found ${templates.length} templates`);

      res.status(200).json(createSuccessResponse({
        templates,
        count: templates.length,
        organizationId
      }, 'Timecard templates retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET TIMECARD TEMPLATES HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getTimecardTemplatesHttp'));
    }
  }
);
