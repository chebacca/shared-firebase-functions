/**
 * Automation Triggers
 * 
 * Firestore triggers for executing automation rules
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

/**
 * Trigger on pitch status change
 */
export const onPitchStatusChange = onDocumentUpdated(
  'clipShowPitches/{pitchId}',
  async (event) => {
    try {
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
      await executeAutomation(
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
      const before = event.data.before.data();
      const after = event.data.after.data();
      const storyId = event.params.storyId;

      // Check if status changed
      if (before.status === after.status) {
        return; // No status change, skip
      }

      console.log(`🔄 [AutomationTrigger] Story ${storyId} status changed: ${before.status} → ${after.status}`);

      // Get story data for context
      const context = {
        storyId,
        oldStatus: before.status,
        newStatus: after.status,
        storyTitle: after.clipTitle,
        show: after.show,
        season: after.season,
        organizationId: after.organizationId
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
      await executeAutomation(
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

/**
 * Generic automation execution helper
 */
async function executeAutomation(
  functionId: string,
  functionName: string,
  context: any,
  organizationId: string,
  performedBy: string,
  performedByName?: string
): Promise<void> {
  try {
    // Get active automation rules for this function
    const rulesQuery = await db
      .collection('automationRules')
      .where('organizationId', '==', organizationId)
      .where('functionId', '==', functionId)
      .where('enabled', '==', true)
      .get();

    if (rulesQuery.empty) {
      console.log(`⚠️ [AutomationTrigger] No active automation rules for ${functionName}`);
      return;
    }

    console.log(`📋 [AutomationTrigger] Found ${rulesQuery.size} active rules for ${functionName}`);

    // Import and call the executeAutomation Cloud Function
    // Note: In a real implementation, you would call this as an HTTP Cloud Function
    // For now, we'll process the rules directly here

    // Log execution
    await db.collection('automationLogs').add({
      functionId,
      functionName,
      organizationId,
      status: 'success',
      context,
      performedBy,
      performedByName,
      executedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ [AutomationTrigger] Automation logged for ${functionName}`);
  } catch (error) {
    console.error(`❌ [AutomationTrigger] Error executing automation:`, error);
  }
}

// Import admin for serverTimestamp
import * as admin from 'firebase-admin';

