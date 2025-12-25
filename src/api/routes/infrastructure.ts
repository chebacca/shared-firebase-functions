import express from 'express';
import { db } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';

const router = express.Router();

// ====================
// Network IP API
// ====================

// Handle OPTIONS for network-ip
router.options('/ip-assignments', (req: express.Request, res: express.Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

// Get all network IP assignments
router.get('/ip-assignments', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        console.log('🌐 [NETWORK IP API] Fetching all network IP assignments...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let ipQuery: any = db.collection('networkIPAssignments');
        if (organizationId) {
            ipQuery = ipQuery.where('organizationId', '==', organizationId);
        }

        const ipSnapshot = await ipQuery.get();
        const ipAssignments = ipSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ [NETWORK IP API] Found ${ipAssignments.length} IP assignments`);
        return res.status(200).json({
            success: true,
            data: ipAssignments,
            total: ipAssignments.length
        });
    } catch (error: any) {
        console.error('❌ [NETWORK IP API] Error fetching network IP assignments:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch network IP assignments',
            errorDetails: error.message || String(error)
        });
    }
});

// ====================
// Networks API
// ====================

router.options('/networks', (req: express.Request, res: express.Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.get('/networks', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        console.log('🌐 [NETWORKS API] Fetching all networks...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let networksQuery: any = db.collection('networks');
        if (organizationId) {
            networksQuery = networksQuery.where('organizationId', '==', organizationId);
        }

        const networksSnapshot = await networksQuery.get();
        const networks = networksSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ [NETWORKS API] Found ${networks.length} networks`);
        return res.status(200).json({
            success: true,
            data: networks,
            total: networks.length
        });
    } catch (error: any) {
        console.error('❌ [NETWORKS API] Error fetching networks:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch networks',
            errorDetails: error.message || String(error)
        });
    }
});

// ====================
// Inventory API
// ====================

router.options('/inventory', (req: express.Request, res: express.Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.get('/inventory', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        console.log('📦 [INVENTORY API] Fetching all inventory items...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let inventoryQuery: any = db.collection('inventoryItems');
        if (organizationId) {
            inventoryQuery = inventoryQuery.where('organizationId', '==', organizationId);
        }

        const searchQuery = req.query.search as string;
        const inventorySnapshot = await inventoryQuery.get();
        let inventoryItems = inventorySnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            inventoryItems = inventoryItems.filter((item: any) => {
                const name = (item.name || '').toLowerCase();
                const type = (item.type || '').toLowerCase();
                const status = (item.status || '').toLowerCase();
                const department = (item.department || '').toLowerCase();
                return name.includes(searchLower) ||
                    type.includes(searchLower) ||
                    status.includes(searchLower) ||
                    department.includes(searchLower);
            });
        }

        console.log(`✅ [INVENTORY API] Found ${inventoryItems.length} inventory items`);
        return res.status(200).json({
            success: true,
            data: inventoryItems,
            total: inventoryItems.length
        });
    } catch (error: any) {
        console.error('❌ [INVENTORY API] Error fetching inventory items:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch inventory items',
            errorDetails: error.message || String(error)
        });
    }
});

router.get('/inventory/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const inventoryDoc = await db.collection('inventoryItems').doc(id).get();

        if (!inventoryDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Inventory item not found'
            });
        }

        const inventoryItem = {
            id: inventoryDoc.id,
            ...inventoryDoc.data()
        };

        return res.status(200).json({
            success: true,
            data: inventoryItem
        });
    } catch (error: any) {
        console.error('❌ [INVENTORY API] Error fetching inventory item:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch inventory item',
            errorDetails: error.message || String(error)
        });
    }
});

// ====================
// Schemas API
// ====================

router.options('/schemas', (req: express.Request, res: express.Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.get('/schemas', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        console.log('📋 [SCHEMAS API] Fetching all schemas...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let schemasQuery: any = db.collection('schemas');
        if (organizationId) {
            schemasQuery = schemasQuery.where('organizationId', '==', organizationId);
        }

        const schemasSnapshot = await schemasQuery.get();
        const schemas = schemasSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ [SCHEMAS API] Found ${schemas.length} schemas`);
        return res.status(200).json({
            success: true,
            data: schemas,
            total: schemas.length
        });
    } catch (error: any) {
        console.error('❌ [SCHEMAS API] Error fetching schemas:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch schemas',
            errorDetails: error.message || String(error)
        });
    }
});

export default router;
