/**
 * Backfill Workflow History
 * 
 * Creates workflow action records for existing pitches and licenses
 * that don't have status change history in the workflowActions collection.
 * 
 * This ensures the negotiation timeline displays accurate historical data.
 */

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
 * Map pitch status to milestone label
 */
const getPitchStatusLabel = (status: string): { title: string; description: string } | null => {
  const labels: Record<string, { title: string; description: string }> = {
    'Pitched': { title: 'Initial Pitch Created', description: 'Pitch was created' },
    'Pursue Clearance': { title: 'Clearance Approved', description: 'Producer approved clearance pursuit' },
    'Working on License': { title: 'License Draft Started', description: 'Licensing specialist began creating license' },
    'Pending Signature': { title: 'License Sent for Signature', description: 'License agreement sent to licensor' },
    'License Cleared': { title: 'License Cleared', description: 'License has been cleared and signed' },
    'Ready for Story': { title: 'Ready for Story', description: 'Cleared and ready for story creation' },
  };
  return labels[status] || null;
};

/**
 * Map license status to milestone label
 */
const getLicenseStatusLabel = (status: string): { title: string; description: string } | null => {
  const labels: Record<string, { title: string; description: string }> = {
    'Draft': { title: 'License Draft Created', description: 'License draft was created' },
    'Pending': { title: 'License Pending', description: 'License is pending approval' },
    'Pending Signature': { title: 'Awaiting Signature', description: 'Waiting for licensor signature' },
    'Signed': { title: 'License Signed', description: 'License has been signed' },
    'Executed': { title: 'License Executed', description: 'License has been executed' },
  };
  return labels[status] || null;
};

/**
 * Check if a workflow action already exists for a given entity and status
 */
async function workflowActionExists(
  entityId: string,
  entityType: string,
  toStatus: string,
  organizationId: string
): Promise<boolean> {
  try {
    const existingQuery = await db.collection('workflowActions')
      .where('entityId', '==', entityId)
      .where('entityType', '==', entityType)
      .where('organizationId', '==', organizationId)
      .where('type', '==', 'Status Change')
      .where('details.toStatus', '==', toStatus)
      .limit(1)
      .get();

    return !existingQuery.empty;
  } catch (error) {
    console.warn(`⚠️ [backfillWorkflowHistory] Error checking existing workflow action:`, error);
    return false; // Assume doesn't exist if check fails
  }
}

/**
 * Backfill workflow history for pitches and licenses
 */
export const backfillWorkflowHistory = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, dryRun = false } = request.data;
    
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    console.log(`🔄 [backfillWorkflowHistory] Starting backfill for organization ${organizationId} (dryRun: ${dryRun})`);

    let pitchesProcessed = 0;
    let licensesProcessed = 0;
    let workflowActionsCreated = 0;
    let workflowActionsSkipped = 0;
    let errors = 0;

    // Process pitches
    console.log('📋 [backfillWorkflowHistory] Processing pitches...');
    const pitchesSnapshot = await db.collection('clipShowPitches')
      .where('organizationId', '==', organizationId)
      .get();

    for (const pitchDoc of pitchesSnapshot.docs) {
      try {
        const pitchData = pitchDoc.data();
        const pitchId = pitchDoc.id;
        const pitchStatus = pitchData.status;

        if (!pitchStatus) {
          continue;
        }

        // Check if workflow action already exists for current status
        const exists = await workflowActionExists(pitchId, 'ClipPitch', pitchStatus, organizationId);
        
        if (exists) {
          workflowActionsSkipped++;
          continue;
        }

        // Create workflow action for current status
        // Use createdAt as the initial status timestamp, or updatedAt if status changed
        const statusTimestamp = pitchData.clearedAt || pitchData.updatedAt || pitchData.createdAt || FieldValue.serverTimestamp();
        const performedBy = pitchData.clearedBy || pitchData.assignedLicensingSpecialistId || pitchData.assignedProducerId || 'system';

        if (!dryRun) {
          await db.collection('workflowActions').add({
            type: 'Status Change',
            entityId: pitchId,
            entityType: 'ClipPitch',
            performedBy,
            performedAt: statusTimestamp,
            timestamp: FieldValue.serverTimestamp(),
            details: {
              fromStatus: null, // Unknown for backfilled records
              toStatus: pitchStatus,
              reason: 'Backfilled from existing pitch data',
              backfilled: true,
            },
            organizationId,
            projectId: pitchData.projectId,
          });
        }

        workflowActionsCreated++;
        pitchesProcessed++;
      } catch (error) {
        console.error(`❌ [backfillWorkflowHistory] Error processing pitch ${pitchDoc.id}:`, error);
        errors++;
      }
    }

    // Process licenses
    console.log('📋 [backfillWorkflowHistory] Processing licenses...');
    const licensesSnapshot = await db.collection('clipShowLicenses')
      .where('organizationId', '==', organizationId)
      .get();

    for (const licenseDoc of licensesSnapshot.docs) {
      try {
        const licenseData = licenseDoc.data();
        const licenseId = licenseDoc.id;
        const licenseStatus = licenseData.status;

        if (!licenseStatus) {
          continue;
        }

        // Check if workflow action already exists for current status
        const exists = await workflowActionExists(licenseId, 'LicenseAgreement', licenseStatus, organizationId);
        
        if (exists) {
          workflowActionsSkipped++;
          continue;
        }

        // Create workflow action for current status
        // Use signedDate if status is Signed/Executed, otherwise use updatedAt or createdAt
        const statusTimestamp = 
          (licenseStatus === 'Signed' || licenseStatus === 'Executed') && licenseData.signedDate
            ? licenseData.signedDate
            : licenseData.updatedAt || licenseData.createdAt || FieldValue.serverTimestamp();
        
        const performedBy = licenseData.updatedBy || licenseData.createdBy || 'system';

        if (!dryRun) {
          await db.collection('workflowActions').add({
            type: 'Status Change',
            entityId: licenseId,
            entityType: 'LicenseAgreement',
            performedBy,
            performedAt: statusTimestamp,
            timestamp: FieldValue.serverTimestamp(),
            details: {
              fromStatus: null, // Unknown for backfilled records
              toStatus: licenseStatus,
              reason: 'Backfilled from existing license data',
              backfilled: true,
            },
            organizationId,
            projectId: licenseData.projectId,
          });
        }

        workflowActionsCreated++;
        licensesProcessed++;
      } catch (error) {
        console.error(`❌ [backfillWorkflowHistory] Error processing license ${licenseDoc.id}:`, error);
        errors++;
      }
    }

    const summary = {
      totalPitches: pitchesSnapshot.size,
      totalLicenses: licensesSnapshot.size,
      pitchesProcessed,
      licensesProcessed,
      workflowActionsCreated,
      workflowActionsSkipped,
      errors,
      dryRun,
    };

    console.log(`✅ [backfillWorkflowHistory] Backfill complete:`, summary);

    return {
      success: true,
      summary,
      message: dryRun
        ? `Dry run complete. Would create ${workflowActionsCreated} workflow actions.`
        : `Successfully created ${workflowActionsCreated} workflow actions.`,
    };

  } catch (error: any) {
    console.error('❌ [backfillWorkflowHistory] Error in backfillWorkflowHistory:', error);
    throw new HttpsError('internal', `Failed to backfill workflow history: ${error.message}`);
  }
});

/**
 * Audit workflow history - check which pitches/licenses are missing workflow actions
 */
export const auditWorkflowHistory = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId } = request.data;
    
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    console.log(`🔍 [auditWorkflowHistory] Starting audit for organization ${organizationId}`);

    const pitchesWithoutHistory: Array<{ pitchId: string; status: string; createdAt: any }> = [];
    const licensesWithoutHistory: Array<{ licenseId: string; status: string; createdAt: any }> = [];

    // Check pitches
    const pitchesSnapshot = await db.collection('clipShowPitches')
      .where('organizationId', '==', organizationId)
      .get();

    for (const pitchDoc of pitchesSnapshot.docs) {
      const pitchData = pitchDoc.data();
      const pitchId = pitchDoc.id;
      const pitchStatus = pitchData.status;

      if (!pitchStatus) {
        continue;
      }

      const exists = await workflowActionExists(pitchId, 'ClipPitch', pitchStatus, organizationId);
      if (!exists) {
        pitchesWithoutHistory.push({
          pitchId,
          status: pitchStatus,
          createdAt: pitchData.createdAt,
        });
      }
    }

    // Check licenses
    const licensesSnapshot = await db.collection('clipShowLicenses')
      .where('organizationId', '==', organizationId)
      .get();

    for (const licenseDoc of licensesSnapshot.docs) {
      const licenseData = licenseDoc.data();
      const licenseId = licenseDoc.id;
      const licenseStatus = licenseData.status;

      if (!licenseStatus) {
        continue;
      }

      const exists = await workflowActionExists(licenseId, 'LicenseAgreement', licenseStatus, organizationId);
      if (!exists) {
        licensesWithoutHistory.push({
          licenseId,
          status: licenseStatus,
          createdAt: licenseData.createdAt,
        });
      }
    }

    const summary = {
      totalPitches: pitchesSnapshot.size,
      totalLicenses: licensesSnapshot.size,
      pitchesWithoutHistory: pitchesWithoutHistory.length,
      licensesWithoutHistory: licensesWithoutHistory.length,
    };

    console.log(`✅ [auditWorkflowHistory] Audit complete:`, summary);

    return {
      success: true,
      summary,
      pitchesWithoutHistory: pitchesWithoutHistory.slice(0, 100), // Limit response size
      licensesWithoutHistory: licensesWithoutHistory.slice(0, 100),
    };

  } catch (error: any) {
    console.error('❌ [auditWorkflowHistory] Error in auditWorkflowHistory:', error);
    throw new HttpsError('internal', `Failed to audit workflow history: ${error.message}`);
  }
});

