/**
 * Automation Triggers
 * 
 * Firestore triggers for executing automation rules
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { executeAutomationLogic } from './automationService';

const db = getFirestore();

/**
 * Trigger on pitch status change
 */
export const onPitchStatusChange = onDocumentUpdated(
  'clipShowPitches/{pitchId}',
  async (event) => {
    try {
      if (!event.data) {
        console.error('❌ [AutomationTrigger] Event data is missing');
        return;
      }
      const before = event.data.before.data();
      const after = event.data.after.data();
      const pitchId = event.params.pitchId;

      // Check if status changed
      if (before.status === after.status) {
        return; // No status change, skip
      }

      console.log(`🔄 [AutomationTrigger] Pitch ${pitchId} status changed: ${before.status} → ${after.status}`);

      // Get pitch data for context
      const context = {
        pitchId,
        oldStatus: before.status,
        newStatus: after.status,
        pitchTitle: after.clipTitle,
        show: after.show,
        season: after.season,
        organizationId: after.organizationId
      };

      // Execute automation for updatePitchStatus function
      await executeAutomationLogic(
        'updatePitchStatus',
        'Update Pitch Status',
        context,
        after.organizationId,
        after.updatedBy || 'system',
        after.updatedByName
      );

      console.log(`✅ [AutomationTrigger] Automation executed for pitch ${pitchId}`);
    } catch (error) {
      console.error('❌ [AutomationTrigger] Error in pitch status change trigger:', error);
    }
  }
);

/**
 * Trigger on story status change
 */
export const onStoryStatusChange = onDocumentUpdated(
  'clipShowStories/{storyId}',
  async (event) => {
    try {
      if (!event.data) {
        console.error('❌ [AutomationTrigger] Event data is missing');
        return;
      }
      const before = event.data.before.data();
      const after = event.data.after.data();
      const storyId = event.params.storyId;

      // Check if status changed
      if (before.status === after.status) {
        return; // No status change, skip
      }

      console.log(`🔄 [AutomationTrigger] Story ${storyId} status changed: ${before.status} → ${after.status}`);

      // Collect assigned contacts
      const assignedContacts = [];
      if (after.producerId) assignedContacts.push({ id: after.producerId, role: 'PRODUCER' });
      if (after.writerId) assignedContacts.push({ id: after.writerId, role: 'WRITER' });
      if (after.associateProducerId) assignedContacts.push({ id: after.associateProducerId, role: 'ASSOCIATE_PRODUCER' });

      // Get story data for context
      const context = {
        storyId,
        oldStatus: before.status,
        newStatus: after.status,
        storyTitle: after.clipTitle,
        show: after.show,
        season: after.season,
        organizationId: after.organizationId,
        assignedContacts
      };

      // Determine which function to call based on context
      let functionId = 'updateStoryStatus';
      let functionName = 'Update Story Status';

      // Check if this is an approval action
      if (after.currentApproval) {
        const approval = after.currentApproval;
        if (approval.status === 'approved') {
          functionId = 'approveScript';
          functionName = 'Approve Script';
        } else if (approval.status === 'revision_requested') {
          functionId = 'requestRevision';
          functionName = 'Request Revision';
        } else if (approval.status === 'killed') {
          functionId = 'killScript';
          functionName = 'Kill Script';
        }
      }

      // Execute automation
      await executeAutomationLogic(
        functionId,
        functionName,
        context,
        after.organizationId,
        after.updatedBy || 'system',
        after.updatedByName
      );

      console.log(`✅ [AutomationTrigger] Automation executed for story ${storyId}`);
    } catch (error) {
      console.error('❌ [AutomationTrigger] Error in story status change trigger:', error);
    }
  }
);
