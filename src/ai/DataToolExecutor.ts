import { getFirestore } from 'firebase-admin/firestore';
import { getPredictiveAnalyticsService } from '../ml/PredictiveAnalyticsService';
import { getVectorSearchService } from '../ml/VectorSearchService';
import {
    createProjectTool as sharedCreateProjectTool,
    createSessionTool as sharedCreateSessionTool,
    createCallSheetTool as sharedCreateCallSheetTool
} from 'shared-backbone-intelligence';

import { googleMapsService } from '../google/maps';

const db = getFirestore();

export interface ToolExecutionResult {
    success: boolean;
    data?: any;
    error?: string;
}

export class DataToolExecutor {
    static async executeTool(
        toolName: string,
        args: any,
        organizationId: string,
        userId: string
    ): Promise<ToolExecutionResult> {
        console.log(`🛠️ [DataToolExecutor] Executing ${toolName} for org ${organizationId}`);

        try {
            switch (toolName) {
                case 'list_projects':
                    return this.listProjects(args, organizationId);

                case 'get_project_details':
                    return this.getProjectDetails(args, organizationId);

                case 'assign_team_member':
                    return this.assignTeamMember(args, organizationId);

                case 'execute_app_action':
                    return this.executeAppAction(args, organizationId, userId);

                case 'list_inventory':
                    return this.listInventory(args, organizationId);

                case 'list_timecards':
                    return this.listTimecards(args, organizationId);

                case 'manage_contact':
                    return this.manageContact(args, organizationId, userId);

                case 'log_visitor':
                    return this.logVisitor(args, organizationId, userId);

                case 'generate_report':
                    return this.generateReport(args, organizationId, userId);

                case 'analyze_project':
                    return this.analyzeProject(args, organizationId, userId);

                case 'export_report':
                    return this.exportReport(args, organizationId, userId);

                default:
                    // 🚀 UNIFIED INTELLIGENCE: Fallback to shared library (Generic Actions)
                    console.log(`📡 [DataToolExecutor] Fallback to shared registry for: ${toolName}`);
                    return this.executeSharedTool(toolName, args, organizationId, userId);
            }
        } catch (error: any) {
            console.error(`❌ [DataToolExecutor] Error executing ${toolName}:`, error);
            return {
                success: false,
                error: error.message || 'Tool execution failed'
            };
        }
    }

    /**
     * Executes a tool from the shared registry
     */
    private static async executeSharedTool(
        toolName: string,
        args: any,
        organizationId: string,
        userId: string
    ): Promise<ToolExecutionResult> {
        try {
            const { allTools } = await import('shared-backbone-intelligence');
            const tool = allTools.find((t: any) => t.name === toolName);

            if (!tool) {
                return {
                    success: false,
                    error: `Unknown tool: ${toolName}. (Checked local switch and shared registry)`
                };
            }

            console.log(`✅ [DataToolExecutor] Executing SHARED tool: ${toolName}`);

            // Inject organizationId and userId into args if they are missing or required by the shared tool
            const toolArgs = {
                ...args,
                organizationId: args.organizationId || organizationId,
                userId: args.userId || userId
            };

            const result = await tool.execute(toolArgs);

            if (result.isError) {
                return {
                    success: false,
                    error: result.content?.[0]?.text || 'Shared tool execution failed'
                };
            }

            // Extract data from shared tool response
            const responseText = result.content?.[0]?.text;
            const responseData = responseText ? JSON.parse(responseText) : {};

            return {
                success: true,
                data: responseData
            };
        } catch (error: any) {
            console.error(`❌ [DataToolExecutor] Shared tool execution error:`, error);
            return {
                success: false,
                error: `Shared tool execution failed: ${error.message}`
            };
        }
    }

    private static async listProjects(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            let query = db.collection('projects')
                .where('organizationId', '==', organizationId);

            if (args.status) {
                query = query.where('status', '==', args.status);
            }

            const limit = args.limit || 10;
            const snapshot = await query.limit(limit).get();

            const projects = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name,
                status: doc.data().status,
                phase: doc.data().phase,
                updatedAt: doc.data().updatedAt?.toDate()
            }));

            return {
                success: true,
                data: { projects }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async getProjectDetails(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.projectId) throw new Error('projectId is required');

            const docRef = db.collection('projects').doc(args.projectId);
            const doc = await docRef.get();

            if (!doc.exists) return { success: false, error: 'Project not found' };

            const data = doc.data();
            if (data?.organizationId !== organizationId) return { success: false, error: 'Access denied' };

            // Fetch team assignments summary
            // Note: In a real implementation this might fetch a subcollection or another collection
            const teamSnapshot = await db.collection('project_participants')
                .where('projectId', '==', args.projectId)
                .limit(5)
                .get();

            const team = teamSnapshot.docs.map(d => d.data());

            return {
                success: true,
                data: {
                    project: {
                        id: doc.id,
                        ...data,
                        team_summary: team
                    }
                }
            };

        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async searchUsers(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`👥 [DataToolExecutor] Searching users in org ${organizationId}`);

            // Search 'teamMembers' which links users to orgs using 'organizationId'
            let teamQuery = db.collection('teamMembers').where('organizationId', '==', organizationId);

            if (args.role) {
                teamQuery = teamQuery.where('role', '==', args.role);
            }

            const snapshot = await teamQuery.limit(20).get();
            let users = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Client-side filtering for fuzzy name search since Firestore lacks it
            if (args.name) {
                const lowerName = args.name.toLowerCase();
                users = users.filter((u: any) =>
                    (u.firstName && u.firstName.toLowerCase().includes(lowerName)) ||
                    (u.lastName && u.lastName.toLowerCase().includes(lowerName)) ||
                    (u.displayName && u.displayName.toLowerCase().includes(lowerName)) ||
                    (u.email && u.email.toLowerCase().includes(lowerName))
                );
            }

            return {
                success: true,
                data: { users }
            };

        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error searching users:', error);
            return { success: false, error: error.message };
        }
    }

    private static async checkSchedule(args: any, organizationId: string): Promise<ToolExecutionResult> {
        // Mock implementation or basic query
        return {
            success: true,
            data: {
                message: "Schedule checking is not fully implemented yet, but here is a placeholder.",
                events: []
            }
        };
    }

    private static async searchKnowledgeBase(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            // MVP: Keyword-based search on 'knowledge_base' collection
            // In Phase 3+, this will be replaced by Vector Search (embeddings)

            const queryText = (args.query || '').toLowerCase();
            const keywords = queryText.split(' ').filter((k: string) => k.length > 3); // Simple keyword extraction

            console.log(`📚 [DataToolExecutor] Searching KB for: "${queryText}" with keywords: ${keywords.join(', ')}`);

            // Fetch documents tagged with organization or 'global'
            // We fetch a batch and filter in memory for this MVP (assuming KB is < 100 docs)
            const snapshot = await db.collection('knowledge_base')
                .where('organizationId', 'in', [organizationId, 'global'])
                .limit(50)
                .get();

            if (snapshot.empty) {
                return {
                    success: true,
                    data: {
                        results: [],
                        message: "No knowledge base articles found. Please upload documents to the 'knowledge_base' collection."
                    }
                };
            }

            const results = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    const title = (data.title || '').toLowerCase();
                    const content = (data.content || '').toLowerCase();
                    const tags = (data.tags || []).map((t: string) => t.toLowerCase());

                    // primitive scoring
                    let score = 0;
                    keywords.forEach((k: string) => {
                        if (title.includes(k)) score += 5;
                        if (content.includes(k)) score += 1;
                        if (tags.some((t: string) => t.includes(k))) score += 3;
                    });

                    return {
                        id: doc.id,
                        title: data.title,
                        type: data.type || 'document',
                        snippet: data.content ? data.content.substring(0, 200) + '...' : '',
                        score
                    };
                })
                .filter(doc => doc.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 5); // Return top 5

            return {
                success: true,
                data: {
                    results,
                    count: results.length
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] KB Search Error:', error);
            return { success: false, error: `KB Search failed: ${error.message}` };
        }
    }

    // ML-Powered Tool Executors
    private static async predictBudgetHealth(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.projectId) throw new Error('projectId is required');

            // Use the ML service directly
            const analytics = getPredictiveAnalyticsService();
            const prediction = await analytics.predictBudgetHealth(args.projectId);

            return {
                success: true,
                data: prediction
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async forecastSpending(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.projectId) throw new Error('projectId is required');

            const analytics = getPredictiveAnalyticsService();
            const forecast = await analytics.forecastSpending(args.projectId, args.days || 30);

            return {
                success: true,
                data: forecast
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async predictResourceAvailability(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.resourceId || !args.startDate || !args.endDate) {
                throw new Error('resourceId, startDate, and endDate are required');
            }

            const analytics = getPredictiveAnalyticsService();
            const prediction = await analytics.predictAvailability(args.resourceId, {
                start: new Date(args.startDate),
                end: new Date(args.endDate)
            });

            return {
                success: true,
                data: prediction
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async semanticSearch(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.query) throw new Error('query is required');

            const limit = args.limit || 5;
            // Default collections to search if not specified
            const collections = args.collections && args.collections.length > 0
                ? args.collections
                : ['projects', 'knowledge_base', 'teamMembers'];

            const vectorService = getVectorSearchService();
            const results = await vectorService.searchAll(args.query, organizationId, collections, limit);

            return {
                success: true,
                data: {
                    results,
                    count: results.length,
                    message: results.length === 0 ? "No relevant results found." : `Found ${results.length} relevant items.`
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Semantic Search Error:', error);
            return { success: false, error: error.message };
        }
    }

    private static async findSimilarEntities(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.collection || !args.entityId) {
                throw new Error('collection and entityId are required');
            }

            const limit = args.limit || 5;
            const vectorService = getVectorSearchService();

            const results = await vectorService.findSimilar(
                args.collection,
                args.entityId,
                organizationId,
                limit
            );

            return {
                success: true,
                data: {
                    results,
                    count: results.length
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Find Similar Error:', error);
            return { success: false, error: error.message };
        }
    }

    private static async queryFirestore(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            const { collectionPath, filters, orderBy, limit: reqLimit } = args;
            if (!collectionPath) throw new Error('collectionPath is required');

            console.log(`🔍 [DataToolExecutor] Querying ${collectionPath} for org ${organizationId}`);

            let query: any = db.collection(collectionPath);

            // 1. Force organizationId filter for multitenancy
            // Note: Some global collections might not have organizationId, but for security,
            // we default to requiring it unless we know otherwise.
            const exceptions = ['knowledge_base', 'users', 'global_settings'];
            if (!exceptions.includes(collectionPath)) {
                query = query.where('organizationId', 'in', [organizationId, 'global']);
            }

            // 2. Apply dynamic filters
            if (filters && Array.isArray(filters)) {
                filters.forEach(f => {
                    let val: any = f.value;
                    // Attempt to convert numeric strings to numbers
                    if (!isNaN(val as any) && val.trim() !== '') {
                        val = Number(val);
                    }
                    // Handle booleans
                    if (val === 'true') val = true;
                    if (val === 'false') val = false;

                    query = query.where(f.field, f.operator, val);
                });
            }

            // 3. Apply sorting
            if (orderBy && orderBy.field) {
                query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
            }

            // 4. Apply limit
            const finalLimit = Math.min(reqLimit || 20, 100);
            query = query.limit(finalLimit);

            const snapshot = await query.get();
            const results = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));

            // 5. Generate column metadata for the table view
            const columns = this.generateTableColumns(results);

            return {
                success: true,
                data: {
                    results,
                    columns,
                    title: `Query Results: ${collectionPath}`,
                    count: results.length,
                    collection: collectionPath
                }
            };
        } catch (error: any) {
            console.error(`❌ [DataToolExecutor] queryFirestore error:`, error);
            return { success: false, error: error.message };
        }
    }

    private static async listCollections(): Promise<ToolExecutionResult> {
        try {
            // In a real environment, we might list actual collections,
            // but for the AI, we provide a curated list of "Primary" collections.
            const collections = [
                'projects', 'tasks', 'media_items', 'timecards', 'users',
                'teamMembers', 'knowledge_base', 'licenses', 'budgets',
                'cuesheets', 'locations', 'inventory', 'conversations'
            ];

            return {
                success: true,
                data: { collections }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async searchGooglePlaces(args: any): Promise<ToolExecutionResult> {
        try {
            if (!args.query) throw new Error('query is required');

            const results = await googleMapsService.searchPlaces(args.query);

            return {
                success: true,
                data: {
                    results: results.slice(0, 5), // Limit to top 5
                    message: results.length === 0 ? "No places found." : `Found ${results.length} places via Google Maps.`
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Google Maps Search Error:', error);
            // Don't fail the whole request, just return error in data
            return { success: false, error: `Maps Search failed: ${error.message}` };
        }
    }

    // Execution Actions

    private static async createProject(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`🎬 [DataToolExecutor] Creating project using SHARED logic`);

            // Execute using the shared library tool
            // Note: Shared tool expects specific args structure, we might need to adapt if Gemini args differ significantly.
            // But based on our schema, they match closely (name, description, etc.)
            // We just need to inject the organizationId which the tool expects in args but we have in context.

            const toolArgs = {
                ...args,
                organizationId, // Inject org ID from context
                // 'type' and 'scope' might default in the tool if missing
            };

            const result = await sharedCreateProjectTool.execute(toolArgs);

            if (result.isError) {
                return { success: false, error: result.content?.[0]?.text || 'Unknown error in shared tool' };
            }

            // Extract relevant data from shared tool response
            // Shared tool returns { content: [{ text: JSON.stringify({...}) }] }
            const responseText = result.content?.[0]?.text;
            const responseData = responseText ? JSON.parse(responseText) : {};

            return {
                success: true,
                data: responseData
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error in createProject:', error);
            return { success: false, error: error.message };
        }
    }

    private static async manageTask(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            const { action, taskId, projectId, title, assigneeId, dueDate } = args;

            if (action === 'create') {
                if (!projectId) throw new Error('projectId is required for creating a task');
                if (!title) throw new Error('title is required');

                const taskRef = db.collection('tasks').doc();
                const taskData = {
                    title,
                    projectId,
                    organizationId,
                    status: 'TODO',
                    createdBy: userId,
                    createdAt: new Date(),
                    assignedTo: assigneeId || null,
                    dueDate: dueDate ? new Date(dueDate) : null
                };

                await taskRef.set(taskData);
                return { success: true, data: { id: taskRef.id, ...taskData, message: 'Task created.' } };
            }

            if (action === 'update' || action === 'complete') {
                if (!taskId) throw new Error('taskId is required for update');
                const taskRef = db.collection('tasks').doc(taskId);

                const updates: any = { updatedAt: new Date() };
                if (title) updates.title = title;
                if (assigneeId) updates.assignedTo = assigneeId;
                if (dueDate) updates.dueDate = new Date(dueDate);
                if (action === 'complete') updates.status = 'COMPLETED';

                await taskRef.update(updates);
                return { success: true, data: { id: taskId, updates, message: `Task ${action}d.` } };
            }

            return { success: false, error: 'Invalid action' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async assignTeamMember(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            const { projectId, userId, role } = args;
            if (!projectId || !userId) throw new Error('projectId and userId are required');

            // Simplified: Store in a subcollection or dedicated participants collection
            // Assuming 'project_participants' collection for now
            const participantId = `${projectId}_${userId}`;
            await db.collection('project_participants').doc(participantId).set({
                projectId,
                userId,
                role: role || 'VIEWER',
                organizationId,
                addedAt: new Date()
            }, { merge: true });

            return {
                success: true,
                data: { message: `User assigned to project successfully.` }
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async executeAppAction(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            // Dynamic import to avoid circular dependencies and load only when needed
            const { CallSheetActions } = await import('./appActions/CallSheetActions');

            const { appName, actionName, parameters } = args;
            console.log(`🎬 [DataToolExecutor] Executing App Action: ${appName}.${actionName}`);

            if (appName === 'call_sheet') {
                if (actionName === 'duplicate') {
                    return await CallSheetActions.duplicateCallSheet(parameters.callSheetId, organizationId, userId);
                }
                if (actionName === 'publish') {
                    return await CallSheetActions.publishCallSheet(parameters.callSheetId, organizationId, userId, parameters.baseUrl);
                }
                if (actionName === 'unpublish') {
                    return await CallSheetActions.unpublishCallSheet(parameters.callSheetId, organizationId, userId);
                }
            }

            if (appName === 'inventory') {
                const { InventoryActions } = await import('./appActions/InventoryActions');
                if (actionName === 'checkout') {
                    return await InventoryActions.checkoutAsset(parameters.assetId, userId, organizationId);
                }
                if (actionName === 'checkin') {
                    return await InventoryActions.checkinAsset(parameters.assetId, userId, organizationId);
                }
            }

            return { success: false, error: `Action ${appName}.${actionName} not supported yet.` };

        } catch (error: any) {
            console.error('❌ [DataToolExecutor] App Action Error:', error);
            return { success: false, error: error.message };
        }
    }



    private static async listInventory(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            const { status, search, limit = 20 } = args;
            console.log(`📦 [DataToolExecutor] Listing inventory for org ${organizationId}`);

            let query = db.collection('inventoryItems') // Correct collection name
                .where('organizationId', '==', organizationId);

            if (status) {
                query = query.where('status', '==', status);
            }

            // Note: Firestore search is limited. If 'search' is present, we might need client-side filtering 
            // or specific prefix queries. For simplicity, we limit to just status or fetch recent.
            // If 'search' is provided, we can't do simple 'where' + 'string contains' in Firestore universally easily.
            // We'll rely on fetching a batch and filtering if search is small? No, that's inefficient.
            // Let's assume exact match or just return recent items if no search, 
            // or use the query_firestore tool's logic if complex.

            // If search is provided, we might rely on the client to ask for specific items,
            // or use a separate search index. For now, let's just return the top N items.

            const snapshot = await query.limit(limit).get();

            const items = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));

            // Basic client-side search if needed (not ideal for large sets but useful for small envs)
            let finalItems = items;
            if (search) {
                const lowerSearch = search.toLowerCase();
                finalItems = items.filter((item: any) =>
                    item.name?.toLowerCase().includes(lowerSearch) ||
                    item.serialNumber?.toLowerCase().includes(lowerSearch)
                );
            }

            return {
                success: true,
                data: {
                    items: finalItems,
                    count: finalItems.length
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error listing inventory:', error);
            return { success: false, error: error.message };
        }
    }

    private static async listTimecards(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            const { userId, status, limit = 20 } = args;
            console.log(`⏱️ [DataToolExecutor] Listing timecards for org ${organizationId}`);

            let query = db.collection('timecard_entries')
                .where('organizationId', '==', organizationId);

            if (userId) {
                query = query.where('userId', '==', userId);
            }
            // Status might need careful handling as entries might not have status, but the aggregated card does.
            // For MVP, if status is requested, we might need to filter after fetch if status isn't on entry.
            // However, typical schema propagates status to entries or we query aggregated parent?
            // Let's assume entries have status for now or valid fields.
            if (status) {
                query = query.where('status', '==', status);
            }

            const snapshot = await query.orderBy('date', 'desc').limit(limit).get();

            const timecards = snapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data()
            }));

            return {
                success: true,
                data: {
                    timecards,
                    count: timecards.length
                }
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error listing timecards:', error);
            return { success: false, error: error.message };
        }
    }

    private static async universalCreate(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.collectionName || !args.data) throw new Error('collectionName and data are required');

            const docRef = db.collection(args.collectionName).doc();
            const fullData = {
                ...args.data,
                organizationId,
                projectId: args.projectId || null,
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date(),
                createdVia: 'AI_ARCHITECT'
            };

            await docRef.set(fullData);
            return { success: true, data: { id: docRef.id, ...fullData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async universalUpdate(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.collectionName || !args.id || !args.data) throw new Error('collectionName, id, and data are required');

            const docRef = db.collection(args.collectionName).doc(args.id);
            const doc = await docRef.get();

            if (!doc.exists) throw new Error('Document not found');
            if (doc.data()?.organizationId !== organizationId) throw new Error('Access denied');

            const updateData = {
                ...args.data,
                updatedAt: new Date(),
                updatedBy: userId
            };

            await docRef.update(updateData);
            return { success: true, data: { id: args.id, ...updateData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async createSession(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`🎬 [DataToolExecutor] Creating session using SHARED logic`);

            const toolArgs = {
                ...args,
                organizationId
            };

            // Cast to any to bypass strict type checking against shared tool signature for now
            // In a full implementation, we'd import the Zod schema and parse
            const result = await sharedCreateSessionTool.execute(toolArgs as any);

            if (result.isError) {
                return { success: false, error: result.content?.[0]?.text || 'Unknown error in shared tool' };
            }

            const responseText = result.content?.[0]?.text;
            const responseData = responseText ? JSON.parse(responseText) : {};

            return { success: true, data: responseData };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error in createSession:', error);
            return { success: false, error: error.message };
        }
    }

    private static async createCallSheet(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`🎬 [DataToolExecutor] Creating call sheet using SHARED logic`);

            const toolArgs = {
                ...args,
                organizationId
            };

            const result = await sharedCreateCallSheetTool.execute(toolArgs as any);

            if (result.isError) {
                return { success: false, error: result.content?.[0]?.text || 'Unknown error in shared tool' };
            }

            const responseText = result.content?.[0]?.text;
            const responseData = responseText ? JSON.parse(responseText) : {};

            return { success: true, data: responseData };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error in createCallSheet:', error);
            return { success: false, error: error.message };
        }
    }

    private static async manageContact(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.firstName || !args.lastName) throw new Error('firstName and lastName are required');

            const contactRef = db.collection('contacts').doc();
            const contactData = {
                firstName: args.firstName,
                lastName: args.lastName,
                organizationId,
                email: args.email || null,
                phone: args.phone || null,
                role: args.role || 'GUEST',
                addressBookId: args.addressBookId || 'default',
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await contactRef.set(contactData);
            return { success: true, data: { id: contactRef.id, ...contactData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async createBudget(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.projectId || !args.totalAmount) throw new Error('projectId and totalAmount are required');

            const budgetRef = db.collection('clipShowBudgetMetadata').doc();
            const budgetData = {
                projectId: args.projectId,
                organizationId,
                totalAmount: args.totalAmount,
                currency: args.currency || 'USD',
                status: 'DRAFT',
                fiscalYear: args.fiscalYear || new Date().getFullYear().toString(),
                notes: args.notes || '',
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await budgetRef.set(budgetData);
            return { success: true, data: { id: budgetRef.id, ...budgetData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async manageInventoryItem(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.name || !args.category) throw new Error('name and category are required');

            const itemRef = db.collection('inventoryItems').doc();
            const itemData = {
                name: args.name,
                category: args.category,
                organizationId,
                status: 'AVAILABLE',
                serialNumber: args.serialNumber || null,
                assignedTo: null,
                tags: args.tags || [],
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await itemRef.set(itemData);
            return { success: true, data: { id: itemRef.id, ...itemData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async logVisitor(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.visitorName || !args.purpose) throw new Error('visitorName and purpose are required');

            const logRef = db.collection('visitor_logs').doc();
            const logData = {
                visitorName: args.visitorName,
                purpose: args.purpose,
                organizationId,
                checkInTime: new Date(),
                checkOutTime: null,
                hostId: userId,
                location: args.location || 'Reception',
                status: 'ON_SITE',
                createdAt: new Date()
            };

            await logRef.set(logData);
            return { success: true, data: { id: logRef.id, ...logData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async createDeliveryPackage(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.name || !args.projectId) throw new Error('name and projectId are required');

            const packageRef = db.collection('delivery_packages').doc();
            const packageData = {
                name: args.name,
                projectId: args.projectId,
                organizationId,
                status: 'DRAFT',
                items: args.items || [],
                deliveryFormat: args.deliveryFormat || 'Standard',
                recipientEmail: args.recipientEmail || null,
                createdBy: userId,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await packageRef.set(packageData);
            return { success: true, data: { id: packageRef.id, ...packageData } };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
    private static async generateReport(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`📊 [DataToolExecutor] Generating report for project: ${args.projectId}`);
            const { ReportGeneratorService } = await import('../reports/ReportGeneratorService');
            const generator = new ReportGeneratorService();

            const result = await generator.generateReport(
                args.projectId || 'current',
                args.reportType || 'executive',
                args.options || {},
                organizationId
            );

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error generating report:', error);
            return { success: false, error: error.message };
        }
    }

    private static async analyzeProject(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`🔍 [DataToolExecutor] Analyzing project: ${args.projectId}`);
            const { DocumentAnalysisService } = await import('./services/DocumentAnalysisService');
            const { EnhancedDataCollectionService } = await import('../reports/EnhancedDataCollectionService');

            const dataCollection = new EnhancedDataCollectionService();
            const analysisService = new DocumentAnalysisService();

            const projectData = await dataCollection.collectData(organizationId, args.projectId);
            const insights = await analysisService.analyzeProject(projectData, {
                reportType: args.analysisType || 'executive'
            });

            return {
                success: true,
                data: insights
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error analyzing project:', error);
            return { success: false, error: error.message };
        }
    }

    private static async exportReport(args: any, organizationId: string, userId: string): Promise<ToolExecutionResult> {
        try {
            console.log(`📤 [DataToolExecutor] Exporting report: ${args.reportUrl} to ${args.destination}`);
            const { ReportExportService } = await import('../reports/ReportExportService');
            const exportService = new ReportExportService();

            const result = await exportService.exportReport(organizationId, args.reportUrl, {
                type: args.destination,
                recipient: args.recipient
            });

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            console.error('❌ [DataToolExecutor] Error exporting report:', error);
            return { success: false, error: error.message };
        }
    }


    private static generateTableColumns(data: any[]): any[] {
        if (!data || data.length === 0) return [];
        // ... previous implementation ...

        const first = data[0];
        const columns: any[] = [];

        // Pick top level fields that aren't too complex
        Object.keys(first).forEach(key => {
            if (key === 'organizationId') return; // Hide orgId

            const val = first[key];
            const type = typeof val;

            if (type === 'object' && val !== null && !(val instanceof Date)) return; // Skip complex objects

            let displayType: string = 'string';
            if (type === 'number') displayType = 'number';
            if (type === 'boolean') displayType = 'boolean';
            if (val instanceof Date || (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/))) displayType = 'date';

            columns.push({
                id: key,
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                type: displayType
            });
        });

        // Limit to 8 columns for readability
        return columns.slice(0, 8);
    }
}
