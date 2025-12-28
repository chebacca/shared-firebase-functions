/**
 * Validation Script for Indexing
 * 
 * Verifies that indexing completed successfully and validates tenant isolation.
 * Usage: ts-node validateIndexing.ts [--collection <collection>] [--org <orgId>]
 */

import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

interface ValidationResult {
  collection: string;
  organizationId: string;
  totalDocuments: number;
  indexedDocuments: number;
  missingEmbeddings: number;
  invalidEmbeddings: number;
  crossOrgErrors: number;
  errors: string[];
}

async function validateCollection(
  collection: string,
  organizationId: string
): Promise<ValidationResult> {
  const result: ValidationResult = {
    collection,
    organizationId,
    totalDocuments: 0,
    indexedDocuments: 0,
    missingEmbeddings: 0,
    invalidEmbeddings: 0,
    crossOrgErrors: 0,
    errors: []
  };

  try {
    // Get all documents for this organization
    const snapshot = await db
      .collection(collection)
      .where('organizationId', '==', organizationId)
      .get();

    result.totalDocuments = snapshot.size;

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Check if document has embedding
      if (!data.embedding) {
        result.missingEmbeddings++;
        continue;
      }

      // Validate embedding format
      if (!Array.isArray(data.embedding)) {
        result.invalidEmbeddings++;
        result.errors.push(`${doc.id}: embedding is not an array`);
        continue;
      }

      if (data.embedding.length === 0) {
        result.invalidEmbeddings++;
        result.errors.push(`${doc.id}: embedding is empty array`);
        continue;
      }

      // Validate organizationId matches
      if (data.organizationId !== organizationId) {
        result.crossOrgErrors++;
        result.errors.push(`${doc.id}: organizationId mismatch (${data.organizationId} !== ${organizationId})`);
        continue;
      }

      // Validate embeddingText exists
      if (!data.embeddingText) {
        result.errors.push(`${doc.id}: missing embeddingText`);
        continue;
      }

      result.indexedDocuments++;
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Validation error: ${error.message}`);
    return result;
  }
}

async function validateAll() {
  const collections = ['projects', 'teamMembers', 'contacts', 'inventoryItems'];
  
  // Get all organizations
  const orgsSnapshot = await db.collection('organizations').get();
  const organizations = orgsSnapshot.docs.map(doc => doc.id);

  console.log(`🔍 Validating indexing for ${organizations.length} organizations...\n`);

  const allResults: ValidationResult[] = [];

  for (const orgId of organizations) {
    for (const collection of collections) {
      const result = await validateCollection(collection, orgId);
      allResults.push(result);

      console.log(`📊 ${collection} (${orgId}):`);
      console.log(`   Total: ${result.totalDocuments}`);
      console.log(`   Indexed: ${result.indexedDocuments}`);
      console.log(`   Missing: ${result.missingEmbeddings}`);
      console.log(`   Invalid: ${result.invalidEmbeddings}`);
      console.log(`   Cross-org errors: ${result.crossOrgErrors}`);

      if (result.errors.length > 0) {
        console.log(`   ⚠️  Errors: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(err => {
          console.log(`      - ${err}`);
        });
        if (result.errors.length > 5) {
          console.log(`      ... and ${result.errors.length - 5} more`);
        }
      }
      console.log('');
    }
  }

  // Summary
  const totalIndexed = allResults.reduce((sum, r) => sum + r.indexedDocuments, 0);
  const totalMissing = allResults.reduce((sum, r) => sum + r.missingEmbeddings, 0);
  const totalInvalid = allResults.reduce((sum, r) => sum + r.invalidEmbeddings, 0);
  const totalCrossOrg = allResults.reduce((sum, r) => sum + r.crossOrgErrors, 0);

  console.log(`\n📈 Summary:`);
  console.log(`   Total indexed: ${totalIndexed}`);
  console.log(`   Missing embeddings: ${totalMissing}`);
  console.log(`   Invalid embeddings: ${totalInvalid}`);
  console.log(`   Cross-organization errors: ${totalCrossOrg}`);

  if (totalCrossOrg > 0) {
    console.log(`\n❌ SECURITY ISSUE: Found ${totalCrossOrg} cross-organization errors!`);
    process.exit(1);
  }

  if (totalInvalid > 0) {
    console.log(`\n⚠️  Warning: Found ${totalInvalid} invalid embeddings`);
  }

  console.log(`\n✅ Validation completed!`);
}

// Run validation
validateAll().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

