/**
 * Sync User Emails Script
 * 
 * Syncs email addresses from Firebase Auth to Firestore user documents
 * Ensures all user documents have the email field for consistency
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'backbone-logic';
  console.log(`🔧 Initializing Firebase Admin SDK with project: ${projectId}`);
  
  admin.initializeApp({
    projectId: projectId,
  });
}

const db = admin.firestore();

/**
 * Sync email addresses from Auth to Firestore
 */
async function syncUserEmails(targetEmail?: string) {
  try {
    console.log('🔄 Starting email synchronization...\n');

    let usersProcessed = 0;
    let usersUpdated = 0;
    let usersSkipped = 0;
    let errors = 0;

    // Get all users from Firebase Auth
    const listUsersResult = await admin.auth().listUsers();
    const authUsers = targetEmail 
      ? listUsersResult.users.filter(u => u.email === targetEmail)
      : listUsersResult.users;

    console.log(`📊 Found ${authUsers.length} users to process\n`);

    for (const userRecord of authUsers) {
      usersProcessed++;
      
      try {
        const uid = userRecord.uid;
        const email = userRecord.email;

        if (!email) {
          console.log(`⚠️  [${usersProcessed}/${authUsers.length}] User ${uid} has no email in Auth, skipping`);
          usersSkipped++;
          continue;
        }

        // Check teamMembers collection by userId field first (Firebase UID)
        let teamMembersQuery = await db.collection('teamMembers')
          .where('userId', '==', uid)
          .limit(1)
          .get();

        // If not found by userId, try by email
        if (teamMembersQuery.empty) {
          teamMembersQuery = await db.collection('teamMembers')
            .where('email', '==', email)
            .limit(1)
            .get();
        }

        if (teamMembersQuery.empty) {
          console.log(`⚠️  [${usersProcessed}/${authUsers.length}] ${email}: No teamMember document found, skipping`);
          usersSkipped++;
          continue;
        }

        const teamMemberDoc = teamMembersQuery.docs[0];
        const teamMemberData = teamMemberDoc.data();
        const currentEmail = teamMemberData?.email;

        if (currentEmail === email) {
          console.log(`✓  [${usersProcessed}/${authUsers.length}] ${email}: Email already synced`);
          usersSkipped++;
          continue;
        }

        // Update Firestore with email
        await teamMemberDoc.ref.update({
          email: email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`✅ [${usersProcessed}/${authUsers.length}] ${email}: Email synced to Firestore`);
        usersUpdated++;

      } catch (error) {
        console.error(`❌ Error processing user ${userRecord.uid}:`, error);
        errors++;
      }
    }

    console.log('\n📊 Synchronization Summary:');
    console.log(`   Total processed: ${usersProcessed}`);
    console.log(`   Updated: ${usersUpdated}`);
    console.log(`   Skipped: ${usersSkipped}`);
    console.log(`   Errors: ${errors}`);
    console.log('\n✅ Email synchronization complete!');

  } catch (error) {
    console.error('❌ Fatal error during synchronization:', error);
    process.exit(1);
  }
}

// Run the script
const targetEmail = process.argv[2];
if (targetEmail) {
  console.log(`🎯 Syncing specific user: ${targetEmail}\n`);
}

syncUserEmails(targetEmail)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

