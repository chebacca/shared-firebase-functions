import * as admin from 'firebase-admin';

export class InventoryActions {
    /**
     * Checks out an asset to a user
     */
    static async checkoutAsset(assetId: string, userId: string, organizationId: string): Promise<any> {
        console.log(`📦 [ACTION] Checkout Asset ${assetId} to ${userId}`);
        try {
            const db = admin.firestore();
            const assetRef = db.collection('inventory_items').doc(assetId);
            const itemsCollection = db.collection('inventory_items');

            // Allow searching by name if assetId is mostly letters
            let finalAssetRef = assetRef;
            let assetData: any = null;

            const directDoc = await assetRef.get();
            if (directDoc.exists) {
                assetData = directDoc.data();
            } else {
                // Try search
                const search = await itemsCollection
                    .where('organizationId', '==', organizationId)
                    .where('name', '==', assetId) // Exact match for now
                    .limit(1)
                    .get();
                if (!search.empty) {
                    finalAssetRef = search.docs[0].ref;
                    assetData = search.docs[0].data();
                }
            }

            if (!assetData) return { success: false, error: `Asset '${assetId}' not found.` };
            if (assetData.status === 'checked_out') return { success: false, error: `Asset is already checked out to ${assetData.currentHolderId}` };

            await finalAssetRef.update({
                status: 'checked_out',
                currentHolderId: userId,
                lastCheckoutDate: admin.firestore.Timestamp.now(),
                history: admin.firestore.FieldValue.arrayUnion({
                    action: 'checkout',
                    userId: userId,
                    date: admin.firestore.Timestamp.now()
                })
            });

            return {
                success: true,
                data: {
                    message: `Successfully checked out '${assetData.name}'.`,
                    assetId: finalAssetRef.id,
                    status: 'checked_out'
                }
            };
        } catch (error: any) {
            console.error('❌ [ACTION] Error checking out asset:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Checks in an asset
     */
    static async checkinAsset(assetId: string, userId: string, organizationId: string): Promise<any> {
        console.log(`📦 [ACTION] Checkin Asset ${assetId}`);
        try {
            const db = admin.firestore();
            const assetRef = db.collection('inventory_items').doc(assetId);
            // (Simplified logic for MVP - similar search logic as above would be better for consistency)

            await assetRef.update({
                status: 'available',
                currentHolderId: null,
                lastCheckinDate: admin.firestore.Timestamp.now(),
                history: admin.firestore.FieldValue.arrayUnion({
                    action: 'checkin',
                    userId: userId,
                    date: admin.firestore.Timestamp.now()
                })
            });

            return {
                success: true,
                data: {
                    message: `Successfully checked in asset.`,
                    assetId: assetId,
                    status: 'available'
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
