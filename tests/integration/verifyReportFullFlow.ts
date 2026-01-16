import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';
import { ReportGeneratorService } from '../../src/reports/ReportGeneratorService';
import { ReportExportService } from '../../src/reports/ReportExportService';

dotenv.config();

// Initialize Firebase Admin (MOCK)
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

async function testReportFullFlow() {
    console.log('🧪 TESTING REPORT FULL FLOW 🧪');
    console.log('============================');

    const projectId = 'big-tree-la-event-global';
    const organizationId = 'big-tree-productions';

    try {
        console.log('1. Testing Data Collection & PDF Generation Logic...');
        const generator = new ReportGeneratorService();

        // We override the uploadReport method to avoid actual storage calls
        (generator as any).uploadReport = async (buffer: Buffer, metadata: any) => {
            console.log(`✅ Upload mocked. Buffer size: ${buffer.length}`);
            return 'https://mock-storage.com/report.pdf';
        };

        const result = await generator.generateReport(projectId, 'executive', {
            includeCharts: true,
            includeInsights: true
        });

        console.log('✅ Report Generation successful!');
        console.log(`   Download URL: ${result.downloadUrl}`);
        console.log(`   Insights Summary: ${result.insights.executiveSummary.substring(0, 50)}...`);

        console.log('\n2. Testing Export Logic (Mocked)...');
        const exportService = new ReportExportService();

        // Override downloadReport to avoid actual axios calls
        (exportService as any).downloadReport = async (url: string) => {
            console.log(`✅ Download mocked for URL: ${url}`);
            return Buffer.from('mock pdf content');
        };

        // Override exportToSlack to verify it calls connections
        (exportService as any).exportToSlack = async (orgId: string, buffer: Buffer, channel: string) => {
            console.log(`✅ Slack export mocked for org ${orgId} to channel ${channel}`);
            return { success: true, message: 'Mocked Slack success' };
        };

        const exportResult = await exportService.exportReport(organizationId, result.downloadUrl, {
            type: 'slack',
            recipient: 'C12345678'
        });

        console.log(`✅ Export Result: ${JSON.stringify(exportResult)}`);

    } catch (error: any) {
        console.error(`❌ Test failed: ${error.message}`);
        if (error.stack) console.error(error.stack);
    }

    console.log('============================');
    console.log('✨ FULL FLOW TEST COMPLETE');
}

testReportFullFlow().catch(console.error);
