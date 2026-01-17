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
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        // Fetch budgets
        const budgetsSnapshot = await getDb().collection('budgets')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const budgets = budgetsSnapshot.docs.map(doc => doc.data());
        const totalAllocated = budgets.reduce((acc, b) => acc + (b.totalAllocated || 0), 0);
        const totalSpent = budgets.reduce((acc, b) => acc + (b.totalSpent || 0), 0);

        // Fetch deliverables
        const deliverablesSnapshot = await getDb().collection('deliverables')
            .where('organizationId', '==', context.organizationId)
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

        // Fetch financial data (timecards, expenses, payroll, invoices)
        const financialData = await this.fetchFinancialData(context.organizationId, projectId);

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
            },
            // Financial data for financial reports
            timecards: financialData.timecards,
            expenses: financialData.expenses,
            payrollBatches: financialData.payrollBatches,
            invoices: financialData.invoices,
            financialSummary: financialData.summary
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

    /**
     * Fetch comprehensive financial data for reports
     * Includes timecards, expenses, payroll batches, and invoices
     */
    private async fetchFinancialData(organizationId: string, projectId?: string): Promise<{
        timecards: any[];
        expenses: any[];
        payrollBatches: any[];
        invoices: any[];
        summary: any;
    }> {
        try {
            console.log(`💰 [EnhancedDataCollection] Fetching financial data for org: ${organizationId}, project: ${projectId || 'all'}`);
            const db = getDb();

            // Build base query filters
            const orgFilter = (query: any) => query.where('organizationId', '==', organizationId);
            const projectFilter = (query: any, projectId?: string) => {
                if (projectId) {
                    return query.where('projectId', '==', projectId);
                }
                return query;
            };

            // 1. Fetch Timecards (from timecard_entries collection)
            // Use collectionGroup to query across all subcollections
            let timecardsQuery: any = db.collection('timecard_entries')
                .where('organizationId', '==', organizationId);
            if (projectId && projectId !== 'all' && projectId !== 'current') {
                timecardsQuery = timecardsQuery.where('projectId', '==', projectId);
            }
            const timecardsSnapshot = await timecardsQuery.limit(1000).get();
            const timecards = timecardsSnapshot.docs.map((doc: any) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    userId: data.userId,
                    date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
                    hours: data.hours || data.totalHours || 0,
                    regularHours: data.regularHours || 0,
                    overtimeHours: data.overtimeHours || 0,
                    totalPay: data.totalPay || 0,
                    status: data.status,
                    projectId: data.projectId,
                    ...data
                };
            });

            // 2. Fetch Expenses
            let expensesQuery = db.collection('expenses');
            expensesQuery = orgFilter(expensesQuery);
            if (projectId) {
                expensesQuery = projectFilter(expensesQuery, projectId);
            }
            const expensesSnapshot = await expensesQuery.limit(1000).get();
            const expenses = expensesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    amount: data.amountInBaseCurrency || data.amount || 0,
                    category: data.category,
                    status: data.status,
                    expenseDate: data.expenseDate?.toDate ? data.expenseDate.toDate().toISOString() : data.expenseDate,
                    vendorName: data.vendorName,
                    projectId: data.projectId,
                    ...data
                };
            });

            // 3. Fetch Payroll Batches
            let payrollQuery = db.collection('payroll_batches');
            payrollQuery = orgFilter(payrollQuery);
            if (projectId) {
                payrollQuery = projectFilter(payrollQuery, projectId);
            }
            const payrollSnapshot = await payrollQuery.limit(500).get();
            const payrollBatches = payrollSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    totalCost: data.totalCost || 0,
                    totalGrossPay: data.totalGrossPay || 0,
                    totalNetPay: data.totalNetPay || 0,
                    totalFringes: data.totalFringes || 0,
                    status: data.status,
                    payDate: data.payDate?.toDate ? data.payDate.toDate().toISOString() : data.payDate,
                    payPeriodStart: data.payPeriodStart?.toDate ? data.payPeriodStart.toDate().toISOString() : data.payPeriodStart,
                    payPeriodEnd: data.payPeriodEnd?.toDate ? data.payPeriodEnd.toDate().toISOString() : data.payPeriodEnd,
                    projectId: data.projectId,
                    ...data
                };
            });

            // 4. Fetch Invoices (Income)
            let invoicesQuery = db.collection('invoices');
            invoicesQuery = orgFilter(invoicesQuery);
            if (projectId) {
                invoicesQuery = projectFilter(invoicesQuery, projectId);
            }
            const invoicesSnapshot = await invoicesQuery.limit(500).get();
            const invoices = invoicesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    totalAmount: data.totalAmount || 0,
                    status: data.status,
                    paymentDate: data.paymentDate?.toDate ? data.paymentDate.toDate().toISOString() : data.paymentDate,
                    invoiceDate: data.invoiceDate?.toDate ? data.invoiceDate.toDate().toISOString() : data.invoiceDate,
                    projectId: data.projectId,
                    ...data
                };
            });

            // 5. Calculate Financial Summary
            const totalTimecardHours = timecards.reduce((sum: number, tc: any) => sum + (tc.hours || 0), 0);
            const totalTimecardPay = timecards.reduce((sum: number, tc: any) => sum + (tc.totalPay || 0), 0);
            const totalExpenses = expenses
                .filter(e => e.status === 'paid' || e.status === 'approved')
                .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
            const totalPayroll = payrollBatches
                .filter(p => p.status === 'paid' || p.status === 'approved')
                .reduce((sum: number, p: any) => sum + (p.totalCost || 0), 0);
            const totalIncome = invoices
                .filter(i => i.status === 'paid')
                .reduce((sum: number, i: any) => sum + (i.totalAmount || 0), 0);

            const summary = {
                totalTimecardHours,
                totalTimecardPay,
                totalExpenses,
                totalPayroll,
                totalIncome,
                netCashFlow: totalIncome - totalExpenses - totalPayroll,
                timecardCount: timecards.length,
                expenseCount: expenses.length,
                payrollBatchCount: payrollBatches.length,
                invoiceCount: invoices.length
            };

            console.log(`✅ [EnhancedDataCollection] Financial data collected:`, {
                timecards: timecards.length,
                expenses: expenses.length,
                payrollBatches: payrollBatches.length,
                invoices: invoices.length,
                summary
            });

            return {
                timecards,
                expenses,
                payrollBatches,
                invoices,
                summary
            };
        } catch (error: any) {
            console.error('❌ [EnhancedDataCollection] Error fetching financial data:', error);
            // Return empty data on error to prevent report generation from failing
            return {
                timecards: [],
                expenses: [],
                payrollBatches: [],
                invoices: [],
                summary: {
                    totalTimecardHours: 0,
                    totalTimecardPay: 0,
                    totalExpenses: 0,
                    totalPayroll: 0,
                    totalIncome: 0,
                    netCashFlow: 0,
                    timecardCount: 0,
                    expenseCount: 0,
                    payrollBatchCount: 0,
                    invoiceCount: 0
                }
            };
        }
    }

    private async collectOrganizationData(context: GlobalContext): Promise<ProjectData> {
        // Fetch financial data for organization-wide report
        const financialData = await this.fetchFinancialData(context.organizationId);

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
            },
            // Financial data for organization-wide financial reports
            timecards: financialData.timecards,
            expenses: financialData.expenses,
            payrollBatches: financialData.payrollBatches,
            invoices: financialData.invoices,
            financialSummary: financialData.summary
        };
    }
}

