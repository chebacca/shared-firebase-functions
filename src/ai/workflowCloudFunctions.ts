import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface CreateWorkflowRequest {
    name: string;
    description?: string;
    targetPhase?: 'PRE_PRODUCTION' | 'PRODUCTION' | 'POST_PRODUCTION' | 'DELIVERY';
    nodes: any[];
    edges: any[];
    organizationId: string;
    sessionId?: string;
}

export const createWorkflow = onCall(
    {
        cors: true,
        region: 'us-central1',
        invoker: 'public'
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const data = request.data as CreateWorkflowRequest;
        if (!data.name || !data.organizationId || !data.nodes || !data.edges) {
            throw new HttpsError('invalid-argument', 'Missing required fields: name, organizationId, nodes, edges');
        }

        const db = admin.firestore();

        try {
            console.log(`🏗️ [createWorkflow] Creating workflow "${data.name}" for org ${data.organizationId}`);

            // Structural Validation (matching MCP tool)
            const startNodes = data.nodes.filter((n: any) => n.type === 'start');
            if (startNodes.length === 0) {
                throw new HttpsError('invalid-argument', 'Workflow must have a start node');
            }

            const endNodes = data.nodes.filter((n: any) => n.type === 'end');
            if (endNodes.length === 0) {
                throw new HttpsError('invalid-argument', 'Workflow must have an end node');
            }

            // Use workflowDiagrams collection to match MCP tool and workflow routes
            const workflowRef = await db.collection('workflowDiagrams').add({
                name: data.name,
                description: data.description || '',
                targetPhase: data.targetPhase || 'POST_PRODUCTION',
                nodes: data.nodes,
                edges: data.edges,
                organizationId: data.organizationId,
                sessionId: data.sessionId || null,
                status: 'Draft',
                createdBy: request.auth.uid,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                createdVia: 'architect-master-agent'
            });

            return {
                success: true,
                workflowId: workflowRef.id,
                message: "Workflow created successfully"
            };

        } catch (error: any) {
            console.error("❌ [createWorkflow] Error:", error);
            throw new HttpsError('internal', `Failed to create workflow: ${error.message}`);
        }
    }
);
