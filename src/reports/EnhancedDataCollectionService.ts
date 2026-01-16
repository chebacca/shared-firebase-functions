import { gatherGlobalContext, GlobalContext } from '../ai/contextAggregation/GlobalContextService';
import { getFirestore } from 'firebase-admin/firestore';
import { ProjectData, TeamMember, Deliverable, Session, Workflow } from '../ai/services/DocumentAnalysisService';

// Initialize db lazily to avoid initialization errors during deployment
const getDb = () => getFirestore();

export class EnhancedDataCollectionService {

    /**
     * Collects comprehensive data for a report, either for a specific project or the whole organization.
     */
    async collectData(organizationId: string, projectId?: string): Promise<ProjectData> {
        console.log(`📊 [EnhancedDataCollection] Collecting data for Org: ${organizationId}, Project: ${projectId}`);

        // 1. Gather Global Context (High level overview of everything)
        const globalContext = await gatherGlobalContext(organizationId);

        if (projectId && projectId !== 'all' && projectId !== 'current') {
            return this.collectSpecificProjectData(globalContext, projectId);
        } else {
            return this.collectOrganizationData(globalContext);
        }
    }

    private async collectSpecificProjectData(context: GlobalContext, projectId: string): Promise<ProjectData> {
        // Find the project in the global dashboard context
        const project = context.dashboard.projects.find(p => p.id === projectId) as any;

        if (!project) {
            throw new Error(`Project ${projectId} not found in organization context`);
        }

        // Fetch detailed sessions for this project
        const sessionsSnapshot = await getDb().collection('sessions')
            .where('projectId', '==', projectId)
            .get();
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        // Fetch budgets
        const budgetsSnapshot = await getDb().collection('budgets')
            .where('projectId', '==', projectId)
            .get();
        const budgets = budgetsSnapshot.docs.map(doc => doc.data());
        const totalAllocated = budgets.reduce((acc, b) => acc + (b.totalAllocated || 0), 0);
        const totalSpent = budgets.reduce((acc, b) => acc + (b.totalSpent || 0), 0);

        // Fetch deliverables
        const deliverablesSnapshot = await getDb().collection('deliverables')
            .where('projectId', '==', projectId)
            .get();
        const deliverables = deliverablesSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                name: d.title || d.name,
                status: d.status,
                dueDate: d.deliveryDate ? (d.deliveryDate.toDate ? d.deliveryDate.toDate().toISOString() : d.deliveryDate) : undefined
            };
        });

        // Fetch team members specifically for this organization
        const teamMembers = await this.fetchTeamMembers(context.organizationId);

        // Calculate progress based on deliverables
        const completedDeliverables = deliverables.filter(d => d.status === 'completed' || d.status === 'approved').length;
        const completionPercentage = deliverables.length > 0
            ? Math.round((completedDeliverables / deliverables.length) * 100)
            : (project.progress || 0);

        return {
            projectId: project.id,
            organizationId: context.organizationId,
            projectName: project.name,
            description: project.description || '',
            status: project.status,
            dateRange: {
                start: project.startDate || new Date().toISOString(),
                end: project.endDate || new Date().toISOString()
            },
            budget: {
                allocated: totalAllocated,
                spent: totalSpent,
                remaining: totalAllocated - totalSpent
            },
            team: teamMembers,
            sessions: sessions.map((s: any) => ({
                id: s.id,
                name: s.name,
                status: s.status,
                date: s.date ? (s.date.toDate ? s.date.toDate().toISOString() : s.date) : new Date().toISOString()
            })),
            workflows: [], // TODO: Link workflows to project if unifiedWorkflowInstances exists
            deliverables,
            risks: [], // To be identified by AI
            keyMetrics: {
                completionPercentage,
                budgetHealth: totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0,
                timelineHealth: 100, // Placeholder
                teamUtilization: `${Math.min(100, (sessions.length * 10))}%` // Proxy for now
            }
        };
    }

    private async fetchTeamMembers(organizationId: string): Promise<TeamMember[]> {
        try {
            const usersSnap = await getDb().collection('users')
                .where('organizationId', '==', organizationId)
                .get();

            return usersSnap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.displayName || data.email || 'Unknown',
                    role: data.role || 'Member',
                    department: data.department || 'General',
                    efficiency: 100, // Placeholder
                    quality: 100 // Placeholder
                };
            });
        } catch (e) {
            console.error('Error fetching team members:', e);
            return [];
        }
    }

    private async collectOrganizationData(context: GlobalContext): Promise<ProjectData> {
        // meaningful aggregation for the whole org
        return {
            projectId: 'ALL_PROJECTS',
            organizationId: context.organizationId,
            projectName: "Organization Overview",
            description: "Aggregate report for all active projects",
            status: "ACTIVE",
            dateRange: {
                start: new Date().toISOString(), // Today
                end: new Date().toISOString()
            },
            budget: {
                allocated: context.budgets.totalBudgeted,
                spent: context.budgets.totalSpent,
                remaining: context.budgets.totalBudgeted - context.budgets.totalSpent
            },
            team: [],
            sessions: [],
            workflows: [],
            deliverables: [],
            risks: [],
            keyMetrics: {
                completionPercentage: 0,
                budgetHealth: 0,
                timelineHealth: 0,
                teamUtilization: "0%"
            }
        };
    }
}

