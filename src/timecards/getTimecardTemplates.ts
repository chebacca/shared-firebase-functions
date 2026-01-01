/**
 * Get Timecard Templates Function
 * 
 * Retrieves timecard templates for an organization
 * Supports both Firebase Callable (onCall) and HTTP (onRequest) calling methods
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, handleError } from '../shared/utils';

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
