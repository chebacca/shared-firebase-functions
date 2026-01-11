import { getFirestore } from 'firebase-admin/firestore';
import { getPredictiveAnalyticsService } from '../ml/PredictiveAnalyticsService';
import { getVectorSearchService } from '../ml/VectorSearchService';

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

                case 'search_users':
                    return this.searchUsers(args, organizationId);

                case 'check_schedule':
                    return this.checkSchedule(args, organizationId);

                case 'search_knowledge_base':
                    return this.searchKnowledgeBase(args, organizationId);

                // ML-Powered Tools
                case 'predict_budget_health':
                    return this.predictBudgetHealth(args, organizationId);

                case 'forecast_spending':
                    return this.forecastSpending(args, organizationId);

                case 'predict_resource_availability':
                    return this.predictResourceAvailability(args, organizationId);

                case 'semantic_search':
                    return this.semanticSearch(args, organizationId);

                case 'find_similar_entities':
                    return this.findSimilarEntities(args, organizationId);

                case 'query_firestore':
                    return this.queryFirestore(args, organizationId);

                case 'list_collections':
                    return this.listCollections();

                default:
                    return {
                        success: false,
                        error: `Unknown data tool: ${toolName}`
                    };
            }
        } catch (error: any) {
            console.error(`❌ [DataToolExecutor] Error executing ${toolName}:`, error);
            return {
                success: false,
                error: error.message || 'Tool execution failed'
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
            // NOTE: Firestore doesn't support full-text search natively on string fields like 'name'.
            // We will do a basic prefix search if name is provided, or just filter by role.
            // For production, Algolia or Typesense is recommended.

            let query = db.collection('users') // Or 'teamMembers' depending on architecture
                .where('organizationId', '==', organizationId); // Assuming users have orgId on them or we query teamMembers

            // NOTE: Accessing 'users' collection with orgId might imply looking at team memberships. 
            // Let's assume we search `teamMembers` collection which links users to orgs.

            // Changing to search 'teamMembers' which definitely has organizationId
            let teamQuery = db.collection('teamMembers').where('organizationId', '==', organizationId);

            if (args.role) {
                teamQuery = teamQuery.where('role', '==', args.role);
            }

            const snapshot = await teamQuery.limit(20).get();
            let users = snapshot.docs.map(doc => doc.data());

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

            // Note: Vector search requires API key, so we'll need to get it from secrets
            // For now, return a message that semantic search needs to be called via HTTP
            // In production, you'd get the API key from secrets
            return {
                success: false,
                error: 'Semantic search requires API key. Use the searchAll Firebase Function directly from the client.'
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private static async findSimilarEntities(args: any, organizationId: string): Promise<ToolExecutionResult> {
        try {
            if (!args.collection || !args.entityId) {
                throw new Error('collection and entityId are required');
            }

            // Note: Vector search requires API key
            // For now, return a message that findSimilar needs to be called via HTTP
            return {
                success: false,
                error: 'Find similar requires API key. Use the findSimilar Firebase Function directly from the client.'
            };
        } catch (error: any) {
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

    private static generateTableColumns(data: any[]): any[] {
        if (!data || data.length === 0) return [];

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
