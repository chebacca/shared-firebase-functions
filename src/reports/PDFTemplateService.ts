import puppeteer from 'puppeteer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectInsights, KeyMetrics } from '../ai/services/DocumentAnalysisService';

export interface TemplateData {
    projectName: string;
    projectId: string;
    generatedAt: string;
    dateRange: string;
    executiveSummary: string;
    insights: ProjectInsights;
    metrics: KeyMetrics;
    charts: {
        budget?: string;
        timeline?: string;
        team?: string;
        deliverables?: string;
    };
    [key: string]: any;
}

export interface PDFOptions {
    format?: 'A4' | 'Letter';
    printBackground?: boolean;
}

export class PDFTemplateService {
    private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
    private templatesDir: string;

    constructor() {
        this.templatesDir = path.resolve(__dirname, 'templates');
    }

    private async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
        if (this.templateCache.has(templateName)) {
            return this.templateCache.get(templateName)!;
        }

        const templatePath = path.join(this.templatesDir, `${templateName}-report.html`);

        // Fallback if template doesn't exist yet
        if (!fs.existsSync(templatePath)) {
            console.warn(`Template ${templateName} not found, checking fallback locations`);
            // Since we might be running in a compiled environment, check relative to the file current location
            // or implement a basic fallback string template
            const defaultTemplate = `
        <!DOCTYPE html>
        <html>
        <head><title>{{projectName}} Report</title></head>
        <body>
          <h1>{{projectName}}</h1>
          <p>{{executiveSummary}}</p>
        </body>
        </html>
      `;
            return handlebars.compile(defaultTemplate);
        }

        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const compiledTemplate = handlebars.compile(templateContent);
        this.templateCache.set(templateName, compiledTemplate);

        return compiledTemplate;
    }

    async renderTemplate(templateName: string, data: TemplateData): Promise<string> {
        const template = await this.loadTemplate(templateName);
        return template(data);
    }

    async generatePDF(html: string, options: PDFOptions = {}): Promise<Buffer> {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        try {
            const page = await browser.newPage();

            // Set content and wait for network idle to ensure everything loaded
            await page.setContent(html, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const pdfBuffer = await page.pdf({
                format: options.format || 'A4',
                printBackground: options.printBackground ?? true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                }
            });

            return Buffer.from(pdfBuffer);
        } finally {
            await browser.close();
        }
    }

    async generateReportPDF(templateName: string, data: TemplateData): Promise<Buffer> {
        const html = await this.renderTemplate(templateName, data);
        return this.generatePDF(html);
    }
}
