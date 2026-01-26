/**
 * Inventory Context Service
 * 
 * Aggregates inventory context from IWM (Inventory Warehouse Management)
 */

import { getFirestore } from 'firebase-admin/firestore';

// Initialize getDb() lazily
const getDb = () => getFirestore();

export interface InventoryContext {
    totalItems: number;
    checkedOutItems: number;
    availableItems: number;
    lowStockItems: number;
    items: Array<{
        id: string;
        name: string;
        category: string;
        status: string; // 'available', 'checked_out', 'maintenance', 'lost'
        assignedTo?: string; // userId if checked out
        location?: string;
    }>;
}

/**
 * Gather Inventory context for an organization
 */
export async function gatherInventoryContext(
    organizationId: string
): Promise<InventoryContext> {
    const inventorySnapshot = await getDb()
        .collection('inventoryItems')
        .where('organizationId', '==', organizationId)
        .get();

    let checkedOutCount = 0;
    let availableCount = 0;
    let lowStockCount = 0;

    const items = inventorySnapshot.docs.map(doc => {
        const data = doc.data();

        // Normalize status
        const rawStatus = (data.status || 'available').toUpperCase();
        let status = 'available';

        if (rawStatus === 'CHECKED_OUT' || rawStatus === 'CHECKEDOUT' || data.isCheckedOut) {
            status = 'checked_out';
            checkedOutCount++;
        } else if (rawStatus === 'ACTIVE' || rawStatus === 'AVAILABLE') {
            status = 'available';
            availableCount++;
        } else {
            status = rawStatus.toLowerCase();
        }

        if (data.quantity !== undefined && data.minQuantity !== undefined && data.quantity <= data.minQuantity) {
            lowStockCount++;
        }

        return {
            id: doc.id,
            name: data.name || data.itemName || 'Unnamed Item',
            category: data.category || 'Uncategorized',
            status: status,
            assignedTo: data.checkedOutBy || data.assignedTo,
            location: data.location || data.warehouseLocation
        };
    });

    return {
        totalItems: items.length,
        checkedOutItems: checkedOutCount,
        availableItems: availableCount,
        lowStockItems: lowStockCount,
        items
    };
}
