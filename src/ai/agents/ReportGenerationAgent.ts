/**
 * Report Generation Agent
 * 
 * Specialized agent for generating reports and analytics.
 * Uses existing OllamaAnalysisService logic for report generation.
 * Handles report, analytics, and summary requests.
 */

import { OllamaAnalysisService } from '../services/OllamaAnalysisService';
import { UnifiedToolRegistry } from '../services/UnifiedToolRegistry';
import { ProjectData, AnalysisOptions } from '../services/DocumentAnalysisService';

export interface ReportContext {
    userId?: string;
    organizationId?: string;
    projectId?: string;
    reportType?: 'executive' | 'detailed' | 'financial' | 'production';
}

export class ReportGenerationAgent {
    private ollamaService: OllamaAnalysisService;
    private toolRegistry: UnifiedToolRegistry;
    private reportTools: string[] = [];

    constructor(
        ollamaService: OllamaAnalysisService,
        toolRegistry: UnifiedToolRegistry
    ) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        this.initializeReportTools();
    }

    /**
     * Initialize list of report/analytics tools
     */
    private initializeReportTools(): void {
        const allTools = this.toolRegistry.getAllTools();
        this.reportTools = allTools
            .filter(tool => {
                const name = tool.name.toLowerCase();
                return name.includes('report') ||
                    name.includes('analytics') ||
                    name.includes('generate') ||
                    name.includes('analyze') ||
                    name.includes('summary') ||
                    name.includes('export');
            })
            .map(tool => tool.name);

        console.log(`[ReportGenerationAgent] 📊 Initialized with ${this.reportTools.length} report tools`);
    }

    /**
     * Generate a report
     */
    async generateReport(
        request: string,
        projectData: ProjectData,
        context: ReportContext
    ): Promise<{
        report: any;
        insights: any;
        toolsUsed: string[];
    }> {
        console.log(`[ReportGenerationAgent] 📊 Generating report: ${request.substring(0, 100)}...`);

        // Determine report type from request
        const reportType = this.determineReportType(request, context.reportType);

        const options: AnalysisOptions = {
            reportType,
            includeRisks: true,
            includeRecommendations: true
        };

        // Use OllamaAnalysisService for report generation
        const insights = await this.ollamaService.analyzeProject(projectData, options);

        return {
            report: insights,
            insights,
            toolsUsed: this.reportTools
        };
    }

    /**
     * Determine report type from request
     */
    private determineReportType(
        request: string,
        explicitType?: 'executive' | 'detailed' | 'financial' | 'production'
    ): 'executive' | 'detailed' | 'financial' | 'production' {
        if (explicitType) {
            return explicitType;
        }

        const lowerRequest = request.toLowerCase();

        if (lowerRequest.includes('financial') || lowerRequest.includes('budget') || lowerRequest.includes('cost')) {
            return 'financial';
        }

        if (lowerRequest.includes('detailed') || lowerRequest.includes('comprehensive') || lowerRequest.includes('full')) {
            return 'detailed';
        }

        if (lowerRequest.includes('production') || lowerRequest.includes('session') || lowerRequest.includes('shoot')) {
            return 'production';
        }

        // Default to executive
        return 'executive';
    }

    /**
     * Check if a request is appropriate for this agent
     */
    static isReportIntent(request: string): boolean {
        const reportKeywords = [
            'report', 'analytics', 'analysis', 'summary',
            'generate report', 'create report', 'show analytics',
            'insights', 'metrics', 'statistics', 'dashboard'
        ];

        const lowerRequest = request.toLowerCase();
        return reportKeywords.some(keyword => lowerRequest.includes(keyword));
    }
}
