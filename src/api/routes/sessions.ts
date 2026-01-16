import { Router, Request, Response } from 'express';
import { db } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';
import { FieldValue } from 'firebase-admin/firestore';

const router: Router = Router();

// ====================
// Sessions API
// ====================

// Handle OPTIONS for sessions endpoints
router.options('/', (req: Request, res: Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.options('/tags', (req: Request, res: Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.options('/:id', (req: Request, res: Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

// Get all sessions
router.get('/', authenticateToken, async (req: Request, res: Response) => {
    try {
        console.log('📋 [SESSIONS API] Fetching all sessions...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        const {
            status,
            phase,
            assignee,
            startDate,
            endDate,
            search,
            page = '1',
            limit = '50',
            includeDeleted = 'false'
        } = req.query;

        // Build base query
        let sessionsQuery: any = db.collection('sessions')
            .where('organizationId', '==', organizationId);

        if (includeDeleted !== 'true') {
            sessionsQuery = sessionsQuery.where('isDeleted', '==', false);
        }

        if (status && status !== 'all') {
            const statuses = Array.isArray(status) ? status : [status];
            if (statuses.length === 1) {
                sessionsQuery = sessionsQuery.where('status', '==', statuses[0]);
            } else {
                sessionsQuery = sessionsQuery.where('status', 'in', statuses);
            }
        }

        if (phase && phase !== 'all') {
            sessionsQuery = sessionsQuery.where('phase', '==', phase);
        }

        if (startDate) {
            sessionsQuery = sessionsQuery.where('sessionDate', '>=', new Date(startDate as string));
        }
        if (endDate) {
            sessionsQuery = sessionsQuery.where('sessionDate', '<=', new Date(endDate as string));
        }

        sessionsQuery = sessionsQuery
            .orderBy('updatedAt', 'desc')
            .limit(parseInt(limit as string) || 50);

        const sessionsSnapshot = await sessionsQuery.get();
        let sessions = sessionsSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            sessionId: doc.id,
            ...doc.data()
        }));

        if (search) {
            const searchLower = (search as string).toLowerCase();
            sessions = sessions.filter((session: any) => {
                return (
                    session.name?.toLowerCase().includes(searchLower) ||
                    session.description?.toLowerCase().includes(searchLower) ||
                    session.notes?.toLowerCase().includes(searchLower)
                );
            });
        }

        if (assignee) {
            const assigneeSessions = await Promise.all(
                sessions.map(async (session: any) => {
                    const assignmentsSnapshot = await db.collection('sessionAssignments')
                        .where('sessionId', '==', session.id)
                        .where('userId', '==', assignee)
                        .get();
                    return assignmentsSnapshot.empty ? null : session;
                })
            );
            sessions = assigneeSessions.filter(Boolean);
        }

        const sessionsWithRelations = await Promise.all(
            sessions.map(async (session: any) => {
                const assignmentsSnapshot = await db.collection('sessionAssignments')
                    .where('sessionId', '==', session.id)
                    .get();

                const assignments = await Promise.all(
                    assignmentsSnapshot.docs.map(async (assignDoc: any) => {
                        const assignData = assignDoc.data();
                        const userDoc = await db.collection('users').doc(assignData.userId).get();
                        const roleDoc = assignData.roleId ? await db.collection('roles').doc(assignData.roleId).get() : null;

                        return {
                            id: assignDoc.id,
                            ...assignData,
                            user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
                            role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
                        };
                    })
                );

                const tasksSnapshot = await db.collection('tasks')
                    .where('sessionId', '==', session.id)
                    .get();

                const tasks = await Promise.all(
                    tasksSnapshot.docs.map(async (taskDoc: any) => {
                        const taskData = taskDoc.data();
                        const userDoc = taskData.assignedToUserId ? await db.collection('users').doc(taskData.assignedToUserId).get() : null;
                        const roleDoc = taskData.roleId ? await db.collection('roles').doc(taskData.roleId).get() : null;

                        return {
                            id: taskDoc.id,
                            ...taskData,
                            assignedToUser: userDoc?.exists ? { id: userDoc.id, ...userDoc.data() } : null,
                            role: roleDoc?.exists ? { id: roleDoc.id, ...roleDoc.data() } : null
                        };
                    })
                );

                const reviewsSnapshot = await db.collection('reviewSessions')
                    .where('sessionId', '==', session.id)
                    .get();

                const reviewSessions = reviewsSnapshot.docs.map((doc: any) => ({
                    id: doc.id,
                    ...doc.data()
                }));

                return {
                    ...session,
                    sessionAssignments: assignments,
                    postProductionTasks: tasks,
                    reviewSessions
                };
            })
        );

        const totalQuery = db.collection('sessions')
            .where('organizationId', '==', organizationId);
        if (includeDeleted !== 'true') {
            totalQuery.where('isDeleted', '==', false);
        }
        const totalSnapshot = await totalQuery.get();
        const total = totalSnapshot.size;

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 50;

        return res.status(200).json({
            success: true,
            sessions: sessionsWithRelations,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        console.error('❌ [SESSIONS API] Error fetching sessions:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch sessions',
            errorDetails: error.message || String(error)
        });
    }
});

// Get all session tags
router.get('/tags', authenticateToken, async (req: Request, res: Response) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        let tagsQuery: any = db.collection('mediaFileTags');
        tagsQuery = tagsQuery.where('organizationId', '==', organizationId);

        const tagsSnapshot = await tagsQuery.get();
        const tags = tagsSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        return res.status(200).json({
            success: true,
            data: tags,
            total: tags.length
        });
    } catch (error: any) {
        if (error.code === 'not-found' || error.message?.includes('not found')) {
            return res.status(200).json({ success: true, data: [], total: 0 });
        }
        console.error('❌ [SESSIONS TAGS API] Error fetching tags:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch tags', errorDetails: error.message });
    }
});

// Get session by ID
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
    try {
        const sessionId = req.params.id;
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({ success: false, error: 'User not associated with any organization' });
        }

        const sessionDoc = await db.collection('sessions').doc(sessionId as string).get();
        if (!sessionDoc.exists) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        const sessionData = sessionDoc.data();
        if (sessionData?.organizationId !== organizationId) {
            return res.status(403).json({ success: false, error: 'Access denied to session' });
        }

        return res.status(200).json({
            success: true,
            data: { id: sessionDoc.id, sessionId: sessionDoc.id, ...sessionData }
        });
    } catch (error: any) {
        console.error('❌ [SESSIONS API] Error fetching session:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch session', errorDetails: error.message });
    }
});

// Helper function to create session conversation
async function createSessionConversation(
    sessionId: string,
    organizationId: string,
    sessionName: string,
    createdBy: string
): Promise<void> {
    try {
        console.log(`💬 [SESSIONS API] Creating conversation for session: ${sessionId}`);

        const existingConversations = await db.collection('conversations')
            .where('organizationId', '==', organizationId)
            .where('sessionId', '==', sessionId)
            .limit(1)
            .get();

        if (!existingConversations.empty) {
            console.log(`ℹ️ [SESSIONS API] Conversation already exists for session ${sessionId}`);
            return;
        }

        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            console.warn(`⚠️ [SESSIONS API] Session ${sessionId} not found when creating conversation`);
            return;
        }

        const sessionData = sessionDoc.data();
        const participants = new Set<string>();

        if (createdBy && createdBy !== 'system') {
            participants.add(createdBy);
        }

        if (sessionData?.crewAssignments && Array.isArray(sessionData.crewAssignments)) {
            sessionData.crewAssignments.forEach((assignment: any) => {
                if (assignment.personId) participants.add(assignment.personId);
                if (assignment.userId) participants.add(assignment.userId);
            });
        }

        if (sessionData?.assignedTo && Array.isArray(sessionData.assignedTo)) {
            sessionData.assignedTo.forEach((userId: string) => {
                if (userId) participants.add(userId);
            });
        }

        const workflowStepsSnapshot = await db.collection('workflowSteps')
            .where('sessionId', '==', sessionId)
            .get();

        workflowStepsSnapshot.forEach((stepDoc) => {
            const stepData = stepDoc.data();
            if (stepData?.assignedUserId) {
                participants.add(stepData.assignedUserId);
            }
        });

        const stepIds = workflowStepsSnapshot.docs.map(doc => doc.id);
        if (stepIds.length > 0) {
            const batchSize = 10;
            for (let i = 0; i < stepIds.length; i += batchSize) {
                const batch = stepIds.slice(i, i + batchSize);
                const stepAssignmentsSnapshot = await db.collection('workflowStepAssignments')
                    .where('workflowStepId', 'in', batch)
                    .where('isActive', '==', true)
                    .get();

                stepAssignmentsSnapshot.forEach((assignmentDoc) => {
                    const assignmentData = assignmentDoc.data();
                    if (assignmentData?.userId) {
                        participants.add(assignmentData.userId);
                    }
                });
            }
        }

        const uniqueParticipants = Array.from(participants);
        if (uniqueParticipants.length === 0) {
            console.log(`ℹ️ [SESSIONS API] No participants found for session ${sessionId}, skipping conversation creation`);
            return;
        }

        const participantDetails: any[] = [];
        for (const participantId of uniqueParticipants) {
            try {
                const userDoc = await db.collection('users').doc(participantId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    participantDetails.push({
                        uid: participantId,
                        firebaseUid: participantId,
                        name: userData?.name || (userData?.firstName && userData?.lastName
                            ? `${userData.firstName} ${userData.lastName}`
                            : userData?.email || 'Unknown User'),
                        email: userData?.email || '',
                        avatar: userData?.avatar || userData?.photoURL || '',
                    });
                }
            } catch (userError) {
                console.warn(`⚠️ [SESSIONS API] Error fetching user ${participantId}:`, userError);
            }
        }

        const unreadCount: Record<string, number> = {};
        uniqueParticipants.forEach(uid => {
            unreadCount[uid] = 0;
        });

        const conversationData = {
            organizationId,
            type: 'group',
            participants: uniqueParticipants,
            participantDetails,
            name: `Session: ${sessionName}`,
            sessionId,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: createdBy || 'system',
            isArchived: false,
            unreadCount,
        };

        const conversationRef = await db.collection('conversations').add(conversationData);
        console.log(`✅ [SESSIONS API] Created conversation ${conversationRef.id} for session ${sessionId}`);

        const messageData = {
            conversationId: conversationRef.id,
            senderId: 'system',
            senderName: 'System',
            senderEmail: 'system@backbone-logic.com',
            text: `Session conversation created for "${sessionName}". All assigned team members can discuss this session here.`,
            type: 'system',
            readBy: [],
            createdAt: FieldValue.serverTimestamp(),
            isEdited: false,
            isDeleted: false,
            reactions: {},
        };

        await db.collection('conversations').doc(conversationRef.id)
            .collection('messages').add(messageData);

        console.log(`✅ [SESSIONS API] Created initial message for session conversation`);
    } catch (error) {
        console.error(`❌ [SESSIONS API] Error creating session conversation:`, error);
        throw error;
    }
}

// Create session
router.post('/', authenticateToken, async (req: Request, res: Response) => {
    try {
        console.log('📝 [SESSIONS API] Creating session...');
        const organizationId = req.user?.organizationId;
        const userId = req.user?.uid;

        if (!organizationId || !userId) {
            return res.status(403).json({ success: false, error: 'Authentication required' });
        }

        const sessionData = req.body;
        const sessionRef = await db.collection('sessions').add({
            ...sessionData,
            organizationId,
            createdBy: userId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            isDeleted: false
        });

        // Create conversation for session
        try {
            await createSessionConversation(sessionRef.id, organizationId, sessionData.name || 'New Session', userId);
        } catch (conversationError) {
            console.error('⚠️ [SESSIONS API] Session created but conversation failed:', conversationError);
        }

        return res.status(201).json({
            success: true,
            data: { id: sessionRef.id, sessionId: sessionRef.id, ...sessionData }
        });
    } catch (error: any) {
        console.error('❌ [SESSIONS API] Error creating session:', error);
        return res.status(500).json({ success: false, error: 'Failed to create session', errorDetails: error.message });
    }
});

// Update step documentation
router.put('/:sessionId/steps/:stepId/documentation', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { sessionId, stepId } = req.params;
        const documentationData = req.body;
        const userId = req.user?.uid;
        const organizationId = req.user?.organizationId;

        console.log(`📝 [SESSIONS API] Updating documentation for step ${stepId} in session ${sessionId}`);

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        // Verify step exists and belongs to organization
        const stepRef = db.collection('workflowSteps').doc(stepId as string);
        const stepDoc = await stepRef.get();

        if (!stepDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Workflow step not found'
            });
        }

        const stepData = stepDoc.data();
        if (stepData?.organizationId !== organizationId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Update step documentation fields
        const updateData: any = {
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: userId
        };

        // Update documentation fields if provided
        if (documentationData.description !== undefined) {
            updateData.description = documentationData.description;
        }
        if (documentationData.notes !== undefined) {
            updateData.notes = documentationData.notes;
        }
        if (documentationData.files !== undefined) {
            updateData.files = Array.isArray(documentationData.files)
                ? documentationData.files
                : JSON.stringify(documentationData.files || []);
        }
        if (documentationData.workNotes !== undefined) {
            updateData.workNotes = Array.isArray(documentationData.workNotes)
                ? documentationData.workNotes
                : JSON.stringify(documentationData.workNotes || []);
        }
        if (documentationData.deliverables !== undefined) {
            updateData.deliverables = Array.isArray(documentationData.deliverables)
                ? documentationData.deliverables
                : JSON.stringify(documentationData.deliverables || []);
        }
        if (documentationData.estimatedHours !== undefined) {
            updateData.estimatedHours = documentationData.estimatedHours;
        }
        if (documentationData.actualHours !== undefined) {
            updateData.actualHours = documentationData.actualHours;
        }

        // 🔧 NEW: Update user assignments if provided
        if (documentationData.assignedUserIds !== undefined) {
            updateData.assignedUserIds = Array.isArray(documentationData.assignedUserIds)
                ? documentationData.assignedUserIds
                : [];
        }
        if (documentationData.assignedUserId !== undefined) {
            updateData.assignedUserId = documentationData.assignedUserId || null;
        }
        if (documentationData.assignedToName !== undefined) {
            updateData.assignedToName = documentationData.assignedToName || null;
        }
        if (documentationData.assignedToEmail !== undefined) {
            updateData.assignedToEmail = documentationData.assignedToEmail || null;
        }
        if (documentationData.assignedToAvatar !== undefined) {
            updateData.assignedToAvatar = documentationData.assignedToAvatar || null;
        }

        await stepRef.update(updateData);

        console.log(`✅ [SESSIONS API] Successfully updated documentation for step ${stepId}`);

        return res.status(200).json({
            success: true,
            data: {
                stepId,
                sessionId,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error: any) {
        console.error('❌ [SESSIONS API] Error updating step documentation:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update step documentation',
            errorDetails: error.message
        });
    }
});

export default router;
