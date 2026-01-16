/**
 * Bridge Context Service
 * 
 * Aggregates NLE source folder context from Bridge app
 * Follows the same query patterns as the Bridge frontend
 */

import { getFirestore } from 'firebase-admin/firestore';

// Initialize getDb() lazily
const getDb = () => getFirestore();

export interface BridgeContext {
  activeFolders: number;
  folders: Array<{
    id: string;
    name: string;
    path: string;
    show?: string;
    deviceName?: string;
    isActive?: boolean;
  }>;
}

/**
 * Gather Bridge context for an organization
 * Queries nleSourceFolders subcollection using the same pattern as Bridge app
 */
export async function gatherBridgeContext(
  organizationId: string
): Promise<BridgeContext> {
  // Query folders using the same pattern as Bridge FirebaseNLESourceFolderService
  // Pattern: organizations/{orgId}/nleSourceFolders (subcollection)
  const foldersSnapshot = await getDb()
    .collection(`organizations/${organizationId}/nleSourceFolders`)
    .get();

  const folders = foldersSnapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || 'Untitled Folder',
      path: data.path || '',
      show: data.show,
      deviceName: data.deviceName,
      isActive: data.isActive !== false // Default to true if not specified
    };
  });

  // Filter active folders
  const activeFolders = folders.filter(f => f.isActive !== false);

  return {
    activeFolders: activeFolders.length,
    folders
  };
}
