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

        // Build financial data section if this is a financial report
        let financialDataSection = '';
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
      
      Constraints:
      1. Focus specifically on ${options.focusAreas?.join(', ') || (options.reportType === 'financial' ? 'financial performance, cash flow, budget health, and cost analysis' : 'overall project health, budget, and timeline')}.
      2. Keep the executive summary professional and concise (2-3 paragraphs).
      3. Identify at least 3-5 risks with mitigation strategies if possible.
      4. Provide actionable recommendations.
      5. Extract key performance metrics.
      ${options.reportType === 'financial' ? '6. **CRITICAL**: Include detailed financial analysis using the timecard, expense, payroll, and invoice data provided above.' : ''}
      
      Output Format (JSON):
      {
        "executiveSummary": "string",
        "keyHighlights": ["string"],
        "risks": [{"category": "string", "description": "string", "severity": "low|medium|high", "mitigation": "string"}],
        "recommendations": ["string"],
        "metrics": {
          "totalBudget": "string",
          "spent": "string",
          "completionPercentage": number,
          "activeTasks": number,
          "teamUtilization": "string"${options.reportType === 'financial' ? ',\n          "netCashFlow": "string",\n          "totalIncome": "string",\n          "totalExpenses": "string",\n          "totalPayroll": "string",\n          "budgetVariance": "string"' : ''}
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
