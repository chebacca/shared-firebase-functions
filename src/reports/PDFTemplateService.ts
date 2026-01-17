import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectInsights, KeyMetrics } from '../ai/services/DocumentAnalysisService';

// Import standard puppeteer for local dev types/usage
import puppeteer from 'puppeteer';

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
            console.log(`📄 [PDFTemplateService] Using cached template: ${templateName}`);
            return this.templateCache.get(templateName)!;
        }

        const templatePath = path.join(this.templatesDir, `${templateName}-report.html`);
        console.log(`📄 [PDFTemplateService] Loading template from: ${templatePath}`);

        // Fallback if template doesn't exist yet
        if (!fs.existsSync(templatePath)) {
            console.warn(`⚠️ [PDFTemplateService] Template ${templateName} not found at ${templatePath}, using basic fallback`);
            console.warn(`⚠️ [PDFTemplateService] Templates directory: ${this.templatesDir}`);
            console.warn(`⚠️ [PDFTemplateService] Available files:`, fs.existsSync(this.templatesDir) ? fs.readdirSync(this.templatesDir) : 'directory not found');
            
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

        console.log(`✅ [PDFTemplateService] Template found, loading content...`);
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        console.log(`✅ [PDFTemplateService] Template loaded, size: ${templateContent.length} bytes`);
        const compiledTemplate = handlebars.compile(templateContent);
        this.templateCache.set(templateName, compiledTemplate);

        return compiledTemplate;
    }

    async renderTemplate(templateName: string, data: TemplateData): Promise<string> {
        const template = await this.loadTemplate(templateName);
        return template(data);
    }

    async generatePDF(html: string, options: PDFOptions = {}): Promise<Buffer> {
        // Detect environment (Cloud Functions or Local)
        // More robust detection: default to production (Cloud Functions) unless explicitly local
        // Cloud Functions environment indicators:
        // - K_SERVICE: Google Cloud Run service name
        // - FUNCTION_TARGET: Function name
        // - FUNCTION_NAME: Function name (legacy)
        // - GCLOUD_PROJECT: GCP project ID
        // - GOOGLE_CLOUD_PROJECT: Alternative GCP project ID
        // - _FUNCTION_NAME: Internal Cloud Functions variable
        const isCloudFunctions = !!(
            process.env.K_SERVICE || 
            process.env.FUNCTION_TARGET || 
            process.env.FUNCTION_NAME || 
            process.env._FUNCTION_NAME ||
            process.env.GCLOUD_PROJECT || 
            process.env.GOOGLE_CLOUD_PROJECT
        );
        
        // Local development indicators:
        // - FUNCTIONS_EMULATOR: Firebase emulator
        // - NODE_ENV=development: Development mode
        // - Explicitly not in GCP
        const isLocal = !!(
            process.env.FUNCTIONS_EMULATOR || 
            (process.env.NODE_ENV === 'development' && !isCloudFunctions)
        );
        
        // Default to production (Cloud Functions) if we can't determine - safer
        const useProduction = isCloudFunctions || !isLocal;
        
        let browser;

        try {
            if (useProduction) {
                console.log('🚀 [PDFTemplateService] Using @sparticuz/chromium for Cloud environment');
                console.log(`[PDFTemplateService] Env check: K_SERVICE=${process.env.K_SERVICE}, FUNCTION_TARGET=${process.env.FUNCTION_TARGET}, GCLOUD_PROJECT=${process.env.GCLOUD_PROJECT}`);
                
                const chromium = require('@sparticuz/chromium');
                const puppeteerCore = require('puppeteer-core');

                // Configure chromium for serverless environment
                // Note: setGraphicsMode is only available in newer versions of @sparticuz/chromium
                if (typeof chromium.setGraphicsMode === 'function') {
                    chromium.setGraphicsMode(false);
                }

                browser = await puppeteerCore.launch({
                    args: chromium.args,
                    defaultViewport: chromium.defaultViewport,
                    executablePath: await chromium.executablePath(),
                    headless: chromium.headless,
                    ignoreHTTPSErrors: true
                });
            } else {
                console.log('💻 [PDFTemplateService] Using local Puppeteer');
                console.log(`[PDFTemplateService] Environment: K_SERVICE=${process.env.K_SERVICE}, FUNCTION_NAME=${process.env.FUNCTION_NAME}, GCLOUD_PROJECT=${process.env.GCLOUD_PROJECT}, FUNCTIONS_EMULATOR=${process.env.FUNCTIONS_EMULATOR}`);
                
                // Use standard puppeteer locally which manages its own chrome
                const puppeteerLocal = require('puppeteer');
                
                // Configure cache directory if needed (fallback to default)
                const launchOptions: any = {
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                };

                // Only set cache directory if explicitly configured
                if (process.env.PUPPETEER_CACHE_DIR) {
                    launchOptions.cacheDirectory = process.env.PUPPETEER_CACHE_DIR;
                }

                try {
                    browser = await puppeteerLocal.launch(launchOptions);
                } catch (localError: any) {
                    // If local Puppeteer fails (e.g., Chrome not found), try to use @sparticuz/chromium as fallback
                    if (localError.message && localError.message.includes('Could not find Chrome')) {
                        console.warn('⚠️ [PDFTemplateService] Local Puppeteer failed, attempting fallback to @sparticuz/chromium');
                        try {
                            const chromium = require('@sparticuz/chromium');
                            const puppeteerCore = require('puppeteer-core');
                            
                            // Note: setGraphicsMode is only available in newer versions
                            if (typeof chromium.setGraphicsMode === 'function') {
                                chromium.setGraphicsMode(false);
                            }
                            
                            browser = await puppeteerCore.launch({
                                args: chromium.args,
                                defaultViewport: chromium.defaultViewport,
                                executablePath: await chromium.executablePath(),
                                headless: chromium.headless,
                                ignoreHTTPSErrors: true
                            });
                            console.log('✅ [PDFTemplateService] Successfully using @sparticuz/chromium fallback');
                        } catch (fallbackError) {
                            console.error('❌ [PDFTemplateService] Both local Puppeteer and @sparticuz/chromium failed');
                            throw new Error(`Failed to launch browser: ${localError.message}. Fallback also failed: ${fallbackError}`);
                        }
                    } else {
                        throw localError;
                    }
                }
            }

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
        } catch (error) {
            console.error('❌ [PDFTemplateService] Error generating PDF:', error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async generateReportPDF(templateName: string, data: TemplateData): Promise<Buffer> {
        const html = await this.renderTemplate(templateName, data);
        return this.generatePDF(html);
    }
}
