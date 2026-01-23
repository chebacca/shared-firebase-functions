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
        this.storageBucket = process.env.REPORT_STORAGE_BUCKET || 'backbone-logic.firebasestorage.app';
    }

    async generateReport(
        projectId: string,
        reportType: 'executive' | 'detailed' | 'financial' | 'production' = 'executive',
        options: ReportOptions = {},
        organizationId?: string
    ): Promise<ReportResult> {

        // 1. Determine Organization ID (needed for data collection)
        // If passed explicitly, use it. Otherwise resolve from project.
        const rOrganizationId = organizationId || await this.resolveOrganizationId(projectId);

        // 2. Collect Project Data
        const projectData = await this.dataCollectionService.collectData(rOrganizationId, projectId);

        // 3. Analyze with AI (Ollama preferred, Gemini fallback)
        console.log(`[ReportGeneratorService] 📊 Starting ${reportType} report generation...`);
        console.log(`[ReportGeneratorService] 📋 Project: ${projectData.projectName} (${projectData.projectId})`);
        console.log(`[ReportGeneratorService] 📋 Organization: ${rOrganizationId}`);
        console.log(`[ReportGeneratorService] 🔍 AI Service: DocumentAnalysisService will select Ollama (if available) or Gemini`);
        
        const analysisStartTime = Date.now();
        const insights = await this.analysisService.analyzeProject(projectData, {
            reportType,
            includeRisks: true,
            includeRecommendations: true
        });
        const analysisDuration = Date.now() - analysisStartTime;
        
        console.log(`[ReportGeneratorService] ✅ AI Analysis complete in ${analysisDuration}ms`);
        console.log(`[ReportGeneratorService] 📊 Generated insights: ${insights.keyHighlights?.length || 0} highlights, ${insights.risks?.length || 0} risks, ${insights.recommendations?.length || 0} recommendations`);
        console.log(`[ReportGeneratorService] 📝 Executive summary length: ${insights.executiveSummary?.length || 0} characters`);

        // 4. Generate Visualizations
        const renderedCharts: Record<string, string> = {};
        const chartBuffers: Buffer[] = [];

        if (options.includeCharts !== false) {
            console.log('📊 [ReportGenerator] Generating charts...');
            
            // Budget Chart
            console.log('📊 [ReportGenerator] Generating budget chart with data:', projectData.budget);
            const budgetChart = await this.chartService.generateBudgetChart(projectData.budget);
            renderedCharts.budget = `data:image/png;base64,${budgetChart.toString('base64')}`;
            chartBuffers.push(budgetChart);

            // Timeline Chart
            console.log('📊 [ReportGenerator] Generating timeline chart with', projectData.sessions?.length || 0, 'sessions');
            const timelineChart = await this.chartService.generateTimelineChart(projectData.sessions);
            renderedCharts.timeline = `data:image/png;base64,${timelineChart.toString('base64')}`;
            chartBuffers.push(timelineChart);

            // Team Chart
            console.log('📊 [ReportGenerator] Generating team chart with', projectData.team?.length || 0, 'members');
            const teamChart = await this.chartService.generateTeamPerformanceChart(projectData.team);
            renderedCharts.team = `data:image/png;base64,${teamChart.toString('base64')}`;
            chartBuffers.push(teamChart);

            // Deliverables
            console.log('📊 [ReportGenerator] Generating deliverables chart with', projectData.deliverables?.length || 0, 'items');
            const deliverablesChart = await this.chartService.generateDeliverablesChart(projectData.deliverables);
            renderedCharts.deliverables = `data:image/png;base64,${deliverablesChart.toString('base64')}`;
            chartBuffers.push(deliverablesChart);
            
            console.log('✅ [ReportGenerator] Generated', chartBuffers.length, 'charts');
        } else {
            console.log('⚠️ [ReportGenerator] Chart generation disabled by options');
        }

        // 5. Prepare Template Data with formatted values
        const formatCurrency = (num: number) => {
            return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        };

        // Format analytics data for template
        const formatAnalytics = (analytics: any) => {
            if (!analytics) return {};
            
            // Format expense by category
            const expenseByCategory: any = {};
            if (analytics.expenseByCategory) {
                Object.entries(analytics.expenseByCategory).forEach(([cat, data]: [string, any]) => {
                    expenseByCategory[cat] = {
                        amount: formatCurrency(data.amount || 0),
                        count: data.count || 0
                    };
                });
            }
            
            // Format timecard by department
            const timecardByDepartment: any = {};
            if (analytics.timecardByDepartment) {
                Object.entries(analytics.timecardByDepartment).forEach(([dept, data]: [string, any]) => {
                    timecardByDepartment[dept] = {
                        hours: (data.hours || 0).toFixed(1),
                        cost: formatCurrency(data.cost || 0),
                        count: data.count || 0
                    };
                });
            }
            
            return {
                ...analytics,
                expenseByCategory,
                timecardByDepartment
            };
        };

        const templateData: TemplateData = {
            projectName: projectData.projectName,
            projectId: projectData.projectId,
            generatedAt: new Date().toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            }),
            dateRange: options.dateRange
                ? `${options.dateRange.start} to ${options.dateRange.end}`
                : 'All Time',
            executiveSummary: insights.executiveSummary,
            insights,
            metrics: {
                ...insights.metrics,
                totalBudget: formatCurrency(projectData.budget?.allocated || 0),
                spent: formatCurrency(projectData.budget?.spent || 0),
                remaining: formatCurrency((projectData.budget?.allocated || 0) - (projectData.budget?.spent || 0)),
                variance: (projectData.budget?.allocated || 0) > 0 
                    ? (((projectData.budget?.spent || 0) - (projectData.budget?.allocated || 0)) / (projectData.budget?.allocated || 1) * 100).toFixed(1)
                    : '0.0',
                completionPercentage: projectData.keyMetrics?.completionPercentage || 0
            } as any,
            charts: renderedCharts,
            // Add financial summary for financial reports
            financialSummary: projectData.financialSummary || {
                totalTimecardHours: '0',
                totalTimecardPay: '0',
                totalExpenses: '0',
                totalPayroll: '0',
                totalIncome: '0',
                netCashFlow: '0',
                timecardCount: 0,
                expenseCount: 0,
                payrollBatchCount: 0,
                invoiceCount: 0
            },
            // Add analytics data
            analytics: formatAnalytics(projectData.analytics)
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
