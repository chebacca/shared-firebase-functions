/**
 * License-Pitch Synchronization Functions
 * 
 * Ensures pitch records are properly linked to licenses using Firebase Admin SDK
 * Handles bidirectional sync between licenses and pitches
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
try {
  initializeApp();
} catch (error) {
  // Firebase already initialized, continue
}

const db = getFirestore();

/**
 * Sync pitch record with license when license is created
 * Updates pitch.licenseAgreementId to link them
 */
export const onLicenseCreated = onDocumentCreated(
  'clipShowLicenses/{licenseId}',
  async (event) => {
    try {
      const licenseId = event.params.licenseId;
      const licenseData = event.data?.data();

      if (!licenseData) {
        console.warn(`⚠️ [syncLicensePitch] No license data for ${licenseId}`);
        return;
      }

      const clipPitchId = licenseData.clipPitchId;
      if (!clipPitchId) {
        console.log(`ℹ️ [syncLicensePitch] License ${licenseId} has no clipPitchId, skipping pitch update`);
        return;
      }

      // Update pitch with license ID
      const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
      const pitchDoc = await pitchRef.get();

      if (!pitchDoc.exists) {
        console.warn(`⚠️ [syncLicensePitch] Pitch ${clipPitchId} not found for license ${licenseId}`);
        return;
      }

      const pitchData = pitchDoc.data();
      if (!pitchData) {
        console.warn(`⚠️ [syncLicensePitch] Pitch ${clipPitchId} has no data`);
        return;
      }

      // Security check: Verify license and pitch belong to same organization
      const licenseOrgId = licenseData.organizationId;
      const pitchOrgId = pitchData.organizationId;
      if (licenseOrgId && pitchOrgId && licenseOrgId !== pitchOrgId) {
        console.warn(`⚠️ [syncLicensePitch] License ${licenseId} (org: ${licenseOrgId}) and pitch ${clipPitchId} (org: ${pitchOrgId}) belong to different organizations. Skipping sync.`);
        return;
      }

      // Check if pitch already has this license ID (avoid unnecessary updates)
      if (pitchData.licenseAgreementId === licenseId) {
        console.log(`ℹ️ [syncLicensePitch] Pitch ${clipPitchId} already linked to license ${licenseId}`);
        return;
      }

      // Update pitch with license ID
      await pitchRef.update({
        licenseAgreementId: licenseId,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`✅ [syncLicensePitch] Linked pitch ${clipPitchId} to license ${licenseId}`);

      // Optionally update pitch status if not already in clearance phase
      const currentStatus = pitchData.status;
      const clearanceStatuses = ['Working on License', 'License Cleared', 'Ready for Story'];
      
      if (!clearanceStatuses.includes(currentStatus) && currentStatus !== 'License Cleared') {
        await pitchRef.update({
          status: 'Working on License',
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`✅ [syncLicensePitch] Updated pitch ${clipPitchId} status to "Working on License"`);
      }

    } catch (error) {
      console.error(`❌ [syncLicensePitch] Error syncing license ${event.params.licenseId} to pitch:`, error);
      // Don't throw - this is a background sync operation
    }
  }
);

/**
 * Sync pitch record when license is updated
 * Ensures licenseAgreementId is maintained on pitch
 */
export const onLicenseUpdated = onDocumentUpdated(
  'clipShowLicenses/{licenseId}',
  async (event) => {
    try {
      const licenseId = event.params.licenseId;
      const before = event.data?.before?.data();
      const after = event.data?.after?.data();

      if (!before || !after) {
        console.warn(`⚠️ [syncLicensePitch] Missing license data for ${licenseId}`);
        return;
      }

      const clipPitchId = after.clipPitchId || before.clipPitchId;
      if (!clipPitchId) {
        return; // No pitch to sync
      }

      // Security check: Verify license organization
      const licenseOrgId = after.organizationId || before.organizationId;
      if (!licenseOrgId) {
        console.warn(`⚠️ [syncLicensePitch] License ${licenseId} has no organizationId. Skipping sync.`);
        return;
      }

      // Check if clipPitchId changed
      if (before.clipPitchId !== after.clipPitchId) {
        // Remove license from old pitch if it exists
        if (before.clipPitchId) {
          const oldPitchRef = db.collection('clipShowPitches').doc(before.clipPitchId);
          const oldPitchDoc = await oldPitchRef.get();
          
          if (oldPitchDoc.exists) {
            const oldPitchData = oldPitchDoc.data();
            // Verify organization match before unlinking
            if (oldPitchData?.organizationId === licenseOrgId && oldPitchData?.licenseAgreementId === licenseId) {
              await oldPitchRef.update({
                licenseAgreementId: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`✅ [syncLicensePitch] Removed license ${licenseId} from pitch ${before.clipPitchId}`);
            }
          }
        }

        // Add license to new pitch
        if (after.clipPitchId) {
          const newPitchRef = db.collection('clipShowPitches').doc(after.clipPitchId);
          const newPitchDoc = await newPitchRef.get();
          
          if (newPitchDoc.exists) {
            const newPitchData = newPitchDoc.data();
            // Verify organization match before linking
            if (newPitchData?.organizationId === licenseOrgId) {
              await newPitchRef.update({
                licenseAgreementId: licenseId,
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`✅ [syncLicensePitch] Linked license ${licenseId} to new pitch ${after.clipPitchId}`);
            } else {
              console.warn(`⚠️ [syncLicensePitch] License ${licenseId} (org: ${licenseOrgId}) and pitch ${after.clipPitchId} (org: ${newPitchData?.organizationId}) belong to different organizations. Skipping link.`);
            }
          }
        }
      } else {
        // Ensure pitch still has the license ID (in case it was manually removed)
        const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
        const pitchDoc = await pitchRef.get();
        
        if (pitchDoc.exists) {
          const pitchData = pitchDoc.data();
          // Verify organization match
          if (pitchData?.organizationId === licenseOrgId && pitchData?.licenseAgreementId !== licenseId) {
            await pitchRef.update({
              licenseAgreementId: licenseId,
              updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`✅ [syncLicensePitch] Re-linked pitch ${clipPitchId} to license ${licenseId}`);
          } else if (pitchData?.organizationId !== licenseOrgId) {
            console.warn(`⚠️ [syncLicensePitch] License ${licenseId} (org: ${licenseOrgId}) and pitch ${clipPitchId} (org: ${pitchData?.organizationId}) belong to different organizations. Skipping re-link.`);
          }
        }
      }

      // Update pitch status based on license status
      if (before.status !== after.status) {
        const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
        const pitchDoc = await pitchRef.get();
        
        if (pitchDoc.exists) {
          const pitchData = pitchDoc.data();
          const currentPitchStatus = pitchData?.status;

          // Update pitch status based on license status
          if (after.status === 'Signed' || after.status === 'Executed') {
            // Check if signed document exists (filter by organizationId for security)
            const signedDocsQuery = await db.collection('clipShowSignedDocuments')
              .where('organizationId', '==', licenseOrgId)
              .where('licenseAgreementId', '==', licenseId)
              .limit(1)
              .get();

            const hasSignedDocument = !signedDocsQuery.empty;

            if (hasSignedDocument && currentPitchStatus !== 'License Cleared') {
              await pitchRef.update({
                status: 'License Cleared',
                clearedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`✅ [syncLicensePitch] Updated pitch ${clipPitchId} to "License Cleared" (license signed with document)`);
            }
          } else if (after.status === 'Pending' || after.status === 'Pending Signature') {
            if (currentPitchStatus !== 'Working on License') {
              await pitchRef.update({
                status: 'Working on License',
                updatedAt: FieldValue.serverTimestamp()
              });
              console.log(`✅ [syncLicensePitch] Updated pitch ${clipPitchId} to "Working on License"`);
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ [syncLicensePitch] Error syncing license ${event.params.licenseId} update:`, error);
      // Don't throw - this is a background sync operation
    }
  }
);

/**
 * Manual sync function to fix any orphaned or missing links
 * Can be called via HTTP to sync all pitches with their licenses
 */
export const syncAllPitchesWithLicenses = onCall({ memory: '512MiB' }, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId } = request.data;
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    console.log(`🔄 [syncLicensePitch] Starting sync for organization ${organizationId}`);

    // Get all licenses for this organization
    const licensesSnapshot = await db.collection('clipShowLicenses')
      .where('organizationId', '==', organizationId)
      .get();

    let syncedCount = 0;
    let errorCount = 0;

    for (const licenseDoc of licensesSnapshot.docs) {
      try {
        const licenseData = licenseDoc.data();
        const licenseId = licenseDoc.id;
        const clipPitchId = licenseData.clipPitchId;

        if (!clipPitchId) {
          continue; // Skip licenses without pitches
        }

        // Check if pitch exists and has correct license ID
        const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
        const pitchDoc = await pitchRef.get();

        if (!pitchDoc.exists) {
          console.warn(`⚠️ [syncLicensePitch] Pitch ${clipPitchId} not found for license ${licenseId}`);
          errorCount++;
          continue;
        }

        const pitchData = pitchDoc.data();
        // Verify organization match before syncing
        if (pitchData?.organizationId !== organizationId) {
          console.warn(`⚠️ [syncLicensePitch] License ${licenseId} (org: ${organizationId}) and pitch ${clipPitchId} (org: ${pitchData?.organizationId}) belong to different organizations. Skipping sync.`);
          errorCount++;
          continue;
        }
        
        if (pitchData?.licenseAgreementId !== licenseId) {
          // Update pitch with correct license ID
          await pitchRef.update({
            licenseAgreementId: licenseId,
            updatedAt: FieldValue.serverTimestamp()
          });
          syncedCount++;
          console.log(`✅ [syncLicensePitch] Synced pitch ${clipPitchId} with license ${licenseId}`);
        }
      } catch (error) {
        console.error(`❌ [syncLicensePitch] Error syncing license ${licenseDoc.id}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ [syncLicensePitch] Sync complete: ${syncedCount} synced, ${errorCount} errors`);

    return {
      success: true,
      syncedCount,
      errorCount,
      totalLicenses: licensesSnapshot.size
    };

  } catch (error: any) {
    console.error('❌ [syncLicensePitch] Error in syncAllPitchesWithLicenses:', error);
    throw new HttpsError('internal', `Failed to sync pitches with licenses: ${error.message}`);
  }
});

