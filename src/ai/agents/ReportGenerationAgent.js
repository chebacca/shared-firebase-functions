"use strict";
/**
 * Report Generation Agent
 *
 * Specialized agent for generating reports and analytics.
 * Uses existing OllamaAnalysisService logic for report generation.
 * Handles report, analytics, and summary requests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportGenerationAgent = void 0;
class ReportGenerationAgent {
    ollamaService;
    toolRegistry;
    reportTools = [];
    constructor(ollamaService, toolRegistry) {
        this.ollamaService = ollamaService;
        this.toolRegistry = toolRegistry;
        // Initialize tools asynchronously (will be ready by first use)
        this.initializeReportTools().catch(err => {
            console.error('[ReportGenerationAgent] ⚠️ Failed to initialize report tools:', err);
        });
    }
    /**
     * Initialize list of report/analytics tools
     */
    async initializeReportTools() {
        const allTools = await this.toolRegistry.getAllTools();
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
    async generateReport(request, projectData, context) {
        console.log(`[ReportGenerationAgent] 📊 Generating report: ${request.substring(0, 100)}...`);
        // Determine report type from request
        const reportType = this.determineReportType(request, context.reportType);
        const options = {
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
    determineReportType(request, explicitType) {
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
    static isReportIntent(request) {
        const reportKeywords = [
            'report', 'analytics', 'analysis', 'summary',
            'generate report', 'create report', 'show analytics',
            'insights', 'metrics', 'statistics', 'dashboard'
        ];
        const lowerRequest = request.toLowerCase();
        return reportKeywords.some(keyword => lowerRequest.includes(keyword));
    }
}
exports.ReportGenerationAgent = ReportGenerationAgent;
