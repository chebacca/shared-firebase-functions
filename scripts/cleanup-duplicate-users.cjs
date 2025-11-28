#!/usr/bin/env node
/**
 * Cleanup Duplicate Users/Team Members Script
 * 
 * This script identifies and removes duplicate users/team members across:
 * - users collection
 * - teamMembers collection
 * - standalonePersonnel collection
 * 
 * Usage:
 *   node scripts/cleanup-duplicate-users.cjs <organizationId> [--dry-run]
 * 
 * Example:
 *   node scripts/cleanup-duplicate-users.cjs clip-show-pro-productions --dry-run
 *   node scripts/cleanup-duplicate-users.cjs clip-show-pro-productions
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
// Try multiple authentication methods:
// 1. Service account key from environment variable
// 2. Service account key file
// 3. Default credentials (Firebase CLI authentication)

let initialized = false;

// Method 1: Try environment variable
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = require(serviceAccountPath);
      initializeApp({
        credential: cert(serviceAccount)
      });
      initialized = true;
      console.log('✅ Using service account from GOOGLE_APPLICATION_CREDENTIALS');
    } catch (error) {
      console.warn('⚠️  Failed to load service account from GOOGLE_APPLICATION_CREDENTIALS:', error.message);
    }
  }
}

// Method 2: Try local service account file
if (!initialized) {
  const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const serviceAccount = require(serviceAccountPath);
      initializeApp({
        credential: cert(serviceAccount)
      });
      initialized = true;
      console.log('✅ Using local service account file');
    } catch (error) {
      console.warn('⚠️  Failed to load local service account:', error.message);
    }
  }
}

// Method 3: Try default credentials (Firebase CLI)
if (!initialized) {
  try {
    initializeApp();
    initialized = true;
    console.log('✅ Using default Firebase credentials (Firebase CLI)');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('\nPlease use one of these methods:');
    console.error('  1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable');
    console.error('  2. Place serviceAccountKey.json in shared-firebase-functions directory');
    console.error('  3. Run: firebase login:ci (for Firebase CLI authentication)');
    process.exit(1);
  }
}

const db = getFirestore();

async function cleanupDuplicateUsers(organizationId, dryRun = true, alsoCleanNameDuplicates = false) {
  console.log(`🧹 [CLEANUP DUPLICATES] Starting duplicate user cleanup for org: ${organizationId}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will mark duplicates as inactive)'}\n`);

  const results = {
    organizationId,
    dryRun,
    duplicatesFound: 0,
    duplicatesRemoved: 0,
    recordsProcessed: 0,
    errors: [],
    details: [],
    startTime: new Date().toISOString()
  };

  // Step 1: Collect all users from all three collections
  const allUsers = new Map(); // email -> array of records

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
        const updatedAt = data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0);
        allUsers.get(email).push({
          collection: 'users',
          id: doc.id,
          email: email,
          displayName: data.displayName || data.name || email,
          data: data,
          priority: 1, // Highest priority
          updatedAt: updatedAt
        });
        results.recordsProcessed++;
      }
    });
    console.log(`📊 Found ${usersSnapshot.size} users in 'users' collection`);
  } catch (error) {
    console.error('❌ Error querying users:', error);
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
        const updatedAt = data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0);
        allUsers.get(email).push({
          collection: 'teamMembers',
          id: doc.id,
          email: email,
          displayName: data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || email,
          data: data,
          priority: 2, // Medium priority
          updatedAt: updatedAt
        });
        results.recordsProcessed++;
      }
    });
    console.log(`📊 Found ${teamMembersSnapshot.size} users in 'teamMembers' collection`);
  } catch (error) {
    console.error('❌ Error querying teamMembers:', error);
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
        const updatedAt = data.updatedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date(0);
        allUsers.get(email).push({
          collection: 'standalonePersonnel',
          id: doc.id,
          email: email,
          displayName: data.fullName || data.name || data.displayName || email,
          data: data,
          priority: 3, // Lowest priority
          updatedAt: updatedAt
        });
        results.recordsProcessed++;
      }
    });
    console.log(`📊 Found ${standaloneSnapshot.size} users in 'standalonePersonnel' collection`);
  } catch (error) {
    console.error('❌ Error querying standalonePersonnel:', error);
    results.errors.push(`Failed to query standalonePersonnel: ${error.message}`);
  }

  console.log(`\n📊 Total unique emails: ${allUsers.size}`);
  console.log(`📊 Total records processed: ${results.recordsProcessed}\n`);

  // Step 2: Identify duplicates by EMAIL and determine which to keep
  const recordsToDelete = [];
  const recordsToKeep = [];

  // First pass: Handle email-based duplicates
  for (const [email, records] of allUsers.entries()) {
    if (records.length > 1) {
      results.duplicatesFound += records.length - 1;
      
      // Sort by priority (lower number = higher priority), then by updatedAt (newest first)
      records.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      const keeper = records[0];
      const duplicates = records.slice(1);

      recordsToKeep.push({
        email: email,
        collection: keeper.collection,
        id: keeper.id,
        displayName: keeper.displayName,
        record: keeper
      });

      for (const duplicate of duplicates) {
        recordsToDelete.push({
          email: email,
          collection: duplicate.collection,
          id: duplicate.id,
          displayName: duplicate.displayName,
          reason: `Duplicate email: ${email}`
        });

        results.details.push({
          email: email,
          kept: {
            collection: keeper.collection,
            id: keeper.id,
            displayName: keeper.displayName
          },
          removed: {
            collection: duplicate.collection,
            id: duplicate.id,
            displayName: duplicate.displayName
          }
        });
      }
    } else {
      // Single record per email - keep it
      recordsToKeep.push({
        email: email,
        collection: records[0].collection,
        id: records[0].id,
        displayName: records[0].displayName,
        record: records[0]
      });
    }
  }

  // Second pass: Identify potential duplicates by NAME (same name, different emails)
  // This helps identify cases like "David Kim" with multiple email addresses
  const nameBasedDuplicates = new Map(); // normalizedName -> array of kept records
  
  for (const kept of recordsToKeep) {
    const normalizedName = kept.displayName?.toLowerCase().trim();
    if (normalizedName && normalizedName.length > 0) {
      if (!nameBasedDuplicates.has(normalizedName)) {
        nameBasedDuplicates.set(normalizedName, []);
      }
      nameBasedDuplicates.get(normalizedName).push(kept);
    }
  }

  const nameDuplicates = [];
  for (const [normalizedName, records] of nameBasedDuplicates.entries()) {
    if (records.length > 1) {
      // Same name but different emails - potential duplicate person
      const uniqueEmails = new Set(records.map(r => r.email));
      if (uniqueEmails.size > 1) {
        nameDuplicates.push({
          name: records[0].displayName,
          normalizedName: normalizedName,
          records: records,
          emailCount: uniqueEmails.size
        });
      }
    }
  }

  // For name-based duplicates, we'll keep the one with the most complete data
  // or the one from the highest priority collection
  if (nameDuplicates.length > 0) {
    console.log(`\n⚠️  Found ${nameDuplicates.length} potential name-based duplicates:`);
    console.log('   (Same name, different emails - may be the same person)');
    for (const dup of nameDuplicates.slice(0, 10)) {
      console.log(`\n   Name: "${dup.name}" (${dup.emailCount} different emails):`);
      // Sort by priority and updatedAt to determine which to keep
      dup.records.sort((a, b) => {
        const priorityA = a.record?.priority || (a.collection === 'users' ? 1 : a.collection === 'teamMembers' ? 2 : 3);
        const priorityB = b.record?.priority || (b.collection === 'users' ? 1 : b.collection === 'teamMembers' ? 2 : 3);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        const updatedA = a.record?.updatedAt?.getTime() || 0;
        const updatedB = b.record?.updatedAt?.getTime() || 0;
        return updatedB - updatedA;
      });
      
      dup.records.forEach((r, idx) => {
        const marker = idx === 0 ? '✅' : alsoCleanNameDuplicates ? '❌' : '❓';
        console.log(`     ${marker} ${r.collection}/${r.id} - ${r.email}`);
      });
    }
    if (nameDuplicates.length > 10) {
      console.log(`\n   ... and ${nameDuplicates.length - 10} more name-based duplicates`);
    }
    
    if (alsoCleanNameDuplicates) {
      console.log('\n   ⚠️  Name-based cleanup is ENABLED - will mark duplicates as inactive');
      // Add name-based duplicates to recordsToDelete
      for (const dup of nameDuplicates) {
        dup.records.sort((a, b) => {
          const priorityA = a.record?.priority || (a.collection === 'users' ? 1 : a.collection === 'teamMembers' ? 2 : 3);
          const priorityB = b.record?.priority || (b.collection === 'users' ? 1 : b.collection === 'teamMembers' ? 2 : 3);
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          const updatedA = a.record?.updatedAt?.getTime() || 0;
          const updatedB = b.record?.updatedAt?.getTime() || 0;
          return updatedB - updatedA;
        });
        
        const nameKeeper = dup.records[0];
        const nameDuplicatesToRemove = dup.records.slice(1);
        
        for (const duplicate of nameDuplicatesToRemove) {
          // Only add if not already in recordsToDelete (from email-based cleanup)
          const alreadyMarked = recordsToDelete.some(r => 
            r.collection === duplicate.collection && r.id === duplicate.id
          );
          
          if (!alreadyMarked) {
            recordsToDelete.push({
              email: duplicate.email,
              collection: duplicate.collection,
              id: duplicate.id,
              displayName: duplicate.displayName,
              reason: `Duplicate name: "${dup.name}" (keeping ${nameKeeper.email})`
            });
            
            results.details.push({
              email: duplicate.email,
              name: dup.name,
              kept: {
                collection: nameKeeper.collection,
                id: nameKeeper.id,
                displayName: nameKeeper.displayName,
                email: nameKeeper.email
              },
              removed: {
                collection: duplicate.collection,
                id: duplicate.id,
                displayName: duplicate.displayName,
                email: duplicate.email
              }
            });
            
            results.duplicatesFound++;
          }
        }
      }
    } else {
      console.log('\n   Note: These are flagged for review - same name with different emails');
      console.log('   may be legitimate (different people with same name) or duplicates.');
      console.log('   Use --clean-name-duplicates flag to also clean name-based duplicates.\n');
    }
  }

  console.log(`🔍 Found ${results.duplicatesFound} duplicate records (by email) across ${allUsers.size} unique emails`);
  if (nameDuplicates.length > 0) {
    console.log(`⚠️  Found ${nameDuplicates.length} potential name-based duplicates (same name, different emails)`);
  }
  console.log(`✅ Will keep ${recordsToKeep.length} records (one per unique email)`);
  console.log(`🗑️  Will remove ${recordsToDelete.length} duplicate records (by email)\n`);

  // Show details of duplicates
  if (results.details.length > 0) {
    console.log('📋 Duplicate Details:');
    console.log('='.repeat(80));
    results.details.slice(0, 20).forEach((detail, index) => {
      console.log(`\n${index + 1}. Email: ${detail.email}`);
      console.log(`   ✅ KEEP: ${detail.kept.collection}/${detail.kept.id} - ${detail.kept.displayName}`);
      console.log(`   ❌ REMOVE: ${detail.removed.collection}/${detail.removed.id} - ${detail.removed.displayName}`);
    });
    if (results.details.length > 20) {
      console.log(`\n   ... and ${results.details.length - 20} more duplicates`);
    }
    console.log('\n' + '='.repeat(80) + '\n');
  }

  // Step 3: Delete duplicates (if not dry run)
  if (!dryRun && recordsToDelete.length > 0) {
    let batchCount = 0;
    const maxBatchSize = 500;
    let currentBatch = db.batch();

    for (const record of recordsToDelete) {
      try {
        const docRef = db.collection(record.collection).doc(record.id);
        
        // Mark as inactive instead of deleting
        // Use FieldValue.serverTimestamp() for server-side timestamp
        currentBatch.update(docRef, {
          isActive: false,
          deletedAt: FieldValue.serverTimestamp(),
          deletedReason: 'Duplicate user cleanup'
        });
        
        batchCount++;
        results.duplicatesRemoved++;

        if (batchCount >= maxBatchSize) {
          await currentBatch.commit();
          console.log(`💾 Committed batch of ${batchCount} updates`);
          batchCount = 0;
          currentBatch = db.batch(); // Create new batch
        }
      } catch (error) {
        console.error(`❌ Error updating ${record.collection}/${record.id}:`, error.message);
        results.errors.push(`Failed to update ${record.collection}/${record.id}: ${error.message}`);
      }
    }

    if (batchCount > 0) {
      try {
        await currentBatch.commit();
        console.log(`💾 Committed final batch of ${batchCount} updates`);
      } catch (error) {
        console.error(`❌ Error committing final batch:`, error.message);
        results.errors.push(`Failed to commit final batch: ${error.message}`);
      }
    }

    console.log(`✅ Marked ${results.duplicatesRemoved} duplicate records as inactive`);
  } else if (dryRun) {
    console.log(`🔍 DRY RUN - No records were modified`);
    console.log(`   Run without --dry-run flag to apply changes`);
  }

  results.endTime = new Date().toISOString();

  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log(`   Organization: ${organizationId}`);
  console.log(`   Total Emails: ${allUsers.size}`);
  console.log(`   Emails with Duplicates: ${Array.from(allUsers.entries()).filter(([_, records]) => records.length > 1).length}`);
  console.log(`   Duplicates Found (by email): ${results.duplicatesFound}`);
  if (nameDuplicates.length > 0) {
    console.log(`   Name-based Duplicates (same name, different emails): ${nameDuplicates.length}`);
  }
  console.log(`   Duplicates Removed: ${results.duplicatesRemoved}`);
  console.log(`   Records to Keep: ${recordsToKeep.length}`);
  console.log(`   Records to Delete: ${recordsToDelete.length}`);
  console.log('='.repeat(80));
  
  // Add name-based duplicates to results
  results.nameBasedDuplicates = nameDuplicates.length;
  results.nameDuplicatesDetails = nameDuplicates.slice(0, 20); // Limit for response size

  return results;
}

// Main execution
const organizationId = process.argv[2];
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
const alsoCleanNameDuplicates = process.argv.includes('--clean-name-duplicates') || process.argv.includes('--clean-names');

if (!organizationId) {
  console.error('❌ Organization ID is required');
  console.error('\nUsage:');
  console.error('  node scripts/cleanup-duplicate-users.cjs <organizationId> [options]');
  console.error('\nOptions:');
  console.error('  --dry-run              Run in dry-run mode (no changes, default)');
  console.error('  --clean-name-duplicates  Also clean name-based duplicates (same name, different emails)');
  console.error('\nExamples:');
  console.error('  node scripts/cleanup-duplicate-users.cjs clip-show-pro-productions --dry-run');
  console.error('  node scripts/cleanup-duplicate-users.cjs clip-show-pro-productions --clean-name-duplicates --dry-run');
  console.error('  node scripts/cleanup-duplicate-users.cjs clip-show-pro-productions --clean-name-duplicates');
  process.exit(1);
}

cleanupDuplicateUsers(organizationId, dryRun, alsoCleanNameDuplicates)
  .then(() => {
    console.log('\n✅ Cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });

