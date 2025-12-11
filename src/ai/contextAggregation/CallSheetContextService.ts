/**
 * Call Sheet Context Service
 * 
 * Aggregates personnel context from Call Sheet app
 * Follows the same query patterns as the Call Sheet frontend
 */

import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

export interface CallSheetContext {
  activePersonnel: number;
  personnel: Array<{
    id: string;
    name: string;
    position: string;
    email: string;
    isActive?: boolean;
  }>;
}

/**
 * Gather Call Sheet context for an organization
 * Queries standalonePersonnel collection using the same pattern as Call Sheet app
 */
export async function gatherCallSheetContext(
  organizationId: string
): Promise<CallSheetContext> {
  // Query personnel using the same pattern as Call Sheet functions
  // Pattern: db.collection('standalonePersonnel').where('userId', '==', organizationId)
  // Note: In Call Sheet, personnel are linked to organization via userId field
  const personnelSnapshot = await db
    .collection('standalonePersonnel')
    .where('userId', '==', organizationId)
    .get();

  const personnel = personnelSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.fullName || data.displayName || 'Unknown',
      position: data.position || 'Crew',
      email: data.email || '',
      isActive: data.isActive !== false // Default to true if not specified
    };
  });

  // Filter active personnel
  const activePersonnel = personnel.filter(p => p.isActive !== false);

  return {
    activePersonnel: activePersonnel.length,
    personnel
  };
}
