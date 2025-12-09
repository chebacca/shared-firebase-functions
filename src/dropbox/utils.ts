/**
 * Dropbox Integration Utilities
 * 
 * Helper functions for Dropbox integration, including migration-aware connection lookup
 */

import * as admin from 'firebase-admin';

/**
 * Get Dropbox connection from Firestore (checks new location first, falls back to old)
 * 
 * Migration-aware: Checks dropboxConnections first, then falls back to cloudIntegrations
 * for backward compatibility during migration period.
 */
export async function getDropboxConnection(
  organizationId: string,
  userId?: string
): Promise<admin.firestore.DocumentSnapshot | null> {
  // First, try new location: dropboxConnections
  const connectionsRef = admin.firestore()
    .collection('organizations')
    .doc(organizationId)
    .collection('dropboxConnections');

  // Try to find active organization-level connection
  const orgConnections = await connectionsRef
    .where('type', '==', 'organization')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (!orgConnections.empty) {
    console.log(`✅ [DropboxUtils] Found connection in new location (dropboxConnections)`);
    return orgConnections.docs[0];
  }

  // Try user-level connection if userId provided
  if (userId) {
    const userConnections = await connectionsRef
      .where('type', '==', 'user')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!userConnections.empty) {
      console.log(`✅ [DropboxUtils] Found user connection in new location (dropboxConnections)`);
      return userConnections.docs[0];
    }
  }

  // Fallback to old locations (for migration period)
  console.log(`⚠️ [DropboxUtils] No connection in new location, checking old locations...`);

  const oldLocations = [
    { collection: 'cloudIntegrations', docId: 'dropbox' },
  ];

  if (userId) {
    oldLocations.push({ collection: 'cloudIntegrations', docId: `dropbox_${userId}` });
  }

  for (const location of oldLocations) {
    const oldDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection(location.collection)
      .doc(location.docId)
      .get();

    if (oldDoc.exists) {
      console.log(`⚠️ [DropboxUtils] Found connection in old location: ${location.collection}/${location.docId} (migration needed)`);
      return oldDoc;
    }
  }

  return null;
}

/**
 * Check if connection is in old location (for migration awareness)
 */
export function isOldLocation(connection: admin.firestore.DocumentSnapshot): boolean {
  return connection.ref.parent.id === 'cloudIntegrations';
}

