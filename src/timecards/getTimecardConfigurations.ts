/**
 * Get Timecard Configurations Function
 * 
 * Retrieves timecard configurations for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall, onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError, setCorsHeaders } from '../shared/utils';

const db = getFirestore();

// Firebase Callable function
export const getTimecardConfigurations = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { organizationId } = request.data;

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [GET TIMECARD CONFIGURATIONS] Getting configurations for org: ${organizationId}`);

      const configurationsQuery = await db.collection('timecardConfigurations')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();

      const configurations = configurationsQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log(`⏰ [GET TIMECARD CONFIGURATIONS] Found ${configurations.length} configurations`);

      return createSuccessResponse({
        configurations,
        count: configurations.length,
        organizationId
      }, 'Timecard configurations retrieved successfully');

    } catch (error: any) {
      console.error('❌ [GET TIMECARD CONFIGURATIONS] Error:', error);
      return handleError(error, 'getTimecardConfigurations');
    }
  }
);

// HTTP function
export const getTimecardConfigurationsHttp = onRequest(
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

      console.log(`⏰ [GET TIMECARD CONFIGURATIONS HTTP] Getting configurations for org: ${organizationId}`);

      const configurationsQuery = await db.collection('timecardConfigurations')
        .where('organizationId', '==', organizationId)
        .where('isActive', '==', true)
        .get();

      const configurations = configurationsQuery.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return bTime.getTime() - aTime.getTime();
      });

      console.log(`⏰ [GET TIMECARD CONFIGURATIONS HTTP] Found ${configurations.length} configurations`);

      res.status(200).json(createSuccessResponse({
        configurations,
        count: configurations.length,
        organizationId
      }, 'Timecard configurations retrieved successfully'));

    } catch (error: any) {
      console.error('❌ [GET TIMECARD CONFIGURATIONS HTTP] Error:', error);
      res.status(500).json(handleError(error, 'getTimecardConfigurationsHttp'));
    }
  }
);
