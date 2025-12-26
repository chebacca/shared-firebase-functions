import express from 'express';
import { db } from '../shared/utils';
import { authenticateToken } from '../shared/middleware';
import { FieldValue } from 'firebase-admin/firestore';

const router = express.Router();

// Get workflow instance for a session
router.get('/:sessionId/workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const { sessionId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const workflowSnapshot = await db.collection('unifiedWorkflowInstances')
            .where('sessionId', '==', sessionId)
            .where('organizationId', '==', organizationId)
            .limit(1)
            .get();

        if (workflowSnapshot.empty) {
            return res.status(404).json({ success: false, error: 'Workflow instance not found' });
        }

        const workflowDoc = workflowSnapshot.docs[0];
        return res.status(200).json({ success: true, data: { id: workflowDoc.id, ...workflowDoc.data() } });
    } catch (error: any) {
        console.error(`❌ [WORKFLOW API] Error in GET /:sessionId/workflow:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch workflow instance', errorDetails: error.message });
    }
});

// Get steps for a session
router.get('/:sessionId/steps', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const { sessionId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        let query: any = db.collection('unifiedSessionSteps')
            .where('sessionId', '==', sessionId)
            .where('organizationId', '==', organizationId);

        if (req.query.status) query = query.where('status', '==', req.query.status);
        if (req.query.assignedUserId) query = query.where('assignedUserId', '==', req.query.assignedUserId);

        const snapshot = await query.orderBy('order', 'asc').get();
        const steps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ success: true, data: steps, count: steps.length });
    } catch (error: any) {
        console.error(`❌ [WORKFLOW API] Error in GET /:sessionId/steps:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch workflow steps', errorDetails: error.message });
    }
});

// Create workflow instance
router.post('/:sessionId/workflow', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const { sessionId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const { workflowDiagramId, name, description, workflowPhase = 'PRODUCTION', status = 'ACTIVE' } = req.body;
        if (!workflowDiagramId || !name) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const workflowData = {
            sessionId,
            workflowDiagramId,
            name,
            description: description || '',
            workflowPhase,
            status,
            organizationId,
            createdByUserId: req.user?.uid,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        };

        const workflowRef = await db.collection('unifiedWorkflowInstances').add(workflowData);
        return res.status(201).json({ success: true, data: { id: workflowRef.id, ...workflowData } });
    } catch (error: any) {
        console.error(`❌ [WORKFLOW API] Error in POST /:sessionId/workflow:`, error);
        return res.status(500).json({ success: false, error: 'Failed to create workflow', errorDetails: error.message });
    }
});

// Get workflow templates
router.get('/templates', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const organizationId = req.user?.organizationId;
        const templatesSnapshot = await db.collection('workflowTemplates').where('organizationId', '==', organizationId).get();
        const templates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.status(200).json({ success: true, data: templates });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Failed to fetch templates', errorDetails: error.message });
    }
});

export default router;
