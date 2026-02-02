/**
 * Backfill License Fees Function
 * 
 * Checks all licenses for missing fee data and updates them using Firebase Admin SDK
 * Ensures all licenses have a cost associated with them
 */

import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
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
 * Check and backfill missing license fees
 * Can be called manually to audit and fix license fee data
 */
export const backfillLicenseFees = onCall({ memory: '512MiB' }, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, defaultFee } = request.data;
    
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    console.log(`🔄 [backfillLicenseFees] Starting fee backfill for organization ${organizationId}`);

    // Get all licenses for this organization
    const licensesSnapshot = await db.collection('clipShowLicenses')
      .where('organizationId', '==', organizationId)
      .get();

    let licensesWithoutFee = 0;
    let licensesWithZeroFee = 0;
    let licensesUpdated = 0;
    let licensesSkipped = 0;
    let errorCount = 0;

    const updates: Array<{ licenseId: string; oldFee: any; newFee: number }> = [];

    for (const licenseDoc of licensesSnapshot.docs) {
      try {
        const licenseData = licenseDoc.data();
        const licenseId = licenseDoc.id;
        const currentFee = licenseData.fee;

        // Check if fee is missing, null, undefined, or 0
        const feeMissing = currentFee === undefined || currentFee === null;
        const feeIsZero = currentFee === 0;

        if (feeMissing) {
          licensesWithoutFee++;
        } else if (feeIsZero) {
          licensesWithZeroFee++;
        }

        // Determine what fee to set
        let newFee: number | null = null;
        let feeSource = '';

        if (feeMissing || feeIsZero) {
          // Try to get fee from related pitch first
          const clipPitchId = licenseData.clipPitchId;
          if (clipPitchId) {
            try {
              const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
              const pitchDoc = await pitchRef.get();
              
              if (pitchDoc.exists) {
                const pitchData = pitchDoc.data();
                if (pitchData?.licenseFee && pitchData.licenseFee > 0) {
                  newFee = pitchData.licenseFee;
                  feeSource = 'linked pitch (licenseFee)';
                } else if (pitchData?.estimatedCost && pitchData.estimatedCost > 0) {
                  newFee = pitchData.estimatedCost;
                  feeSource = 'linked pitch (estimatedCost)';
                }
              }
            } catch (pitchError) {
              console.warn(`⚠️ [backfillLicenseFees] Could not fetch pitch ${clipPitchId} for license ${licenseId}:`, pitchError);
            }
          }

          // Try to get fee from signed documents if not found in pitch
          if (!newFee) {
            try {
              const signedDocsQuery = await db.collection('clipShowSignedDocuments')
                .where('licenseAgreementId', '==', licenseId)
                .where('organizationId', '==', organizationId)
                .limit(1)
                .get();

              if (!signedDocsQuery.empty) {
                const docData = signedDocsQuery.docs[0].data();
                if (docData?.fee && docData.fee > 0) {
                  newFee = docData.fee;
                  feeSource = 'signed document (fee)';
                } else if (docData?.licenseFee && docData.licenseFee > 0) {
                  newFee = docData.licenseFee;
                  feeSource = 'signed document (licenseFee)';
                }
              }
            } catch (docError) {
              console.warn(`⚠️ [backfillLicenseFees] Could not fetch signed documents for license ${licenseId}:`, docError);
            }
          }

          // If still no fee found, use provided defaultFee or set to 0
          if (!newFee) {
            if (defaultFee !== undefined && defaultFee !== null) {
              newFee = Number(defaultFee);
              feeSource = 'provided default';
            } else {
              newFee = 0;
              feeSource = 'default (0)';
            }
          }
          
          // Only update if we have a valid fee value
          if (newFee !== null && newFee >= 0) {
            await licenseDoc.ref.update({
              fee: newFee,
              updatedAt: FieldValue.serverTimestamp()
            });
            
            licensesUpdated++;
            updates.push({
              licenseId,
              oldFee: currentFee,
              newFee
            });
            
            console.log(`✅ [backfillLicenseFees] Updated license ${licenseId}: fee ${currentFee} → ${newFee} (from ${feeSource})`);
          } else {
            licensesSkipped++;
            console.log(`ℹ️ [backfillLicenseFees] Skipped license ${licenseId}: no valid fee provided (current: ${currentFee})`);
          }
        } else {
          licensesSkipped++;
          console.log(`ℹ️ [backfillLicenseFees] License ${licenseId} already has fee: ${currentFee}`);
        }
      } catch (error) {
        console.error(`❌ [backfillLicenseFees] Error processing license ${licenseDoc.id}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ [backfillLicenseFees] Backfill complete for organization ${organizationId}:`, {
      totalLicenses: licensesSnapshot.size,
      licensesWithoutFee,
      licensesWithZeroFee,
      licensesUpdated,
      licensesSkipped,
      errorCount
    });

    return {
      success: true,
      summary: {
        totalLicenses: licensesSnapshot.size,
        licensesWithoutFee,
        licensesWithZeroFee,
        licensesUpdated,
        licensesSkipped,
        errorCount
      },
      updates: updates.slice(0, 100), // Return first 100 updates to avoid response size limits
      message: `Processed ${licensesSnapshot.size} licenses. Updated ${licensesUpdated} with missing or zero fees.`
    };

  } catch (error: any) {
    console.error('❌ [backfillLicenseFees] Error in backfillLicenseFees:', error);
    throw new HttpsError('internal', `Failed to backfill license fees: ${error.message}`);
  }
});

/**
 * Audit license fees - check which licenses are missing fees without updating them
 */
export const auditLicenseFees = onCall({ memory: '512MiB' }, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId } = request.data;
    
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    console.log(`🔍 [auditLicenseFees] Starting fee audit for organization ${organizationId}`);

    // Get all licenses for this organization
    const licensesSnapshot = await db.collection('clipShowLicenses')
      .where('organizationId', '==', organizationId)
      .get();

    const licensesWithoutFee: Array<{ licenseId: string; clipPitchId?: string; status: string; fee: any }> = [];
    const licensesWithZeroFee: Array<{ licenseId: string; clipPitchId?: string; status: string; fee: any }> = [];
    const licensesWithFee: Array<{ licenseId: string; clipPitchId?: string; status: string; fee: number }> = [];

    for (const licenseDoc of licensesSnapshot.docs) {
      const licenseData = licenseDoc.data();
      const licenseId = licenseDoc.id;
      const fee = licenseData.fee;
      const status = licenseData.status || 'Unknown';

      const licenseInfo = {
        licenseId,
        clipPitchId: licenseData.clipPitchId,
        status,
        fee
      };

      if (fee === undefined || fee === null) {
        licensesWithoutFee.push(licenseInfo);
      } else if (fee === 0) {
        licensesWithZeroFee.push(licenseInfo);
      } else {
        licensesWithFee.push({ ...licenseInfo, fee: Number(fee) });
      }
    }

    console.log(`✅ [auditLicenseFees] Audit complete for organization ${organizationId}:`, {
      totalLicenses: licensesSnapshot.size,
      licensesWithoutFee: licensesWithoutFee.length,
      licensesWithZeroFee: licensesWithZeroFee.length,
      licensesWithFee: licensesWithFee.length
    });

    return {
      success: true,
      summary: {
        totalLicenses: licensesSnapshot.size,
        licensesWithoutFee: licensesWithoutFee.length,
        licensesWithZeroFee: licensesWithZeroFee.length,
        licensesWithFee: licensesWithFee.length
      },
      licensesWithoutFee: licensesWithoutFee.slice(0, 100), // Limit response size
      licensesWithZeroFee: licensesWithZeroFee.slice(0, 100),
      licensesWithFee: licensesWithFee.slice(0, 100)
    };

  } catch (error: any) {
    console.error('❌ [auditLicenseFees] Error in auditLicenseFees:', error);
    throw new HttpsError('internal', `Failed to audit license fees: ${error.message}`);
  }
});

/**
 * Auto-set default fee when a license is created without a fee
 * This trigger ensures new licenses always have a fee field
 */
export const onLicenseCreatedCheckFee = onDocumentCreated(
  'clipShowLicenses/{licenseId}',
  async (event) => {
    try {
      const licenseId = event.params.licenseId;
      const licenseData = event.data?.data();

      if (!licenseData) {
        console.warn(`⚠️ [onLicenseCreatedCheckFee] No license data for ${licenseId}`);
        return;
      }

      const currentFee = licenseData.fee;
      
      // Check if fee is missing, null, undefined, or 0
      const feeMissing = currentFee === undefined || currentFee === null;
      const feeIsZero = currentFee === 0;

      if (feeMissing || feeIsZero) {
        // Try to get fee from related pitch
        let newFee: number | null = null;
        const clipPitchId = licenseData.clipPitchId;

        if (clipPitchId) {
          try {
            const pitchRef = db.collection('clipShowPitches').doc(clipPitchId);
            const pitchDoc = await pitchRef.get();
            
            if (pitchDoc.exists) {
              const pitchData = pitchDoc.data();
              // Check for fee-related fields in pitch
              if (pitchData?.licenseFee && pitchData.licenseFee > 0) {
                newFee = pitchData.licenseFee;
                console.log(`✅ [onLicenseCreatedCheckFee] Found fee ${newFee} from pitch ${clipPitchId}`);
              } else if (pitchData?.estimatedCost && pitchData.estimatedCost > 0) {
                newFee = pitchData.estimatedCost;
                console.log(`✅ [onLicenseCreatedCheckFee] Found fee ${newFee} from pitch estimatedCost`);
              }
            }
          } catch (pitchError) {
            console.warn(`⚠️ [onLicenseCreatedCheckFee] Could not fetch pitch ${clipPitchId}:`, pitchError);
          }
        }

        // If still no fee, set to 0 (user can update later via UI)
        if (newFee === null) {
          newFee = 0;
        }

        // Update license with fee
        await event.data?.ref.update({
          fee: newFee,
          updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`✅ [onLicenseCreatedCheckFee] Set fee ${newFee} for license ${licenseId} (was ${feeMissing ? 'missing' : 'zero'})`);
      } else {
        console.log(`ℹ️ [onLicenseCreatedCheckFee] License ${licenseId} already has fee: ${currentFee}`);
      }
    } catch (error) {
      console.error(`❌ [onLicenseCreatedCheckFee] Error checking fee for license ${event.params.licenseId}:`, error);
      // Don't throw - this is a background operation
    }
  }
);

