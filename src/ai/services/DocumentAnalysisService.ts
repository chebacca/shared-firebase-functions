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
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY environment variable is not set');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async analyzeProject(projectData: ProjectData, options: AnalysisOptions): Promise<ProjectInsights> {
        const model = this.genAI.getGenerativeModel({
            model: process.env.GEMINI_REPORT_MODEL || 'gemini-2.0-flash'
        });

        const prompt = `
      Analyze the following project data and generate comprehensive insights for a ${options.reportType} report.
      
      Project Data:
      ${JSON.stringify(projectData, null, 2)}
      
      Constraints:
      1. Focus specifically on ${options.focusAreas?.join(', ') || 'overall project health, budget, and timeline'}.
      2. Keep the executive summary professional and concise (2-3 paragraphs).
      3. Identify at least 3-5 risks with mitigation strategies if possible.
      4. Provide actionable recommendations.
      5. Extract key performance metrics.
      
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
          "teamUtilization": "string"
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
