/**
 * Licensing Context Service
 * 
 * Aggregates license context from Licensing website
 * Follows the same query patterns as the Licensing frontend
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface LicensingContext {
  activeLicenses: number;
  totalLicenses: number;
  licenses: Array<{
    id: string;
    type: string;
    status: string;
    assignedTo?: string; // userId or email
    expiresAt?: string;
    createdAt?: string;
  }>;
}

/**
 * Gather Licensing context for an organization
 * Queries licenses collection using the same pattern as Licensing app
 */
export async function gatherLicensingContext(
  organizationId: string
): Promise<LicensingContext> {
  // Query licenses using the same pattern as Licensing functions
  // Pattern: db.collection('licenses').where('organizationId', '==', organizationId)
  const licensesSnapshot = await db
    .collection('licenses')
    .where('organizationId', '==', organizationId)
    .get();

  const licenses = licensesSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      type: data.type || 'unknown',
      status: data.status || 'unknown',
      assignedTo: data.userId || data.email || data.assignedTo,
      expiresAt: data.expiresAt?.toDate?.()?.toISOString(),
      createdAt: data.createdAt?.toDate?.()?.toISOString()
    };
  });

  // Filter active licenses
  const activeLicenses = licenses.filter(l => 
    l.status === 'active' || 
    l.status === 'Active' ||
    l.status === 'ACTIVE'
  );

  return {
    activeLicenses: activeLicenses.length,
    totalLicenses: licenses.length,
    licenses
  };
}
