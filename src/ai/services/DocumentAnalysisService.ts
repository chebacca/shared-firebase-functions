import { GoogleGenerativeAI } from '@google/generative-ai';

export interface TeamMember {
    id?: string;
    name: string;
    role: string;
    department?: string;
    efficiency?: number;
    quality?: number;
    performance?: number;
}

export interface Budget {
    allocated: number;
    spent: number;
    remaining?: number;
}

export interface Session {
    id?: string;
    name: string;
    duration?: number;
    status?: string;
    date?: string;
}

export interface Workflow {
    id: string;
    name: string;
    status: string;
    phase?: string;
}

export interface Deliverable {
    name?: string;
    status: string;
    dueDate?: string;
}

export interface ProjectData {
    projectName: string;
    organizationId: string;
    projectId: string;
    dateRange: { start: string; end: string };
    sessions: Session[];
    workflows: Workflow[];
    team: TeamMember[];
    budget: Budget;
    deliverables: Deliverable[];
    [key: string]: any;
}

export interface Risk {
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string;
}

export interface KeyMetrics {
    totalBudget: string;
    spent: string;
    completionPercentage: number;
    activeTasks: number;
    teamUtilization: string;
}

export interface ProjectInsights {
    executiveSummary: string;
    keyHighlights: string[];
    risks: Risk[];
    recommendations: string[];
    metrics: KeyMetrics;
}

export interface AnalysisOptions {
    reportType: 'executive' | 'detailed' | 'financial' | 'production';
    includeRisks?: boolean;
    includeRecommendations?: boolean;
    focusAreas?: string[];
}

export class DocumentAnalysisService {
    private genAI: GoogleGenerativeAI;

    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY environment variable is not set');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async analyzeProject(projectData: ProjectData, options: AnalysisOptions): Promise<ProjectInsights> {
        const model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_REPORT_MODEL || 'gemini-2.0-flash'
        });

        // Build comprehensive data section for analysis
        let financialDataSection = '';
        let analyticsSection = '';
        
        // Add analytics data if available
        if (projectData.analytics) {
            const analytics = projectData.analytics;
            analyticsSection = `
## Project Analytics

### Deliverables Status Breakdown:
${Object.entries(analytics.deliverableStatusBreakdown || {}).map(([status, count]: [string, any]) => `- ${status}: ${count} deliverables`).join('\n')}
- Total Deliverables: ${analytics.totalDeliverablesCount || 0}
- Completed: ${analytics.completedDeliverablesCount || 0}
- Blocked: ${analytics.blockedDeliverablesCount || 0}

### Session Phase Distribution:
${Object.entries(analytics.sessionPhases || {}).map(([phase, count]: [string, any]) => `- ${phase}: ${count} sessions`).join('\n')}
- Total Sessions: ${analytics.totalSessions || 0}

### Team by Department:
${Object.entries(analytics.teamByDepartment || {}).map(([dept, data]: [string, any]) => `- ${dept}: ${data.count} team members`).join('\n')}

### Labor Costs by Department:
${Object.entries(analytics.timecardByDepartment || {}).map(([dept, data]: [string, any]) => 
    `- ${dept}: ${data.hours.toFixed(1)} hours, $${data.cost.toLocaleString()} cost, ${data.count} timecards`
).join('\n')}

### Expenses by Category:
${Object.entries(analytics.expenseByCategory || {}).map(([cat, data]: [string, any]) => 
    `- ${cat}: $${data.amount.toLocaleString()} (${data.count} expenses)`
).join('\n')}

### Workflow Status:
${Object.entries(analytics.workflowStepStatus || {}).map(([status, count]: [string, any]) => `- ${status}: ${count} steps`).join('\n')}
- Total Workflows: ${analytics.totalWorkflows || 0}
- Total Workflow Steps: ${analytics.totalWorkflowSteps || 0}
`;
        }
        if (options.reportType === 'financial' && projectData.timecards) {
            const timecards = projectData.timecards || [];
            const expenses = projectData.expenses || [];
            const payrollBatches = projectData.payrollBatches || [];
            const invoices = projectData.invoices || [];
            const summary = projectData.financialSummary || {};

            financialDataSection = `
      
      FINANCIAL DATA ANALYSIS (CRITICAL FOR FINANCIAL REPORTS):
      
      Timecard Data:
      - Total timecards: ${timecards.length}
      - Total hours: ${summary.totalTimecardHours || 0}
      - Total timecard pay: $${(summary.totalTimecardPay || 0).toLocaleString()}
      - Timecard breakdown: ${JSON.stringify(timecards.slice(0, 10), null, 2)} (showing first 10)
      
      Expenses:
      - Total expenses: ${expenses.length}
      - Total expense amount: $${(summary.totalExpenses || 0).toLocaleString()}
      - Paid/Approved expenses: ${expenses.filter((e: any) => e.status === 'paid' || e.status === 'approved').length}
      - Expense breakdown: ${JSON.stringify(expenses.slice(0, 10), null, 2)} (showing first 10)
      
      Payroll Batches:
      - Total payroll batches: ${payrollBatches.length}
      - Total payroll cost: $${(summary.totalPayroll || 0).toLocaleString()}
      - Paid/Approved batches: ${payrollBatches.filter((p: any) => p.status === 'paid' || p.status === 'approved').length}
      - Payroll breakdown: ${JSON.stringify(payrollBatches.slice(0, 10), null, 2)} (showing first 10)
      
      Invoices (Income):
      - Total invoices: ${invoices.length}
      - Total income (paid invoices): $${(summary.totalIncome || 0).toLocaleString()}
      - Paid invoices: ${invoices.filter((i: any) => i.status === 'paid').length}
      - Invoice breakdown: ${JSON.stringify(invoices.slice(0, 10), null, 2)} (showing first 10)
      
      Financial Summary:
      - Net Cash Flow: $${(summary.netCashFlow || 0).toLocaleString()} (Income - Expenses - Payroll)
      - Total Income: $${(summary.totalIncome || 0).toLocaleString()}
      - Total Expenses: $${(summary.totalExpenses || 0).toLocaleString()}
      - Total Payroll: $${(summary.totalPayroll || 0).toLocaleString()}
      
      **CRITICAL**: For financial reports, analyze:
      1. Cash flow trends (income vs expenses vs payroll over time)
      2. Budget health (allocated vs spent)
      3. Payroll efficiency (hours vs cost)
      4. Expense patterns (categories, vendors, timing)
      5. Financial risks (overspending, cash flow issues, budget variances)
      6. Recommendations for financial optimization
      `;
        }

        const prompt = `
      Analyze the following project data and generate comprehensive insights for a ${options.reportType} report.
      
      Project Data:
      ${JSON.stringify(projectData, null, 2)}
      ${financialDataSection}
      ${analyticsSection}
      
      **CRITICAL ANALYSIS REQUIREMENTS:**
      
      1. **Project Health Assessment**: 
         - Analyze completion percentage in context of blocked deliverables
         - Assess timeline health based on session phases and workflow progress
         - Evaluate team utilization across departments
         - Identify bottlenecks in workflow steps
      
      2. **Budget & Financial Analysis**:
         - Deep dive into budget variance and spending patterns
         - Analyze labor costs by department (Post-Production, Art, General, etc.)
         - Review expense patterns by category (transportation, meals, equipment rental)
         - Assess cash flow health (income vs expenses vs payroll)
         - Identify cost optimization opportunities
      
      3. **Resource Allocation**:
         - Review team distribution across departments
         - Analyze timecard hours and costs by department
         - Identify departments with high labor costs
         - Assess alignment between budget line items and actual expenses
      
      4. **Deliverables & Workflow**:
         - Analyze blocked deliverables and their impact
         - Review workflow step completion rates
         - Assess session phase distribution
         - Identify workflow bottlenecks
      
      5. **Risk Identification**:
         - Financial risks (overspending, negative cash flow, budget variance)
         - Operational risks (blocked deliverables, low completion rate)
         - Resource risks (department imbalances, high labor costs)
         - Timeline risks (workflow delays, phase transitions)
      
      Constraints:
      1. Focus specifically on ${options.focusAreas?.join(', ') || (options.reportType === 'financial' ? 'financial performance, cash flow, budget health, cost analysis, and resource allocation' : 'overall project health, budget, timeline, deliverables, and resource utilization')}.
      2. Keep the executive summary comprehensive but professional (3-5 paragraphs covering all critical areas).
      3. Identify at least 5-7 risks with specific mitigation strategies.
      4. Provide actionable recommendations addressing:
         - Blocked deliverables resolution
         - Budget optimization
         - Resource reallocation
         - Cash flow improvement
         - Department efficiency
      5. Extract and analyze ALL key performance metrics from the analytics data.
      ${options.reportType === 'financial' ? '6. **CRITICAL**: Include detailed financial analysis using ALL the timecard, expense, payroll, and invoice data provided above, with department and category breakdowns.' : ''}
      7. **CRITICAL**: Address the specific challenges mentioned in the analytics:
         - Blocked deliverables count and impact
         - Department labor cost distribution
         - Expense category patterns
         - Workflow step status distribution
         - Team utilization by department
      
      Output Format (JSON):
      {
        "executiveSummary": "string (comprehensive 3-5 paragraph analysis covering budget health, completion challenges, resource allocation, cash flow, and key recommendations)",
        "keyHighlights": ["string (at least 8-10 key insights)"],
        "risks": [{"category": "string", "description": "string", "severity": "low|medium|high", "mitigation": "string"}],
        "recommendations": ["string (at least 8-10 actionable recommendations)"],
        "metrics": {
          "totalBudget": "string",
          "spent": "string",
          "completionPercentage": number,
          "activeTasks": number,
          "teamUtilization": "string"${options.reportType === 'financial' ? ',\n          "netCashFlow": "string",\n          "totalIncome": "string",\n          "totalExpenses": "string",\n          "totalPayroll": "string",\n          "budgetVariance": "string",\n          "blockedDeliverables": number,\n          "departmentLaborCosts": "object",\n          "expenseCategoryBreakdown": "object"' : ''}
        }
      }
    `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from response (handling potential markdown formatting)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse AI response as JSON');
        }

        return JSON.parse(jsonMatch[0]);
    }

    async generateExecutiveSummary(projectData: ProjectData): Promise<string> {
        const analysis = await this.analyzeProject(projectData, { reportType: 'executive' });
        return analysis.executiveSummary;
    }

    async identifyRisks(projectData: ProjectData): Promise<Risk[]> {
        const analysis = await this.analyzeProject(projectData, { reportType: 'detailed', includeRisks: true });
        return analysis.risks;
    }
}
