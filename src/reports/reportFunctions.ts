import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ReportGeneratorService, ReportOptions } from './ReportGeneratorService';
import { DocumentAnalysisService } from '../ai/services/DocumentAnalysisService';
import * as admin from 'firebase-admin';

// Initialize services lazily/inside functions to avoid cold start issues if possible
// but for now simple instantiation

export const generateProjectReport = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in to generate reports');
    }

    const { projectId, reportType, options } = request.data as {
        projectId: string;
        reportType?: 'executive' | 'detailed' | 'financial' | 'production';
        options?: ReportOptions
    };

    if (!projectId) {
        throw new HttpsError('invalid-argument', 'projectId is required');
    }

    // TODO: Validate user access to project here

    try {
        const reportGenerator = new ReportGeneratorService();
        const result = await reportGenerator.generateReport(
            projectId,
            reportType,
            options
        );

        return result;
    } catch (error: any) {
        console.error('Error generating report:', error);
        throw new HttpsError('internal', `Failed to generate report: ${error.message}`);
    }
});

export const analyzeProject = onCall({ timeoutSeconds: 60, memory: '1GiB' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { projectId, analysisType } = request.data as { projectId: string; analysisType?: string };

    // TODO: Mock data collection for now as in service
    const mockProjectData = {
        projectName: "Project Alpha",
        organizationId: "org-123",
        projectId: projectId,
        dateRange: { start: "2024-01-01", end: "2024-12-31" },
        budget: { allocated: 50000, spent: 35000 },
        sessions: [], workflows: [], team: [], deliverables: []
    };

    try {
        const analysisService = new DocumentAnalysisService();
        const insights = await analysisService.analyzeProject(mockProjectData, {
            reportType: (analysisType as any) || 'executive'
        });

        return insights;
    } catch (error: any) {
        console.error('Error analyzing project:', error);
        throw new HttpsError('internal', `Failed to analyze project: ${error.message}`);
    }
});

export const getReportStatus = onCall(
  { memory: '512MiB' }, // Avoid Cloud Run container healthcheck timeout on cold start
  async (request) => {
    // Placeholder for when we implement async background generation
    return { status: 'completed' };
  }
);

import { ReportExportService, ExportDestination } from './ReportExportService';

export const exportReport = onCall({ memory: '1GiB', timeoutSeconds: 120 }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { organizationId, reportUrl, destination, recipient } = request.data as {
        organizationId: string;
        reportUrl: string;
        destination: 'slack' | 'drive' | 'email';
        recipient: string;
    };

    if (!organizationId || !reportUrl || !destination || !recipient) {
        throw new HttpsError('invalid-argument', 'Missing required parameters for export');
    }

    try {
        const exportService = new ReportExportService();
        const result = await exportService.exportReport(organizationId, reportUrl, {
            type: destination,
            recipient
        });

        if (!result.success) {
            throw new HttpsError('internal', result.message);
        }

        return result;
    } catch (error: any) {
        console.error('Error exporting report:', error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `Failed to export report: ${error.message}`);
    }
});
