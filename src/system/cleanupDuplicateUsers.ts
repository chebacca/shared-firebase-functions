/**
 * Cleanup Duplicate Users/Team Members Function
 * 
 * Identifies and removes duplicate users/team members across:
 * - users collection
 * - teamMembers collection  
 * - standalonePersonnel collection
 * 
 * Priority for keeping records:
 * 1. users collection (highest priority)
 * 2. teamMembers collection
 * 3. standalonePersonnel collection (lowest priority)
 * 
 * For duplicates within the same collection, keeps the most recently updated record.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createSuccessResponse, createErrorResponse, handleError } from '../shared/utils';

const db = getFirestore();

export const cleanupDuplicateUsers: any = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 540, // 9 minutes max
    cors: true
  },
  async (req: any, res: any) => {
    try {
      const { organizationId, dryRun = true } = req.body;

      if (!organizationId) {
        res.status(400).json(createErrorResponse('Organization ID is required'));
        return;
      }

      console.log(`🧹 [CLEANUP DUPLICATES] Starting duplicate user cleanup for org: ${organizationId} (dryRun: ${dryRun})`);

      const results = {
        organizationId,
        dryRun,
        duplicatesFound: 0,
        duplicatesRemoved: 0,
        recordsProcessed: 0,
        errors: [] as string[],
        details: [] as any[],
        startTime: new Date().toISOString(),
        endTime: null as string | null
      };

      // Step 1: Collect all users from all three collections
      const allUsers = new Map<string, any[]>(); // email -> array of records

      // Query users collection
      try {
        const usersSnapshot = await db.collection('users')
          .where('organizationId', '==', organizationId)
          .get();
        
        usersSnapshot.forEach(doc => {
          const data = doc.data();
          const email = data.email?.toLowerCase().trim();
          if (email) {
            if (!allUsers.has(email)) {
              allUsers.set(email, []);
            }
            allUsers.get(email)!.push({
              collection: 'users',
              id: doc.id,
              email: email,
              data: data,
              priority: 1, // Highest priority
              updatedAt: data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0)
            });
            results.recordsProcessed++;
          }
        });
        console.log(`📊 [CLEANUP DUPLICATES] Found ${usersSnapshot.size} users in 'users' collection`);
      } catch (error: any) {
        console.error('❌ [CLEANUP DUPLICATES] Error querying users:', error);
        results.errors.push(`Failed to query users: ${error.message}`);
      }

      // Query teamMembers collection
      try {
        const teamMembersSnapshot = await db.collection('teamMembers')
          .where('organizationId', '==', organizationId)
          .get();
        
        teamMembersSnapshot.forEach(doc => {
          const data = doc.data();
          const email = data.email?.toLowerCase().trim();
          if (email) {
            if (!allUsers.has(email)) {
              allUsers.set(email, []);
            }
            allUsers.get(email)!.push({
              collection: 'teamMembers',
              id: doc.id,
              email: email,
              data: data,
              priority: 2, // Medium priority
              updatedAt: data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0)
            });
            results.recordsProcessed++;
          }
        });
        console.log(`📊 [CLEANUP DUPLICATES] Found ${teamMembersSnapshot.size} users in 'teamMembers' collection`);
      } catch (error: any) {
        console.error('❌ [CLEANUP DUPLICATES] Error querying teamMembers:', error);
        results.errors.push(`Failed to query teamMembers: ${error.message}`);
      }

      // Query standalonePersonnel collection
      try {
        const standaloneSnapshot = await db.collection('standalonePersonnel')
          .where('organizationId', '==', organizationId)
          .get();
        
        standaloneSnapshot.forEach(doc => {
          const data = doc.data();
          const email = data.email?.toLowerCase().trim();
          if (email) {
            if (!allUsers.has(email)) {
              allUsers.set(email, []);
            }
            allUsers.get(email)!.push({
              collection: 'standalonePersonnel',
              id: doc.id,
              email: email,
              data: data,
              priority: 3, // Lowest priority
              updatedAt: data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0)
            });
            results.recordsProcessed++;
          }
        });
        console.log(`📊 [CLEANUP DUPLICATES] Found ${standaloneSnapshot.size} users in 'standalonePersonnel' collection`);
      } catch (error: any) {
        console.error('❌ [CLEANUP DUPLICATES] Error querying standalonePersonnel:', error);
        results.errors.push(`Failed to query standalonePersonnel: ${error.message}`);
      }

      // Step 2: Identify duplicates and determine which to keep
      const recordsToDelete: any[] = [];
      const recordsToKeep: any[] = [];

      for (const [email, records] of allUsers.entries()) {
        if (records.length > 1) {
          results.duplicatesFound += records.length - 1;
          
          // Sort by priority (lower number = higher priority), then by updatedAt (newest first)
          records.sort((a, b) => {
            if (a.priority !== b.priority) {
              return a.priority - b.priority; // Lower priority number = higher priority
            }
            return b.updatedAt.getTime() - a.updatedAt.getTime(); // Newer first
          });

          const keeper = records[0];
          const duplicates = records.slice(1);

          recordsToKeep.push({
            email: email,
            collection: keeper.collection,
            id: keeper.id,
            displayName: keeper.data.displayName || keeper.data.name || keeper.data.fullName || email
          });

          for (const duplicate of duplicates) {
            recordsToDelete.push({
              email: email,
              collection: duplicate.collection,
              id: duplicate.id,
              displayName: duplicate.data.displayName || duplicate.data.name || duplicate.data.fullName || email,
              reason: `Duplicate of ${keeper.collection}/${keeper.id}`
            });

            results.details.push({
              email: email,
              kept: {
                collection: keeper.collection,
                id: keeper.id,
                displayName: keeper.data.displayName || keeper.data.name || keeper.data.fullName || email
              },
              removed: {
                collection: duplicate.collection,
                id: duplicate.id,
                displayName: duplicate.data.displayName || duplicate.data.name || duplicate.data.fullName || email
              }
            });
          }
        }
      }

      console.log(`🔍 [CLEANUP DUPLICATES] Found ${results.duplicatesFound} duplicate records across ${allUsers.size} unique emails`);
      console.log(`✅ [CLEANUP DUPLICATES] Will keep ${recordsToKeep.length} records`);
      console.log(`🗑️  [CLEANUP DUPLICATES] Will remove ${recordsToDelete.length} duplicate records`);

      // Step 3: Delete duplicates (if not dry run)
      if (!dryRun && recordsToDelete.length > 0) {
        const batch = db.batch();
        let batchCount = 0;
        const maxBatchSize = 500; // Firestore batch limit

        for (const record of recordsToDelete) {
          const docRef = db.collection(record.collection).doc(record.id);
          
          // Instead of deleting, mark as inactive to preserve data
          batch.update(docRef, {
            isActive: false,
            deletedAt: new Date(),
            deletedReason: 'Duplicate user cleanup',
            duplicateOf: `${record.collection}/${record.id}`
          });
          
          batchCount++;
          results.duplicatesRemoved++;

          if (batchCount >= maxBatchSize) {
            await batch.commit();
            console.log(`💾 [CLEANUP DUPLICATES] Committed batch of ${batchCount} updates`);
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
          console.log(`💾 [CLEANUP DUPLICATES] Committed final batch of ${batchCount} updates`);
        }

        console.log(`✅ [CLEANUP DUPLICATES] Marked ${results.duplicatesRemoved} duplicate records as inactive`);
      } else if (dryRun) {
        console.log(`🔍 [CLEANUP DUPLICATES] DRY RUN - No records were modified`);
      }

      results.endTime = new Date().toISOString();

      res.status(200).json(createSuccessResponse({
        ...results,
        summary: {
          totalEmails: allUsers.size,
          emailsWithDuplicates: Array.from(allUsers.entries()).filter(([_, records]) => records.length > 1).length,
          duplicatesFound: results.duplicatesFound,
          duplicatesRemoved: results.duplicatesRemoved,
          recordsToKeep: recordsToKeep.length,
          recordsToDelete: recordsToDelete.length
        },
        recordsToKeep: recordsToKeep.slice(0, 100), // Limit to first 100 for response size
        recordsToDelete: recordsToDelete.slice(0, 100) // Limit to first 100 for response size
      }, dryRun ? 'Dry run completed - no changes made' : 'Duplicate user cleanup completed successfully'));

    } catch (error: any) {
      console.error('❌ [CLEANUP DUPLICATES] Error:', error);
      res.status(500).json(handleError(error, 'cleanupDuplicateUsers'));
    }
  }
);








