import { Router, Request, Response } from 'express';
import { db } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';
import { FieldValue } from 'firebase-admin/firestore';

const router: Router = Router();

// Get active production sessions
router.get('/active', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const activeStatuses = ['PRODUCTION_IN_PROGRESS', 'IN_PROGRESS', 'ACTIVE'];
        const sessionsSnapshot = await db.collection('sessions')
            .where('organizationId', '==', organizationId)
            .where('status', 'in', activeStatuses)
            .get();

        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ success: true, sessions, count: sessions.length });
    } catch (error: any) {
        console.error(`❌ [PRODUCTION API] Error in GET /active:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch active production sessions', errorDetails: error.message });
    }
});

// Get production crew
router.get('/crew', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const assignmentsSnapshot = await db.collection('sessionAssignments')
            .where('organizationId', '==', organizationId)
            .get();

        const crewMap = new Map();
        for (const assignmentDoc of assignmentsSnapshot.docs) {
            const assignmentData = assignmentDoc.data();
            if (assignmentData.userId && !crewMap.has(assignmentData.userId)) {
                const userDoc = await db.collection('users').doc(assignmentData.userId).get();
                if (userDoc.exists) {
                    crewMap.set(assignmentData.userId, { id: userDoc.id, ...userDoc.data() });
                }
            }
        }

        return res.status(200).json({ success: true, crew: Array.from(crewMap.values()), count: crewMap.size });
    } catch (error: any) {
        console.error(`❌ [PRODUCTION API] Error in GET /crew:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch production crew', errorDetails: error.message });
    }
});

// Get production dashboard data
router.get('/dashboard', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const [sessionsSnapshot, tasksSnapshot, crewSnapshot] = await Promise.all([
            db.collection('sessions').where('organizationId', '==', organizationId).get(),
            db.collection('productionTasks').where('organizationId', '==', organizationId).get(),
            db.collection('sessionAssignments').where('organizationId', '==', organizationId).get()
        ]);

        const sessions = sessionsSnapshot.docs.map(doc => doc.data());
        const tasks = tasksSnapshot.docs.map(doc => doc.data());

        const dashboard = {
            sessions: {
                total: sessions.length,
                byStatus: {
                    active: sessions.filter((s: any) => ['PRODUCTION_IN_PROGRESS', 'IN_PROGRESS', 'ACTIVE'].includes(s.status)).length,
                    planned: sessions.filter((s: any) => ['PLANNED', 'READY', 'PREP'].includes(s.status)).length,
                    completed: sessions.filter((s: any) => ['COMPLETED', 'DONE'].includes(s.status)).length
                }
            },
            tasks: {
                total: tasks.length,
                byStatus: {
                    pending: tasks.filter((t: any) => t.status === 'pending').length,
                    inProgress: tasks.filter((t: any) => t.status === 'in_progress').length,
                    completed: tasks.filter((t: any) => t.status === 'completed').length
                }
            },
            crew: {
                total: new Set(crewSnapshot.docs.map(doc => doc.data().userId)).size
            }
        };

        return res.status(200).json({ success: true, data: dashboard });
    } catch (error: any) {
        console.error(`❌ [PRODUCTION API] Error in GET /dashboard:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch production dashboard', errorDetails: error.message });
    }
});

// Get production equipment
router.get('/equipment', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const equipmentSnapshot = await db.collection('productionEquipment')
            .where('organizationId', '==', organizationId)
            .get();

        const equipment = equipmentSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ success: true, equipment });
    } catch (error: any) {
        console.error(`❌ [PRODUCTION API] Error in GET /equipment:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch production equipment', errorDetails: error.message });
    }
});

export default router;
