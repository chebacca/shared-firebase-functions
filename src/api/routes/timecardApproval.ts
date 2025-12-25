import express from 'express';
import { authenticateToken } from '../../shared/middleware';
import {
    handlePendingApprovals,
    handleMySubmissions,
    handleApprovalHistory,
    handleDirectReports,
    handleMyManager,
    handleSubmitTimecard
} from '../../timecards/timecardApprovalApiHandlers';

const router = express.Router();

// Timecard approval endpoints
router.get('/pending', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        await handlePendingApprovals(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

router.get('/my-submissions', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        await handleMySubmissions(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

router.get('/history', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        await handleApprovalHistory(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

router.get('/direct-reports', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        await handleDirectReports(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

// Handle /direct-reports/all endpoint (alias for /direct-reports)
router.get('/direct-reports/all', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        await handleDirectReports(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

router.get('/my-manager', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }
        console.log(`⏰ [TIMECARD APPROVAL API] /my-manager called for user: ${userId}, org: ${userOrgId}`);
        await handleMyManager(req, res, userOrgId, userId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error in /my-manager route:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.uid,
            organizationId: req.user?.organizationId
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Submit timecard for approval
router.post('/:timecardId/submit', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user?.uid;
        const userOrgId = req.user?.organizationId;
        const timecardId = req.params.timecardId;

        if (!userId || !userOrgId) {
            res.status(401).json({ error: 'User authentication required' });
            return;
        }

        if (!timecardId) {
            res.status(400).json({ error: 'Timecard ID is required' });
            return;
        }

        console.log(`⏰ [TIMECARD APPROVAL API] POST /${timecardId}/submit called for user: ${userId}, org: ${userOrgId}`);
        await handleSubmitTimecard(req, res, userOrgId, userId, timecardId);
    } catch (error: any) {
        console.error('❌ [TIMECARD APPROVAL API] Error in /:timecardId/submit route:', {
            error: error.message,
            stack: error.stack,
            userId: req.user?.uid,
            organizationId: req.user?.organizationId,
            timecardId: req.params.timecardId
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

export default router;
