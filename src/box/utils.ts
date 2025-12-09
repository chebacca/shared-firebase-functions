/**
 * Box Integration Utilities
 * 
 * Helper functions for Box integration, including migration-aware connection lookup
 */

import * as admin from 'firebase-admin';

/**
 * Get Box connection from Firestore (checks new location first, falls back to old)
 * 
 * Migration-aware: Checks boxConnections first, then falls back to cloudIntegrations
 * for backward compatibility during migration period.
 */
export async function getBoxConnection(
  organizationId: string,
  userId?: string
): Promise<admin.firestore.DocumentSnapshot | null> {
  // First, try new location: boxConnections
  const connectionsRef = admin.firestore()
    .collection('organizations')
    .doc(organizationId)
    .collection('boxConnections');

  // Try to find active organization-level connection
  const orgConnections = await connectionsRef
    .where('type', '==', 'organization')
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (!orgConnections.empty) {
    console.log(`✅ [BoxUtils] Found connection in new location (boxConnections)`);
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
      console.log(`✅ [BoxUtils] Found user connection in new location (boxConnections)`);
      return userConnections.docs[0];
    }
  }

  // Fallback to old locations (for migration period)
  console.log(`⚠️ [BoxUtils] No connection in new location, checking old locations...`);

  const oldLocations = [
    { collection: 'cloudIntegrations', docId: 'box' },
    { collection: 'cloudIntegrations', docId: 'box_org' },
  ];

  if (userId) {
    oldLocations.push({ collection: 'cloudIntegrations', docId: `box_${userId}` });
  }

  for (const location of oldLocations) {
    const oldDoc = await admin.firestore()
      .collection('organizations')
      .doc(organizationId)
      .collection(location.collection)
      .doc(location.docId)
      .get();

    if (oldDoc.exists) {
      console.log(`⚠️ [BoxUtils] Found connection in old location: ${location.collection}/${location.docId} (migration needed)`);
      return oldDoc;
    }
  }

  // Final fallback: global location (deprecated)
  const globalDoc = await admin.firestore()
    .collection('cloudIntegrations')
    .doc('box')
    .get();

  if (globalDoc.exists) {
    console.log(`⚠️ [BoxUtils] Found connection in global location (deprecated, migration needed)`);
    return globalDoc;
  }

  return null;
}

/**
 * Check if connection is in old location (for migration awareness)
 */
export function isOldLocation(connection: admin.firestore.DocumentSnapshot): boolean {
  return connection.ref.parent.id === 'cloudIntegrations';
}

