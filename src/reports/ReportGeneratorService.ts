import { DocumentAnalysisService, ProjectData, AnalysisOptions } from '../ai/services/DocumentAnalysisService';
import { ChartGenerationService } from './ChartGenerationService';
import { PDFTemplateService, TemplateData } from './PDFTemplateService';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

export interface ReportOptions {
    dateRange?: { start: string; end: string };
    includeInsights?: boolean;
    includeCharts?: boolean;
    customSections?: string[];
}

export interface ReportResult {
    downloadUrl: string;
    insights: any;
    charts: Buffer[];
    pageCount?: number;
}

import { EnhancedDataCollectionService } from './EnhancedDataCollectionService';

export class ReportGeneratorService {
    private analysisService: DocumentAnalysisService;
    private chartService: ChartGenerationService;
    private pdfService: PDFTemplateService;
    private dataCollectionService: EnhancedDataCollectionService;
    private storageBucket: string;

    constructor() {
        this.analysisService = new DocumentAnalysisService();
        this.chartService = new ChartGenerationService();
        this.pdfService = new PDFTemplateService();
        this.dataCollectionService = new EnhancedDataCollectionService();
        this.storageBucket = process.env.REPORT_STORAGE_BUCKET || 'backbone-logic.appspot.com';
    }

    async generateReport(
        projectId: string,
        reportType: 'executive' | 'detailed' | 'financial' | 'production' = 'executive',
        options: ReportOptions = {}
    ): Promise<ReportResult> {

        // 1. Determine Organization ID (needed for data collection)
        // If projectId is 'all-projects' or similar, we might need organizationId passed in options
        // For now, assume projectId is a valid project ID and fetch its org
        const organizationId = await this.resolveOrganizationId(projectId);

        // 2. Collect Project Data
        const projectData = await this.dataCollectionService.collectData(organizationId, projectId);

        // 3. Analyze with Gemini
        const insights = await this.analysisService.analyzeProject(projectData, {
            reportType,
            includeRisks: true,
            includeRecommendations: true
        });

        // 4. Generate Visualizations
        const renderedCharts: Record<string, string> = {};
        const chartBuffers: Buffer[] = [];

        if (options.includeCharts !== false) {
            // Budget Chart
            const budgetChart = await this.chartService.generateBudgetChart(projectData.budget);
            renderedCharts.budget = `data:image/png;base64,${budgetChart.toString('base64')}`;
            chartBuffers.push(budgetChart);

            // Timeline Chart
            const timelineChart = await this.chartService.generateTimelineChart(projectData.sessions);
            renderedCharts.timeline = `data:image/png;base64,${timelineChart.toString('base64')}`;
            chartBuffers.push(timelineChart);

            // Team Chart
            const teamChart = await this.chartService.generateTeamPerformanceChart(projectData.team);
            renderedCharts.team = `data:image/png;base64,${teamChart.toString('base64')}`;
            chartBuffers.push(teamChart);

            // Deliverables
            const deliverablesChart = await this.chartService.generateDeliverablesChart(projectData.deliverables);
            renderedCharts.deliverables = `data:image/png;base64,${deliverablesChart.toString('base64')}`;
            chartBuffers.push(deliverablesChart);
        }

        // 5. Prepare Template Data
        const templateData: TemplateData = {
            projectName: projectData.projectName,
            projectId: projectData.projectId,
            generatedAt: new Date().toLocaleDateString(),
            dateRange: options.dateRange
                ? `${options.dateRange.start} to ${options.dateRange.end}`
                : 'All Time',
            executiveSummary: insights.executiveSummary,
            insights,
            metrics: insights.metrics,
            charts: renderedCharts
        };

        // 6. Create PDF
        const pdfBuffer = await this.pdfService.generateReportPDF(reportType, templateData);

        // 7. Upload to Storage
        const downloadUrl = await this.uploadReport(pdfBuffer, {
            projectId,
            reportType,
            generatedAt: new Date().toISOString()
        });

        return {
            downloadUrl,
            insights,
            charts: chartBuffers,
            pageCount: 10 // Approximation, pdf-lib could give exact
        };
    }

    private async resolveOrganizationId(projectId: string): Promise<string> {
        // If projectId looks like it might be an org ID or special keyword, handle it
        if (projectId === 'all' || projectId === 'current') {
            // This is tricky without passing orgId from caller.
            // For now, assume projectId IS the project ID. 
            // Caller should resolve 'current' to an actual ID or we throw.
            throw new Error("Cannot resolve organization from 'all' or 'current' projectId without context.");
        }

        const doc = await admin.firestore().collection('projects').doc(projectId).get();
        if (!doc.exists) {
            throw new Error(`Project ${projectId} not found`);
        }
        const data = doc.data();
        if (!data?.organizationId) {
            throw new Error(`Project ${projectId} has no organizationId`);
        }
        return data.organizationId;
    }

    async uploadReport(fileBuffer: Buffer, metadata: any): Promise<string> {
        const bucket = admin.storage().bucket(this.storageBucket);
        const fileName = `reports/${metadata.projectId}/${metadata.reportType}-${Date.now()}.pdf`;
        const file = bucket.file(fileName);

        await file.save(fileBuffer, {
            metadata: {
                contentType: 'application/pdf',
                metadata
            }
        });

        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2500'
        });

        return url;
    }
}
