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
        .collection('inventory')
        .where('organizationId', '==', organizationId)
        .get();

    let checkedOutCount = 0;
    let availableCount = 0;
    let lowStockCount = 0;

    const items = inventorySnapshot.docs.map(doc => {
        const data = doc.data();

        // Normalize status
        const status = (data.status || 'available').toLowerCase();

        if (status === 'checked_out' || status === 'checkedout' || data.isCheckedOut) {
            checkedOutCount++;
        } else if (status === 'available') {
            availableCount++;
        }

        if (data.quantity !== undefined && data.minQuantity !== undefined && data.quantity <= data.minQuantity) {
            lowStockCount++;
        }

        return {
            id: doc.id,
            name: data.name || data.itemName || 'Unnamed Item',
            category: data.category || 'Uncategorized',
            status: status,
            assignedTo: data.checkedOutTo || data.assignedTo,
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
