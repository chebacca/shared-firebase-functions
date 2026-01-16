import { Router, Request, Response } from 'express';
import { db } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';

const router: Router = Router();

// ====================
// Server Management API
// ====================

// Handle OPTIONS
router.options('/', (req: Request, res: Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

// GET all servers
router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
        console.log('🖥️ [SERVER API] Fetching all servers...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let query: any = db.collection('servers');
        if (organizationId) {
            query = query.where('organizationId', '==', organizationId);
        }

        // Optional filtering by type or status
        if (req.query.type) query = query.where('type', '==', req.query.type);
        if (req.query.status) query = query.where('status', '==', req.query.status);

        const snapshot = await query.get();
        const servers = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ [SERVER API] Found ${servers.length} servers`);
        return res.status(200).json({
            success: true,
            data: servers,
            total: servers.length
        });
    } catch (error: any) {
        console.error('❌ [SERVER API] Error fetching servers:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch servers',
            errorDetails: error.message || String(error)
        });
    }
});

// GET single server
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('servers').doc(id as string).get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: { id: doc.id, ...doc.data() }
        });
    } catch (error: any) {
        console.error('❌ [SERVER API] Error fetching server:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch server',
            errorDetails: error.message || String(error)
        });
    }
});

// POST create server
router.post('/', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        const serverData = {
            ...req.body,
            organizationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: req.user?.uid
        };

        // Basic validation
        if (!serverData.name) {
            return res.status(400).json({
                success: false,
                error: 'Server name is required'
            });
        }

        const docRef = await db.collection('servers').add(serverData);
        console.log(`✅ [SERVER API] Created server with ID: ${docRef.id}`);

        return res.status(201).json({
            success: true,
            data: { id: docRef.id, ...serverData }
        });
    } catch (error: any) {
        console.error('❌ [SERVER API] Error creating server:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create server',
            errorDetails: error.message || String(error)
        });
    }
});

// PUT update server
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const organizationId = req.user?.organizationId;

        const docRef = db.collection('servers').doc(id as string);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }

        // Verify organization ownership
        if (doc.data()?.organizationId !== organizationId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized access to this server'
            });
        }

        const updateData = {
            ...req.body,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user?.uid
        };

        // Prevent updating critical fields if necessary (e.g., organizationId)
        delete updateData.organizationId;
        delete updateData.id;

        await docRef.update(updateData);
        console.log(`✅ [SERVER API] Updated server: ${id}`);

        return res.status(200).json({
            success: true,
            data: { id, ...doc.data(), ...updateData }
        });
    } catch (error: any) {
        console.error('❌ [SERVER API] Error updating server:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update server',
            errorDetails: error.message || String(error)
        });
    }
});

// DELETE server
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const organizationId = req.user?.organizationId;

        const docRef = db.collection('servers').doc(id as string);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Server not found'
            });
        }

        if (doc.data()?.organizationId !== organizationId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized to delete this server'
            });
        }

        await docRef.delete();
        console.log(`✅ [SERVER API] Deleted server: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Server deleted successfully'
        });
    } catch (error: any) {
        console.error('❌ [SERVER API] Error deleting server:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete server',
            errorDetails: error.message || String(error)
        });
    }
});

export default router;
