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

        console.log(`📊 [EnhancedDataCollection] Collecting comprehensive data for project: ${projectId}`);

        // Fetch detailed sessions for this project with phase and status
        const sessionsSnapshot = await getDb().collection('sessions')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const sessions = sessionsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || 'Unnamed Session',
                status: data.status,
                phase: data.phase,
                date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
                callTime: data.callTime?.toDate ? data.callTime.toDate().toISOString() : data.callTime,
                wrapTime: data.wrapTime?.toDate ? data.wrapTime.toDate().toISOString() : data.wrapTime,
                location: data.location,
                duration: data.duration || 0,
                ...data
            };
        }) as any[];

        // Fetch budgets with line items
        const budgetsSnapshot = await getDb().collection('budgets')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const budgets = budgetsSnapshot.docs.map(doc => doc.data());
        const totalAllocated = budgets.reduce((acc, b) => acc + (b.totalAllocated || b.totalBudget || 0), 0);
        const totalSpent = budgets.reduce((acc, b) => acc + (b.totalSpent || b.actualSpend || 0), 0);
        const budgetLineItems = budgets.flatMap(b => b.lineItems || []);

        // Fetch deliverables with detailed status breakdown
        const deliverablesSnapshot = await getDb().collection('deliverables')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const deliverables = deliverablesSnapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                name: d.title || d.name || 'Unnamed Deliverable',
                status: d.status || 'pending',
                dueDate: d.deliveryDate ? (d.deliveryDate.toDate ? d.deliveryDate.toDate().toISOString() : d.deliveryDate) : undefined,
                type: d.type || 'general',
                priority: d.priority || 'normal',
                blocked: d.status === 'blocked' || d.blocked === true,
                ...d
            };
        });

        // Fetch workflow instances for sessions
        const workflowInstancesSnapshot = await getDb().collection('workflowInstances')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const workflowInstances = workflowInstancesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                workflowName: data.workflowName,
                status: data.status,
                progress: data.progress || 0,
                sessionId: data.sessionId,
                ...data
            };
        });

        // Fetch workflow steps for analytics
        const workflowStepsSnapshot = await getDb().collection('workflowSteps')
            .where('organizationId', '==', context.organizationId)
            .where('projectId', '==', projectId)
            .get();
        const workflowSteps = workflowStepsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                stepName: data.stepName,
                status: data.status,
                workflowInstanceId: data.workflowInstanceId,
                ...data
            };
        });

        // Fetch team members specifically for this organization with department breakdown
        const teamMembers = await this.fetchTeamMembers(context.organizationId);

        // Fetch financial data (timecards, expenses, payroll, invoices) with detailed breakdowns
        const financialData = await this.fetchFinancialData(context.organizationId, projectId);

        // Calculate progress based on deliverables
        const completedDeliverables = deliverables.filter(d => d.status === 'completed' || d.status === 'approved').length;
        const blockedDeliverables = deliverables.filter(d => d.status === 'blocked' || d.blocked === true).length;
        const completionPercentage = deliverables.length > 0
            ? Math.round((completedDeliverables / deliverables.length) * 100)
            : (project.progress || 0);

        // Calculate session phase breakdown
        const sessionPhases = sessions.reduce((acc: any, s: any) => {
            const phase = s.phase || 'UNKNOWN';
            acc[phase] = (acc[phase] || 0) + 1;
            return acc;
        }, {});

        // Calculate deliverable status breakdown
        const deliverableStatusBreakdown = deliverables.reduce((acc: any, d: any) => {
            const status = d.status || 'pending';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        // Format budget numbers for display
        const formatCurrency = (num: number) => {
            return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        };

        const budgetVariance = totalAllocated > 0 
            ? ((totalSpent - totalAllocated) / totalAllocated * 100).toFixed(1)
            : '0.0';

        // Calculate team utilization by department
        const teamByDepartment = teamMembers.reduce((acc: any, member: any) => {
            const dept = member.department || 'General';
            if (!acc[dept]) {
                acc[dept] = { count: 0, members: [] };
            }
            acc[dept].count++;
            acc[dept].members.push(member);
            return acc;
        }, {});

        // Calculate timecard breakdown by department
        const timecardByDepartment = financialData.timecards.reduce((acc: any, tc: any) => {
            const dept = tc.department || 'General';
            if (!acc[dept]) {
                acc[dept] = { hours: 0, cost: 0, count: 0 };
            }
            acc[dept].hours += tc.hours || 0;
            acc[dept].cost += tc.totalPay || 0;
            acc[dept].count++;
            return acc;
        }, {});

        // Calculate expense breakdown by category
        const expenseByCategory = financialData.expenses.reduce((acc: any, exp: any) => {
            const cat = exp.category || 'uncategorized';
            if (!acc[cat]) {
                acc[cat] = { amount: 0, count: 0 };
            }
            acc[cat].amount += exp.amount || 0;
            acc[cat].count++;
            return acc;
        }, {});

        // Calculate workflow step status breakdown
        const workflowStepStatus = workflowSteps.reduce((acc: any, step: any) => {
            const status = step.status || 'pending';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

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
            } as any,
            budgetLineItems: budgetLineItems,
            team: teamMembers,
            sessions: sessions,
            workflows: workflowInstances.map((w: any) => ({
                id: w.id,
                name: w.workflowName || 'Unnamed Workflow',
                status: w.status,
                phase: w.phase
            })),
            workflowSteps: workflowSteps,
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
            financialSummary: financialData.summary,
            // Enhanced analytics
            analytics: {
                sessionPhases,
                deliverableStatusBreakdown,
                blockedDeliverablesCount: blockedDeliverables,
                completedDeliverablesCount: completedDeliverables,
                totalDeliverablesCount: deliverables.length,
                teamByDepartment,
                timecardByDepartment,
                expenseByCategory,
                workflowStepStatus,
                totalSessions: sessions.length,
                totalWorkflows: workflowInstances.length,
                totalWorkflowSteps: workflowSteps.length
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
                // Validate and normalize timecard data
                const hours = parseFloat(data.hours || data.totalHours || 0);
                const regularHours = parseFloat(data.regularHours || 0);
                const overtimeHours = parseFloat(data.overtimeHours || 0);
                const totalPay = parseFloat(data.totalPay || 0);
                
                return {
                    id: doc.id,
                    userId: data.userId || 'unknown',
                    date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
                    hours: isNaN(hours) ? 0 : hours,
                    regularHours: isNaN(regularHours) ? 0 : regularHours,
                    overtimeHours: isNaN(overtimeHours) ? 0 : overtimeHours,
                    totalPay: isNaN(totalPay) ? 0 : totalPay,
                    status: data.status || 'draft',
                    projectId: data.projectId,
                    department: data.department,
                    location: data.location,
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
                const amount = parseFloat(data.amountInBaseCurrency || data.amount || 0);
                return {
                    id: doc.id,
                    amount: isNaN(amount) ? 0 : amount,
                    category: data.category || 'uncategorized',
                    status: data.status || 'draft',
                    expenseDate: data.expenseDate?.toDate ? data.expenseDate.toDate().toISOString() : data.expenseDate,
                    vendorName: data.vendorName || 'Unknown Vendor',
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
                const totalCost = parseFloat(data.totalCost || 0);
                const totalGrossPay = parseFloat(data.totalGrossPay || 0);
                const totalNetPay = parseFloat(data.totalNetPay || 0);
                const totalFringes = parseFloat(data.totalFringes || 0);
                
                return {
                    id: doc.id,
                    totalCost: isNaN(totalCost) ? 0 : totalCost,
                    totalGrossPay: isNaN(totalGrossPay) ? 0 : totalGrossPay,
                    totalNetPay: isNaN(totalNetPay) ? 0 : totalNetPay,
                    totalFringes: isNaN(totalFringes) ? 0 : totalFringes,
                    status: data.status || 'draft',
                    payDate: data.payDate?.toDate ? data.payDate.toDate().toISOString() : data.payDate,
                    payPeriodStart: data.payPeriodStart?.toDate ? data.payPeriodStart.toDate().toISOString() : data.payPeriodStart,
                    payPeriodEnd: data.payPeriodEnd?.toDate ? data.payPeriodEnd.toDate().toISOString() : data.payPeriodEnd,
                    projectId: data.projectId,
                    entryCount: data.entryCount || 0,
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

            // Format numbers for display
            const formatCurrency = (num: number) => {
                return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            };

            const formatHours = (num: number) => {
                return num.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            };

            const summary = {
                totalTimecardHours: formatHours(totalTimecardHours),
                totalTimecardPay: formatCurrency(totalTimecardPay),
                totalExpenses: formatCurrency(totalExpenses),
                totalPayroll: formatCurrency(totalPayroll),
                totalIncome: formatCurrency(totalIncome),
                netCashFlow: formatCurrency(totalIncome - totalExpenses - totalPayroll),
                timecardCount: timecards.length,
                expenseCount: expenses.length,
                payrollBatchCount: payrollBatches.length,
                invoiceCount: invoices.length,
                // Raw values for calculations
                _raw: {
                    totalTimecardHours,
                    totalTimecardPay,
                    totalExpenses,
                    totalPayroll,
                    totalIncome,
                    netCashFlow: totalIncome - totalExpenses - totalPayroll
                }
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

