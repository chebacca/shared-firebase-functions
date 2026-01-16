
import { Router } from 'express';
import * as admin from 'firebase-admin';

const router: Router = Router();
const db = admin.firestore();
const COLLECTION_NAME = 'workflowDiagrams';
const TEMPLATES_COLLECTION_NAME = 'workflow-templates'; // Also check workflow-templates collection

/**
 * GET /templates
 * Get all workflow templates from workflow-templates collection
 * This is the primary endpoint for workflow templates used by the workflow designer
 * IMPORTANT: This route must come before /diagrams/:id to avoid route conflicts
 */
router.get('/templates', async (req, res) => {
    try {
        console.log(`🔍 [API] GET /templates - Full path: ${req.path}, Original URL: ${req.originalUrl}, Base URL: ${req.baseUrl}`);
        const userId = req.user?.uid;
        const userEmail = req.user?.email;

        console.log(`🔍 [API] Getting workflow templates for user: ${userId || 'unknown'}`);

        // Get user's organization ID
        let userData = null;
        if (userId) {
            const userDocByUid = await db.collection('users').doc(userId).get();
            if (userDocByUid.exists) {
                userData = userDocByUid.data();
            }
        }

        if (!userData && userEmail) {
            const userDocByEmail = await db.collection('users').doc(userEmail).get();
            if (userDocByEmail.exists) {
                userData = userDocByEmail.data();
            } else {
                const tmQuery = await db.collection('teamMembers').where('email', '==', userEmail).limit(1).get();
                if (!tmQuery.empty) {
                    userData = tmQuery.docs[0].data();
                }
            }
        }

        const organizationId = userData?.organizationId || null;
        console.log(`🔍 [API] User organization ID: ${organizationId || 'none'}`);

        const allTemplatesMap = new Map<string, any>();

        if (organizationId) {
            // Strategy: Fetch templates from BOTH collections (matching /diagrams endpoint behavior)
            // 1. Fetch from workflowDiagrams collection (primary source for templates)
            const orgWorkflowsSnapshot = await db.collection(COLLECTION_NAME)
                .where('organizationId', '==', organizationId)
                .limit(200)
                .get();

            orgWorkflowsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if:
                // 1. isTemplate is explicitly true, OR
                // 2. isTemplate is not set but workflow has nodes (likely a template), OR
                // 3. workflow doesn't have sessionId (templates don't have sessionId)
                const isTemplate = data.isTemplate === true ||
                    (data.isTemplate === undefined && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) ||
                    !data.sessionId;

                if (isTemplate && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    allTemplatesMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            console.log(`🔍 [API] Found ${orgWorkflowsSnapshot.docs.length} org workflows from workflowDiagrams, ${allTemplatesMap.size} are templates`);

            // 2. Also fetch from workflow-templates collection (used by workflow designer)
            // This is the PRIMARY source for workflow templates (PRE PRODUCTION, PRODUCTION, POST PRODUCTION, DELIVERY)
            const orgTemplatesSnapshot = await db.collection(TEMPLATES_COLLECTION_NAME)
                .where('organizationId', '==', organizationId)
                .limit(200)
                .get();

            orgTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include ALL templates from workflow-templates collection (they're all templates by definition)
                // Include even if nodes array is empty - some templates might be in setup phase
                if (data.isTemplate !== false) { // Include unless explicitly marked as not a template
                    // Use Map to avoid duplicates (prefer workflow-templates over workflowDiagrams)
                    allTemplatesMap.set(doc.id, {
                        id: doc.id,
                        ...data,
                        isTemplate: true,
                        _sourceCollection: TEMPLATES_COLLECTION_NAME
                    });
                }
            });

            console.log(`🔍 [API] Found ${orgTemplatesSnapshot.docs.length} org templates from workflow-templates collection, total unique: ${allTemplatesMap.size}`);

            // 3. Also fetch public templates (isPublic = true) from both collections
            const publicWorkflowsSnapshot = await db.collection(COLLECTION_NAME)
                .where('isPublic', '==', true)
                .limit(100)
                .get();

            publicWorkflowsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.isPublic === true && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    const isTemplate = data.isTemplate === true || !data.sessionId;
                    if (isTemplate && !allTemplatesMap.has(doc.id)) {
                        allTemplatesMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                    }
                }
            });

            const publicTemplatesSnapshot = await db.collection(TEMPLATES_COLLECTION_NAME)
                .where('isPublic', '==', true)
                .limit(100)
                .get();

            publicTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.isPublic === true && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    if (!allTemplatesMap.has(doc.id)) {
                        allTemplatesMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                    }
                }
            });

            console.log(`🔍 [API] Found ${publicWorkflowsSnapshot.docs.length} public workflows and ${publicTemplatesSnapshot.docs.length} public templates`);
        } else {
            // No organization - fetch all templates from both collections
            const allWorkflowsSnapshot = await db.collection(COLLECTION_NAME)
                .limit(200)
                .get();

            allWorkflowsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const isTemplate = data.isTemplate === true ||
                    (data.isTemplate === undefined && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) ||
                    !data.sessionId;

                if (isTemplate && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    allTemplatesMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            const allTemplatesSnapshot = await db.collection(TEMPLATES_COLLECTION_NAME)
                .limit(200)
                .get();

            allTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include ALL templates from workflow-templates collection (they're all templates by definition)
                if (data.isTemplate !== false) { // Include unless explicitly marked as not a template
                    if (!allTemplatesMap.has(doc.id)) {
                        allTemplatesMap.set(doc.id, {
                            id: doc.id,
                            ...data,
                            isTemplate: true,
                            _sourceCollection: TEMPLATES_COLLECTION_NAME
                        });
                    }
                }
            });

            console.log(`🔍 [API] Found ${allWorkflowsSnapshot.docs.length} workflows and ${allTemplatesSnapshot.docs.length} templates, total unique: ${allTemplatesMap.size} (no org)`);
        }

        // Convert Map to Array
        const allTemplates = Array.from(allTemplatesMap.values());

        console.log(`🔍 [API] Total templates found: ${allTemplates.length} for user ${userId || 'unknown'}`);

        return res.json({ success: true, data: allTemplates });
    } catch (error) {
        console.error('❌ [API] Error fetching workflow templates:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch workflow templates',
            errorDetails: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * GET /diagrams
 * Get all workflow diagrams for the current user/org
 * Returns: org-specific workflows, org-specific templates, and global public templates
 */
router.get('/diagrams', async (req, res) => {
    try {
        console.log(`🔍 [API] GET /diagrams - Full path: ${req.path}, Original URL: ${req.originalUrl}, Base URL: ${req.baseUrl}`);
        const userId = req.user?.uid;
        const userEmail = req.user?.email;

        console.log(`🔍 [API] Getting workflow diagrams for user: ${userId || 'unknown'}`);

        // Get user's organization ID
        let userData = null;
        if (userId) {
            const userDocByUid = await db.collection('users').doc(userId).get();
            if (userDocByUid.exists) {
                userData = userDocByUid.data();
            }
        }

        if (!userData && userEmail) {
            const userDocByEmail = await db.collection('users').doc(userEmail).get();
            if (userDocByEmail.exists) {
                userData = userDocByEmail.data();
            } else {
                const tmQuery = await db.collection('teamMembers').where('email', '==', userEmail).limit(1).get();
                if (!tmQuery.empty) {
                    userData = tmQuery.docs[0].data();
                }
            }
        }

        const organizationId = userData?.organizationId || null;
        console.log(`🔍 [API] User organization ID: ${organizationId || 'none'}`);

        const allWorkflowsMap = new Map<string, any>();

        if (organizationId) {
            // Strategy: Fetch all workflows for the organization, then filter for templates
            // This ensures we get workflows even if isTemplate field is missing
            const orgWorkflowsSnapshot = await db.collection(COLLECTION_NAME)
                .where('organizationId', '==', organizationId)
                .limit(200)
                .get();

            orgWorkflowsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if:
                // 1. isTemplate is explicitly true, OR
                // 2. isTemplate is not set but workflow has nodes (likely a template), OR
                // 3. workflow doesn't have sessionId (templates don't have sessionId)
                const isTemplate = data.isTemplate === true ||
                    (data.isTemplate === undefined && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) ||
                    !data.sessionId;

                if (isTemplate) {
                    allWorkflowsMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            console.log(`🔍 [API] Found ${orgWorkflowsSnapshot.docs.length} org workflows from workflowDiagrams, ${allWorkflowsMap.size} are templates`);

            // Also fetch from workflow-templates collection (used by workflow designer)
            const templatesSnapshot = await db.collection(TEMPLATES_COLLECTION_NAME)
                .where('organizationId', '==', organizationId)
                .limit(200)
                .get();

            templatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if it has nodes (workflow template structure)
                if (data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    // Use a unique key to avoid conflicts (prepend collection name)
                    const uniqueId = `template-${doc.id}`;
                    allWorkflowsMap.set(uniqueId, {
                        id: doc.id,
                        ...data,
                        isTemplate: true,
                        _sourceCollection: TEMPLATES_COLLECTION_NAME
                    });
                }
            });

            console.log(`🔍 [API] Found ${templatesSnapshot.docs.length} templates from workflow-templates collection`);

            // Fetch global public templates (templates without org restriction or marked as public)
            const globalTemplatesSnapshot = await db.collection(COLLECTION_NAME)
                .where('isPublic', '==', true)
                .limit(100)
                .get();

            globalTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if it's public and either has isTemplate=true or doesn't have organizationId
                if (data.isPublic === true && (data.isTemplate === true || !data.organizationId)) {
                    allWorkflowsMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            console.log(`🔍 [API] Found ${globalTemplatesSnapshot.docs.length} global public templates`);

            // Also fetch templates that don't have organizationId set (legacy/global templates)
            // Query for isTemplate=true OR missing organizationId
            const legacyTemplatesSnapshot = await db.collection(COLLECTION_NAME)
                .where('isTemplate', '==', true)
                .limit(100)
                .get();

            legacyTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Only include if it doesn't have an organizationId (legacy/global template)
                if (!data.organizationId) {
                    allWorkflowsMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            console.log(`🔍 [API] Found ${legacyTemplatesSnapshot.docs.length} legacy templates`);
        } else {
            // No organization - fetch all templates
            // Use a more permissive query that includes workflows even if isTemplate is not set
            const allTemplatesSnapshot = await db.collection(COLLECTION_NAME)
                .limit(200)
                .get();

            allTemplatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if:
                // 1. isTemplate is explicitly true, OR
                // 2. isTemplate is not set but workflow has nodes and no sessionId (likely a template)
                const isTemplate = data.isTemplate === true ||
                    (data.isTemplate === undefined && data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0 && !data.sessionId);

                if (isTemplate) {
                    allWorkflowsMap.set(doc.id, { id: doc.id, ...data, isTemplate: true });
                }
            });

            console.log(`🔍 [API] Found ${allTemplatesSnapshot.docs.length} total workflows from workflowDiagrams, ${allWorkflowsMap.size} are templates (no org)`);

            // Also fetch from workflow-templates collection
            const templatesSnapshot = await db.collection(TEMPLATES_COLLECTION_NAME)
                .limit(200)
                .get();

            templatesSnapshot.docs.forEach(doc => {
                const data = doc.data();
                // Include if it has nodes (workflow template structure)
                if (data.nodes && Array.isArray(data.nodes) && data.nodes.length > 0) {
                    const uniqueId = `template-${doc.id}`;
                    allWorkflowsMap.set(uniqueId, {
                        id: doc.id,
                        ...data,
                        isTemplate: true,
                        _sourceCollection: TEMPLATES_COLLECTION_NAME
                    });
                }
            });

            console.log(`🔍 [API] Found ${templatesSnapshot.docs.length} templates from workflow-templates collection (no org)`);
        }

        const allWorkflows = Array.from(allWorkflowsMap.values());

        console.log(`🔍 [API] Total unique workflows found: ${allWorkflows.length} for user ${userId || 'unknown'}`);

        return res.json({ success: true, data: allWorkflows });
    } catch (error) {
        console.error('❌ [API] Error fetching workflow diagrams:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch workflow diagrams',
            errorDetails: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * GET /diagrams/:id
 * Get a specific workflow diagram
 */
router.get('/diagrams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection(COLLECTION_NAME).doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ success: false, error: 'Workflow diagram not found' });
        }

        return res.json({ success: true, data: { id: doc.id, ...doc.data() } });
    } catch (error) {
        console.error(`❌ [API] Error fetching workflow diagram ${req.params.id}:`, error);
        return res.status(500).json({ success: false, error: 'Failed to fetch workflow diagram' });
    }
});

/**
 * POST /diagrams
 * Create a new workflow diagram
 */
router.post('/diagrams', async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { name, nodes, edges, description, category, tags, isTemplate, isPublic, metadata } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, error: 'Workflow name is required' });
        }

        if (!userId) {
            return res.status(401).json({ success: false, error: 'User not authenticated' });
        }

        // Get user's organization ID (reuse logic or abstract it)
        // For brevity, we'll do a quick lookup
        const userDoc = await db.collection('users').doc(userId).get();
        const organizationId = userDoc.data()?.organizationId;

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                error: 'User organization ID not found'
            });
        }

        const newWorkflow = {
            name,
            description: description || '',
            nodes: nodes || [],
            edges: edges || [],
            category: category || 'general',
            tags: tags || [],
            isTemplate: isTemplate || false,
            isPublic: isPublic || false,
            metadata: metadata || {},
            organizationId,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const docRef = await db.collection(COLLECTION_NAME).add(newWorkflow);

        console.log(`✅ [API] Created workflow diagram: ${docRef.id}`);

        return res.json({
            success: true,
            data: { id: docRef.id, ...newWorkflow },
            message: 'Workflow diagram created successfully'
        });
    } catch (error) {
        console.error('❌ [API] Error creating workflow diagram:', error);
        return res.status(500).json({ success: false, error: 'Failed to create workflow diagram' });
    }
});

/**
 * PUT /diagrams/:id
 * Update a workflow diagram
 */
router.put('/diagrams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Protect read-only fields
        delete updateData.id;
        delete updateData.createdAt;
        delete updateData.createdBy;

        updateData.updatedAt = new Date().toISOString();

        await db.collection(COLLECTION_NAME).doc(id).update(updateData);

        console.log(`✅ [API] Updated workflow diagram: ${id}`);

        return res.json({ success: true, message: 'Workflow diagram updated successfully' });
    } catch (error) {
        console.error(`❌ [API] Error updating workflow diagram ${req.params.id}:`, error);
        return res.status(500).json({ success: false, error: 'Failed to update workflow diagram' });
    }
});

/**
 * DELETE /diagrams/:id
 * Delete a workflow diagram
 */
router.delete('/diagrams/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection(COLLECTION_NAME).doc(id).delete();

        console.log(`✅ [API] Deleted workflow diagram: ${id}`);

        return res.json({ success: true, message: 'Workflow diagram deleted successfully' });
    } catch (error) {
        console.error(`❌ [API] Error deleting workflow diagram ${req.params.id}:`, error);
        return res.status(500).json({ success: false, error: 'Failed to delete workflow diagram' });
    }
});

/**
 * DELETE /diagrams/:id/force
 * Force delete a workflow diagram (same as delete for now, but could handle cascading)
 */
router.delete('/diagrams/:id/force', async (req, res) => {
    try {
        const { id } = req.params;
        // Implement cascading delete if necessary (e.g., delete related sessions/instances)
        await db.collection(COLLECTION_NAME).doc(id).delete();

        console.log(`✅ [API] Force deleted workflow diagram: ${id}`);

        return res.json({ success: true, message: 'Workflow diagram force deleted successfully' });
    } catch (error) {
        console.error(`❌ [API] Error force deleting workflow diagram ${req.params.id}:`, error);
        return res.status(500).json({ success: false, error: 'Failed to force delete workflow diagram' });
    }
});

/**
 * POST /sessions/:sessionId/assign-multiple
 * Assign multiple workflows to a session (one per phase)
 * This endpoint is also defined in index.ts but added here for consistency
 */
router.post('/sessions/:sessionId/assign-multiple', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        const { assignments } = req.body;
        const organizationId = req.user?.organizationId;

        console.log(`🔄 [WORKFLOW API] Assigning multiple workflows to session ${sessionId}`, {
            assignmentCount: assignments?.length || 0,
            organizationId
        });

        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'assignments array is required and must not be empty'
            });
        }

        if (!organizationId) {
            return res.status(400).json({
                success: false,
                error: 'Organization ID is required'
            });
        }

        // Verify session exists
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Import FieldValue for timestamps
        const { FieldValue } = await import('firebase-admin/firestore');

        const batch = db.batch();
        const createdInstances: any[] = [];
        const stepsToCreate: Array<{ instanceId: string; stepData: any }> = [];

        // Create workflow instances for each assignment
        for (const assignment of assignments) {
            const { phase, workflowDiagramId, departmentName } = assignment;

            if (!phase || !workflowDiagramId) {
                console.warn(`⚠️ [WORKFLOW API] Skipping invalid assignment:`, assignment);
                continue;
            }

            // Get workflow template - check both workflowDiagrams and workflow-templates collections
            let workflowName = 'Unnamed Workflow';
            let templateNodes: any[] = [];
            let templateEdges: any[] = [];

            try {
                // Try workflowDiagrams first
                let workflowTemplateDoc = await db.collection('workflowDiagrams').doc(workflowDiagramId).get();
                if (!workflowTemplateDoc.exists) {
                    // Try workflow-templates collection
                    workflowTemplateDoc = await db.collection('workflow-templates').doc(workflowDiagramId).get();
                }

                if (workflowTemplateDoc.exists) {
                    const templateData = workflowTemplateDoc.data();
                    workflowName = templateData?.name || templateData?.displayName || workflowName;
                    templateNodes = templateData?.nodes || [];
                    templateEdges = templateData?.edges || [];
                    console.log(`📋 [WORKFLOW API] Found template "${workflowName}" with ${templateNodes.length} nodes`);
                }
            } catch (error) {
                console.warn(`⚠️ [WORKFLOW API] Could not fetch workflow template:`, error);
            }

            // Create workflow instance
            const instanceRef = db.collection('workflowInstances').doc();
            const instanceId = instanceRef.id;
            const instanceData = {
                id: instanceId,
                sessionId,
                workflowDiagramId,
                name: workflowName,
                phase,
                workflowPhase: phase, // Compatibility field
                departmentName: departmentName || null,
                status: 'ACTIVE',
                progress: 0,
                organizationId,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            batch.set(instanceRef, instanceData);
            createdInstances.push(instanceData);

            // First pass: Create refs and map node IDs to new step IDs
            const nodeToStepId = new Map<string, string>();
            const stepsWithRefs: Array<{ ref: any, node: any }> = [];

            if (templateNodes.length > 0) {
                // Filter out non-step nodes first
                const validNodes = templateNodes.filter((n: any) => n.type !== 'start' && n.type !== 'end');

                validNodes.forEach((node: any) => {
                    const stepRef = db.collection('workflowSteps').doc();
                    nodeToStepId.set(node.id, stepRef.id);
                    stepsWithRefs.push({ ref: stepRef, node });
                });

                const stepsBatch = db.batch();
                let stepOrder = 0;

                for (const { ref, node } of stepsWithRefs) {
                    const nodeLabel = node.data?.label || node.data?.name || node.name || `Step ${stepOrder + 1}`;

                    // Extract dependencies from edges and map to STEP IDs
                    const dependencies: string[] = [];
                    if (templateEdges && Array.isArray(templateEdges)) {
                        const incomingEdges = templateEdges.filter((edge: any) => edge.target === node.id);
                        incomingEdges.forEach((edge: any) => {
                            // Find source in the valid nodes (ignoring start node)
                            // If source is a valid step, add its STEP ID
                            const sourceStepId = nodeToStepId.get(edge.source);
                            if (sourceStepId) {
                                dependencies.push(sourceStepId);
                            }
                        });
                    }

                    // Determine step type from node type (Expanded Support)
                    let stepType = 'TASK';
                    if (node.type === 'review') stepType = 'REVIEW';
                    else if (node.type === 'editorial') stepType = 'EDITORIAL';
                    else if (node.type === 'color') stepType = 'COLOR';
                    else if (node.type === 'audio') stepType = 'AUDIO';
                    else if (node.type === 'qc') stepType = 'QC';
                    else if (node.type === 'agent') stepType = 'AGENT'; // 🎯 Added AGENT
                    else if (node.type === 'decision' || node.type === 'approval') stepType = 'DECISION'; // 🎯 Added DECISION

                    const stepData = {
                        id: ref.id,
                        workflowInstanceId: instanceId,
                        sessionId: sessionId,
                        organizationId: organizationId,
                        name: nodeLabel,
                        description: node.data?.description || node.data?.deliverableNotes || null,
                        stepType: stepType,
                        nodeSubtype: node.data?.nodeSubtype || (node.data?.role ? node.data.role.toLowerCase() : null), // 🎯 Map role to subtype for specialists/bots
                        order: stepOrder++,
                        status: 'NOT_STARTED',
                        phase: phase,
                        dependencies: dependencies, // 🎯 Now contains valid step IDs
                        requiresReview: node.requiresReview || node.data?.requiresReview || false,
                        priority: node.data?.priority || 'MEDIUM',
                        estimatedHours: node.data?.estimatedDuration || 4,
                        assignedUserId: node.data?.assignedUserId || null,
                        assignedRole: node.data?.assignedRole || null,
                        nodeId: node.id, // 🎯 Reset nodeId preservation
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    stepsBatch.set(ref, stepData);
                    stepsToCreate.push({ instanceId, stepData }); // Keep for logging/response
                    stepOrder++;
                }

                await stepsBatch.commit();
                console.log(`✅ [WORKFLOW API] Created ${stepsToCreate.length} workflow steps with FULL dependencies`);
            }
        }

        // Commit all instances
        await batch.commit();

        return res.json({
            success: true,
            data: {
                sessionId,
                instances: createdInstances,
                stepsCreated: stepsToCreate.length
            },
            message: `Successfully assigned ${createdInstances.length} workflow(s) to session`
        });
    } catch (error) {
        console.error(`❌ [WORKFLOW API] Error assigning workflows to session ${req.params.sessionId}:`, error);
        return res.status(500).json({
            success: false,
            error: 'Failed to assign workflows to session',
            errorDetails: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;
