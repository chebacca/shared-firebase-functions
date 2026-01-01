/**
 * Delete Timecard Configuration Function
 * 
 * Deletes (soft delete) a timecard configuration
 */

import { onCall } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createSuccessResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const deleteTimecardConfiguration = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
    cors: true
  },
  async (request) => {
    try {
      const { auth } = request;
      
      if (!auth) {
        throw new Error('Authentication required');
      }

      const { configurationId, organizationId } = request.data;

      if (!configurationId) {
        throw new Error('Configuration ID is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`⏰ [DELETE TIMECARD CONFIGURATION] Deleting configuration: ${configurationId}`);

      // Verify configuration exists and belongs to organization
      const configRef = db.collection('timecardConfigurations').doc(configurationId);
      const configDoc = await configRef.get();

      if (!configDoc.exists) {
        throw new Error('Configuration not found');
      }

      const configData = configDoc.data();
      if (configData?.organizationId !== organizationId) {
        throw new Error('Configuration does not belong to this organization');
      }

      // Soft delete - mark as inactive
      await configRef.update({
        isActive: false,
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: auth.uid,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`⏰ [DELETE TIMECARD CONFIGURATION] Configuration deleted: ${configurationId}`);

      return createSuccessResponse({
        id: configurationId,
        deleted: true
      }, 'Timecard configuration deleted successfully');

    } catch (error: any) {
      console.error('❌ [DELETE TIMECARD CONFIGURATION] Error:', error);
      return handleError(error, 'deleteTimecardConfiguration');
    }
  }
);

