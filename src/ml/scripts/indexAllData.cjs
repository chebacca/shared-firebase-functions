#!/usr/bin/env node
/**
 * Batch Indexing CLI Tool
 * 
 * Indexes all data for semantic search with strict tenant isolation.
 * Usage:
 *   node indexAllData.cjs --collection projects --org org-123
 *   node indexAllData.cjs --collection all --org all --admin
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../../../..', 'backbone-logic-firebase-adminsdk-fbsvc-3db30f4742.json');

try {
  if (require('fs').existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Use default credentials
    admin.initializeApp();
  }
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
  process.exit(1);
}

const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  const key = args[i]?.replace('--', '');
  const value = args[i + 1];
  if (key && value) {
    options[key] = value;
  }
}

const collection = options.collection;
const orgId = options.org;
const isAdmin = options.admin === 'true' || options.admin === true;
const dryRun = options['dry-run'] === 'true' || options['dry-run'] === true;

if (!collection) {
  console.error('Error: --collection is required');
  console.log('Usage: node indexAllData.cjs --collection <collection> --org <orgId> [--admin] [--dry-run]');
  process.exit(1);
}

if (!orgId) {
  console.error('Error: --org is required');
  console.log('Usage: node indexAllData.cjs --collection <collection> --org <orgId> [--admin] [--dry-run]');
  process.exit(1);
}

async function indexCollection(collectionName, organizationId) {
  console.log(`\n📊 Indexing ${collectionName} for organization ${organizationId}...`);

  try {
    // Validate organization exists
    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    if (!orgDoc.exists && organizationId !== 'all') {
      throw new Error(`Organization ${organizationId} not found`);
    }

    // Get documents for this organization
    const snapshot = await db
      .collection(collectionName)
      .where('organizationId', '==', organizationId)
      .get();

    console.log(`Found ${snapshot.size} documents to index`);

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No documents will be indexed');
      return;
    }

    // Call the batchIndexCollection function
    // Note: In a real implementation, you would call the Firebase Function
    // For now, we'll use the service directly
    const { getDataIndexingService } = require('../DataIndexingService');
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('Error: GEMINI_API_KEY environment variable is required');
      process.exit(1);
    }

    const indexingService = getDataIndexingService(apiKey);
    const job = await indexingService.indexCollection(collectionName, organizationId, {
      batchSize: 50,
      rateLimit: 10,
      dryRun: false
    });

    console.log(`✅ Indexing completed:`);
    console.log(`   - Total: ${job.totalDocuments}`);
    console.log(`   - Indexed: ${job.indexedDocuments}`);
    console.log(`   - Failed: ${job.failedDocuments}`);
    console.log(`   - Status: ${job.status}`);

    if (job.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      job.errors.slice(0, 10).forEach(err => {
        console.log(`   - ${err.docId}: ${err.error}`);
      });
      if (job.errors.length > 10) {
        console.log(`   ... and ${job.errors.length - 10} more errors`);
      }
    }
  } catch (error) {
    console.error(`❌ Error indexing ${collectionName}:`, error.message);
    throw error;
  }
}

async function main() {
  const collections = collection === 'all' 
    ? ['projects', 'teamMembers', 'contacts', 'inventoryItems']
    : [collection];

  const organizations = orgId === 'all'
    ? await getAllOrganizations()
    : [orgId];

  if (orgId === 'all' && !isAdmin) {
    console.error('Error: --org all requires --admin flag');
    process.exit(1);
  }

  console.log(`🚀 Starting batch indexing...`);
  console.log(`   Collections: ${collections.join(', ')}`);
  console.log(`   Organizations: ${organizations.length}`);
  console.log(`   Dry Run: ${dryRun ? 'Yes' : 'No'}`);

  for (const org of organizations) {
    for (const coll of collections) {
      await indexCollection(coll, org);
    }
  }

  console.log(`\n✅ Batch indexing completed!`);
}

async function getAllOrganizations() {
  const snapshot = await db.collection('organizations').get();
  return snapshot.docs.map(doc => doc.id);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

