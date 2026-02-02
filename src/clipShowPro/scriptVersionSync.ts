/**
 * Script Version Sync Function
 * 
 * Syncs story document when script versions are created or updated.
 * Updates versionCount, currentVersionId, and lastEditedAt on the parent story document.
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const db = getFirestore();

/**
 * Sync story document when a script version is created
 * Triggered on: clipShowStories/{storyId}/scriptVersions/{versionId}
 */
export const onScriptVersionCreated = onDocumentCreated(
  {
    document: 'clipShowStories/{storyId}/scriptVersions/{versionId}',
    region: 'us-central1',
  },
  async (event) => {
    try {
      const versionData = event.data?.data();
      const storyId = event.params.storyId;
      const versionId = event.params.versionId;

      if (!versionData) {
        logger.warn('[SCRIPT_VERSION_SYNC] No version data found', { storyId, versionId });
        return;
      }

      logger.info('[SCRIPT_VERSION_SYNC] Syncing story document', {
        storyId,
        versionId,
        versionNumber: versionData.versionNumber,
      });

      const storyRef = db.collection('clipShowStories').doc(storyId);
      const storyDoc = await storyRef.get();

      if (!storyDoc.exists) {
        logger.warn('[SCRIPT_VERSION_SYNC] Story not found', { storyId });
        return;
      }

      const storyData = storyDoc.data();
      const currentVersionCount = storyData?.versionCount || 0;
      const newVersionNumber = versionData.versionNumber || currentVersionCount + 1;

      // Update story document with latest version info
      const updateData: any = {
        versionCount: newVersionNumber,
        currentVersionId: versionId,
        updatedAt: FieldValue.serverTimestamp(),
        lastEditedAt: FieldValue.serverTimestamp(),
      };

      // Update lastEditedBy if createdBy is available
      if (versionData.createdBy) {
        updateData.lastEditedBy = versionData.createdBy;
      }

      // Only update scriptContent if it's provided in the version
      // (This ensures we don't overwrite content if it's not in the version)
      if (versionData.content !== undefined) {
        updateData.scriptContent = versionData.content;
      }

      await storyRef.update(updateData);

      logger.info('[SCRIPT_VERSION_SYNC] Story document synced successfully', {
        storyId,
        versionId,
        versionNumber: newVersionNumber,
      });
    } catch (error) {
      logger.error('[SCRIPT_VERSION_SYNC] Error syncing story document', {
        error: error instanceof Error ? error.message : String(error),
        storyId: event.params.storyId,
        versionId: event.params.versionId,
      });
      // Don't throw - we don't want to fail the version creation if sync fails
    }
  }
);

/**
 * Sync story document when a script version is updated
 * This handles cases where version metadata might change
 */
export const onScriptVersionUpdated = onDocumentUpdated(
  {
    document: 'clipShowStories/{storyId}/scriptVersions/{versionId}',
    region: 'us-central1',
  },
  async (event) => {
    try {
      const versionDataAfter = event.data?.after.data();
      const storyId = event.params.storyId;
      const versionId = event.params.versionId;

      if (!versionDataAfter) {
        logger.warn('[SCRIPT_VERSION_SYNC] No version data found after update', { storyId, versionId });
        return;
      }

      const storyRef = db.collection('clipShowStories').doc(storyId);
      const storyDoc = await storyRef.get();

      if (!storyDoc.exists) {
        logger.warn('[SCRIPT_VERSION_SYNC] Story not found', { storyId });
        return;
      }

      const storyData = storyDoc.data();
      const currentVersionId = storyData?.currentVersionId;

      // Only update if this is the current version
      if (currentVersionId === versionId) {
        logger.info('[SCRIPT_VERSION_SYNC] Updating story for current version', {
          storyId,
          versionId,
        });

        const updateData: any = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Update lastEditedAt if this is the current version
        updateData.lastEditedAt = FieldValue.serverTimestamp();

        // Update scriptContent if it changed
        if (versionDataAfter.content !== undefined) {
          updateData.scriptContent = versionDataAfter.content;
        }

        await storyRef.update(updateData);

        logger.info('[SCRIPT_VERSION_SYNC] Story document updated successfully', {
          storyId,
          versionId,
        });
      }
    } catch (error) {
      logger.error('[SCRIPT_VERSION_SYNC] Error updating story document', {
        error: error instanceof Error ? error.message : String(error),
        storyId: event.params.storyId,
        versionId: event.params.versionId,
      });
      // Don't throw - we don't want to fail the version update if sync fails
    }
  }
);

