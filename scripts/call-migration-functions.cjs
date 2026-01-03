/**
 * Script to call the deployed migration functions
 * 
 * Usage: node scripts/call-migration-functions.cjs [organizationId]
 */

const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDqJqJqJqJqJqJqJqJqJqJqJqJqJqJqJ",
  authDomain: "backbone-logic.firebaseapp.com",
  projectId: "backbone-logic",
};

async function callMigrationFunctions(organizationId, userEmail, userPassword) {
  try {
    console.log('🔥 Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const functions = getFunctions(app, 'us-central1');

    // Sign in (you'll need to provide credentials or use existing session)
    console.log('🔐 Signing in...');
    if (userEmail && userPassword) {
      await signInWithEmailAndPassword(auth, userEmail, userPassword);
    }

    const user = auth.currentUser;
    if (!user) {
      throw new Error('Not authenticated. Please sign in first or provide credentials.');
    }

    console.log(`✅ Authenticated as: ${user.email}`);

    // Call migration functions
    const migrateBoxTokens = httpsCallable(functions, 'migrateBoxTokens');
    const migrateDropboxTokens = httpsCallable(functions, 'migrateDropboxTokens');

    console.log(`\n📦 Migrating Box tokens for: ${organizationId}`);
    const boxResult = await migrateBoxTokens({ organizationId });
    console.log('Box migration result:', boxResult.data);

    console.log(`\n📦 Migrating Dropbox tokens for: ${organizationId}`);
    const dropboxResult = await migrateDropboxTokens({ organizationId });
    console.log('Dropbox migration result:', dropboxResult.data);

    console.log('\n✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

const organizationId = process.argv[2] || 'big-tree-productions';
const userEmail = process.argv[3];
const userPassword = process.argv[4];

if (require.main === module) {
  callMigrationFunctions(organizationId, userEmail, userPassword);
}

