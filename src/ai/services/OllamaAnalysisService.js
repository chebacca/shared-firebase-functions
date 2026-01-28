"use strict";
/**
 * Ollama Analysis Service
 *
 * Replaces Gemini for report generation analysis using local Ollama models.
 * Supports both phi4-mini (fast) and gemma3:12b (quality) with intelligent selection.
 * Provides comprehensive project analysis with structured JSON output.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaAnalysisService = void 0;
const OllamaModelSelector_1 = require("./OllamaModelSelector");
class OllamaAnalysisService {
    ollamaBaseUrl;
    availableModels;
    model;
    timeout;
    source = 'default';
    constructor(baseUrl) {
        this.ollamaBaseUrl = baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        if (baseUrl) {
            this.source = 'explicitly provided';
        }
        else if (process.env.OLLAMA_BASE_URL) {
            this.source = 'environment variable';
        }
        else {
            this.source = 'fallback default';
        }
        console.log(`[OllamaAnalysisService] 🔧 Initialized with base URL: ${this.ollamaBaseUrl} (Source: ${this.source})`);
        // Support multiple models
        this.availableModels = {
            fast: process.env.OLLAMA_MODEL_FAST || 'phi4-mini',
            quality: process.env.OLLAMA_MODEL_QUALITY || 'gemma3:12b'
        };
        // Default to quality model for reports (can be overridden per task)
        this.model = this.availableModels.quality;
        this.timeout = parseInt(process.env.OLLAMA_TIMEOUT || '120000', 10); // 2 min for gemma3
    }
    /**
     * Resolve the base URL, checking Firestore if needed
     */
    async resolveBaseUrl() {
        // If it's already a specific URL (not localhost), just return it
        if (this.ollamaBaseUrl && !this.ollamaBaseUrl.includes('localhost') && !this.ollamaBaseUrl.includes('127.0.0.1')) {
            return this.ollamaBaseUrl;
        }
        // In some runtimes (Electron/local/offline), Firestore-based config overrides are undesirable.
        if (process.env.OLLAMA_DISABLE_FIRESTORE_CONFIG === 'true') {
            return this.ollamaBaseUrl;
        }
        // Try to fetch from Firestore as a dynamic override
        try {
            console.log('[OllamaAnalysisService] 🔍 Checking Firestore for dynamic Ollama URL...');
            // Lazy import so this service can run in environments without firebase-admin
            const adminModule = await Promise.resolve().then(() => __importStar(require('firebase-admin')));
            const adminAny = adminModule?.default || adminModule;
            const configDoc = await adminAny.firestore().collection('_system').doc('config').collection('ai').doc('ollama').get();
            if (configDoc.exists) {
                const data = configDoc.data();
                if (data?.baseUrl) {
                    console.log(`[OllamaAnalysisService] 🚀 Found dynamic Ollama URL in Firestore: ${data.baseUrl}`);
                    return data.baseUrl;
                }
            }
        }
        catch (error) {
            console.warn('[OllamaAnalysisService] ⚠️ Failed to fetch dynamic config from Firestore:', error);
        }
        return this.ollamaBaseUrl;
    }
    /**
     * Check if Ollama is available and get list of available models
     */
    async checkAvailability() {
        try {
            // Re-resolve URL in case it's dynamic
            const activeUrl = await this.resolveBaseUrl();
            console.log(`[OllamaAnalysisService] 🔍 Checking Ollama at: ${activeUrl}`);
            const response = await fetch(`${activeUrl}/api/tags`, {
                method: 'GET',
                headers: {
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'Firebase-Functions-Ollama-Client/1.0'
                },
                signal: AbortSignal.timeout(10000) // Increased timeout to 10 seconds
            });
            if (!response.ok) {
                return false;
            }
            const data = await response.json();
            const availableModelNames = data.models.map((m) => m.name || m.model);
            // Check if at least one of our models is available
            const fastAvailable = availableModelNames.some((m) => m.includes(this.availableModels.fast.split(':')[0]) || m === this.availableModels.fast);
            const qualityAvailable = availableModelNames.some((m) => m.includes(this.availableModels.quality.split(':')[0]) || m === this.availableModels.quality);
            console.log(`[OllamaAnalysisService] Available models: ${availableModelNames.join(', ')}`);
            console.log(`[OllamaAnalysisService] Fast model (${this.availableModels.fast}): ${fastAvailable ? '✅' : '❌'}`);
            console.log(`[OllamaAnalysisService] Quality model (${this.availableModels.quality}): ${qualityAvailable ? '✅' : '❌'}`);
            return fastAvailable || qualityAvailable;
        }
        catch (error) {
            console.error('[OllamaAnalysisService] ❌ Ollama connection failed');
            console.error(`[OllamaAnalysisService] URL: ${this.ollamaBaseUrl}`);
            console.error(`[OllamaAnalysisService] Error type: ${error?.name || 'Unknown'}`);
            console.error(`[OllamaAnalysisService] Error message: ${error?.message || 'No message'}`);
            console.error(`[OllamaAnalysisService] Error stack: ${error?.stack || 'No stack'}`);
            console.warn('[OllamaAnalysisService] Ollama not available:', error);
            return false;
        }
    }
    /**
     * Get list of available models from Ollama
     */
    async getAvailableModels() {
        try {
            const activeUrl = await this.resolveBaseUrl();
            const response = await fetch(`${activeUrl}/api/tags`, {
                method: 'GET',
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                },
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) {
                return [];
            }
            const data = await response.json();
            return data.models.map((m) => m.name || m.model);
        }
        catch (error) {
            console.warn('[OllamaAnalysisService] Error fetching models:', error);
            return [];
        }
    }
    /**
     * Select the best model for the task
     */
    async selectModelForTask(reportType, dataSize) {
        const availableModels = await this.getAvailableModels();
        // Estimate context size
        const contextSize = dataSize < 1000 ? 'small' :
            dataSize < 10000 ? 'medium' : 'large';
        const requirements = {
            type: 'report_generation',
            contextSize,
            priority: reportType === 'financial' || reportType === 'detailed' ? 'quality' : 'balanced',
            reportType: reportType
        };
        const selectedModel = OllamaModelSelector_1.OllamaModelSelector.selectModel(requirements, availableModels);
        console.log(`[OllamaAnalysisService] 🎯 Selected model: ${selectedModel} for ${reportType} report (context: ${contextSize})`);
        return selectedModel;
    }
    /**
     * Analyze project data and generate insights
     * Automatically selects best model (phi4-mini or gemma3:12b) based on task requirements
     */
    async analyzeProject(projectData, options) {
        console.log('[OllamaAnalysisService] 🚀 Starting Ollama project analysis...');
        console.log(`[OllamaAnalysisService] 📋 Report type: ${options.reportType}`);
        console.log(`[OllamaAnalysisService] 📋 Project: ${projectData.projectName} (${projectData.projectId})`);
        // Check availability
        console.log('[OllamaAnalysisService] 🔍 Checking Ollama availability...');
        const isAvailable = await this.checkAvailability();
        if (!isAvailable) {
            console.error('[OllamaAnalysisService] ❌ Ollama is not available');
            throw new Error('Ollama is not available. Please ensure Ollama is running and models are installed.');
        }
        console.log('[OllamaAnalysisService] ✅ Ollama is available');
        // Select best model for this task
        const prompt = this.buildAnalysisPrompt(projectData, options);
        const dataSize = prompt.length;
        console.log(`[OllamaAnalysisService] 📝 Prompt size: ${dataSize} characters`);
        console.log('[OllamaAnalysisService] 🎯 Selecting best model for this task...');
        const selectedModel = await this.selectModelForTask(options.reportType, dataSize);
        // Adjust timeout based on model
        const modelTimeout = selectedModel.includes('gemma3') ? 120000 : 90000;
        console.log(`[OllamaAnalysisService] ✅ Selected model: ${selectedModel}`);
        console.log(`[OllamaAnalysisService] 📊 Analyzing project with Ollama`);
        console.log(`[OllamaAnalysisService] 🤖 Model: ${selectedModel}`);
        console.log(`[OllamaAnalysisService] 📝 Prompt length: ${prompt.length} chars`);
        console.log(`[OllamaAnalysisService] ⏱️ Timeout: ${modelTimeout}ms`);
        console.log(`[OllamaAnalysisService] 💰 Cost: $0 (local processing, private)`);
        // Adjust generation parameters based on model
        const isGemma3 = selectedModel.includes('gemma3');
        const generationOptions = {
            temperature: isGemma3 ? 0.4 : 0.5, // Lower for gemma3 for more structured output
            top_p: 0.9,
            top_k: isGemma3 ? 40 : 20, // Higher for gemma3
            num_predict: isGemma3 ? 4000 : 3000, // More tokens for gemma3
            repeat_penalty: 1.1,
            stop: ['\n\n---', '### END', '```']
        };
        // Generate analysis
        const startTime = Date.now();
        const activeUrl = await this.resolveBaseUrl();
        const response = await fetch(`${activeUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true',
                'User-Agent': 'Firebase-Functions-Ollama-Client/1.0'
            },
            body: JSON.stringify({
                model: selectedModel,
                prompt: prompt,
                stream: false,
                options: generationOptions
            }),
            signal: AbortSignal.timeout(modelTimeout)
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        const generatedText = data.response || '';
        const duration = Date.now() - startTime;
        console.log(`[OllamaAnalysisService] ✅ Analysis generated successfully`);
        console.log(`[OllamaAnalysisService] ⏱️ Generation duration: ${duration}ms`);
        console.log(`[OllamaAnalysisService] 📊 Response length: ${generatedText.length} characters`);
        console.log(`[OllamaAnalysisService] 🤖 Model used: ${selectedModel}`);
        if (data.total_duration) {
            const totalSeconds = (data.total_duration / 1000000000).toFixed(2);
            console.log(`[OllamaAnalysisService] ⏱️ Total Ollama processing time: ${totalSeconds}s`);
        }
        // Parse JSON from response
        const insights = this.parseInsightsResponse(generatedText, projectData, options);
        return insights;
    }
    /**
     * Build optimized analysis prompt
     * For gemma3:12b, can include more context and detail
     * For phi4-mini, keeps it concise and structured
     */
    buildAnalysisPrompt(projectData, options) {
        // Build concise data summary
        const dataSummary = this.buildDataSummary(projectData, options);
        // Build analysis requirements (concise, numbered)
        const requirements = this.buildAnalysisRequirements(options);
        // Build output format (explicit JSON schema)
        const outputFormat = this.buildOutputFormat(options);
        return `Analyze this video production project and generate a ${options.reportType} report.

PROJECT DATA:
${dataSummary}

ANALYSIS REQUIREMENTS:
${requirements}

MATCH THE JSON SCHEMA STRICTLY. Do not use trailing commas. Ensure all keys and string values are DOUBLE QUOTED. Do not add comments.

OUTPUT FORMAT (JSON only, no markdown):
${outputFormat}

Generate the analysis now. Return ONLY valid JSON, no explanations.`;
    }
    /**
     * Build concise data summary
     */
    buildDataSummary(projectData, options) {
        const lines = [];
        // Basic project info
        lines.push(`Project: ${projectData.projectName} (${projectData.projectId})`);
        lines.push(`Date Range: ${projectData.dateRange?.start || 'N/A'} to ${projectData.dateRange?.end || 'N/A'}`);
        // Budget
        if (projectData.budget) {
            lines.push(`Budget: $${(projectData.budget.allocated || 0).toLocaleString()} allocated, $${(projectData.budget.spent || 0).toLocaleString()} spent`);
        }
        // Sessions
        lines.push(`Sessions: ${projectData.sessions?.length || 0} total`);
        if (projectData.sessions?.length > 0) {
            const statusCounts = {};
            projectData.sessions.forEach((s) => {
                const status = s.status || 'unknown';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            lines.push(`  Status: ${Object.entries(statusCounts).map(([s, c]) => `${s}:${c}`).join(', ')}`);
        }
        // Team
        lines.push(`Team: ${projectData.team?.length || 0} members`);
        if (projectData.team?.length > 0) {
            const deptCounts = {};
            projectData.team.forEach((t) => {
                const dept = t.department || 'General';
                deptCounts[dept] = (deptCounts[dept] || 0) + 1;
            });
            lines.push(`  Departments: ${Object.entries(deptCounts).map(([d, c]) => `${d}:${c}`).join(', ')}`);
        }
        // Deliverables
        lines.push(`Deliverables: ${projectData.deliverables?.length || 0} total`);
        if (projectData.deliverables?.length > 0) {
            const statusCounts = {};
            projectData.deliverables.forEach((d) => {
                const status = d.status || 'unknown';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            lines.push(`  Status: ${Object.entries(statusCounts).map(([s, c]) => `${s}:${c}`).join(', ')}`);
        }
        // Workflows
        lines.push(`Workflows: ${projectData.workflows?.length || 0} total`);
        // Financial data (for financial reports)
        if (options.reportType === 'financial' && projectData.financialSummary) {
            const fs = projectData.financialSummary;
            lines.push(`\nFINANCIAL DATA:`);
            lines.push(`  Income: $${(fs.totalIncome || 0).toLocaleString()}`);
            lines.push(`  Expenses: $${(fs.totalExpenses || 0).toLocaleString()}`);
            lines.push(`  Payroll: $${(fs.totalPayroll || 0).toLocaleString()}`);
            lines.push(`  Net Cash Flow: $${(fs.netCashFlow || 0).toLocaleString()}`);
        }
        // Analytics (if available)
        if (projectData.analytics) {
            const a = projectData.analytics;
            lines.push(`\nANALYTICS:`);
            lines.push(`  Deliverables: ${a.totalDeliverablesCount || 0} total, ${a.completedDeliverablesCount || 0} completed, ${a.blockedDeliverablesCount || 0} blocked`);
            lines.push(`  Sessions: ${a.totalSessions || 0} total`);
            if (a.timecardByDepartment) {
                lines.push(`  Labor Costs:`);
                Object.entries(a.timecardByDepartment).forEach(([dept, data]) => {
                    lines.push(`    ${dept}: ${(data.hours || 0).toFixed(1)}h, $${(data.cost || 0).toLocaleString()}`);
                });
            }
            if (a.expenseByCategory) {
                lines.push(`  Expenses:`);
                Object.entries(a.expenseByCategory).forEach(([cat, data]) => {
                    lines.push(`    ${cat}: $${(data.amount || 0).toLocaleString()}`);
                });
            }
        }
        return lines.join('\n');
    }
    /**
     * Build concise analysis requirements
     */
    buildAnalysisRequirements(options) {
        const requirements = [];
        if (options.reportType === 'financial') {
            requirements.push('1. Financial Health: Analyze cash flow, budget variance, spending patterns');
            requirements.push('2. Cost Analysis: Review labor costs by department, expense categories');
            requirements.push('3. Financial Risks: Identify overspending, cash flow issues, budget problems');
            requirements.push('4. Recommendations: Provide cost optimization and financial management advice');
        }
        else {
            requirements.push('1. Project Health: Assess completion rate, timeline status, resource utilization');
            requirements.push('2. Budget Analysis: Review spending vs allocation, identify variances');
            requirements.push('3. Deliverables: Analyze completion status, blocked items, workflow progress');
            requirements.push('4. Team Performance: Evaluate department distribution, labor efficiency');
            requirements.push('5. Risks: Identify operational, financial, and timeline risks');
            requirements.push('6. Recommendations: Provide actionable improvements');
        }
        return requirements.join('\n');
    }
    /**
     * Build explicit JSON output format
     */
    buildOutputFormat(options) {
        const baseFormat = `{
  "executiveSummary": "string (3-5 paragraphs covering all critical areas)",
  "keyHighlights": ["string (8-10 key insights)"],
  "risks": [{"category": "string", "description": "string", "severity": "low|medium|high", "mitigation": "string"}],
  "recommendations": ["string (8-10 actionable recommendations)"],
  "metrics": {
    "totalBudget": "string (formatted currency)",
    "spent": "string (formatted currency)",
    "completionPercentage": number,
    "activeTasks": number,
    "teamUtilization": "string"`;
        if (options.reportType === 'financial') {
            return baseFormat + `,
    "netCashFlow": "string (formatted currency)",
    "totalIncome": "string (formatted currency)",
    "totalExpenses": "string (formatted currency)",
    "totalPayroll": "string (formatted currency)",
    "budgetVariance": "string (percentage)",
    "blockedDeliverables": number
  }
}`;
        }
        return baseFormat + `
  }
}`;
    }
    /**
     * Parse insights from Ollama response
     * Handles various response formats and validates structure
     */
    parseInsightsResponse(response, projectData, options) {
        console.log('[OllamaAnalysisService] 🔍 Parsing insights response...');
        try {
            // First try: Standard clean and parse
            let jsonText = this.cleanJsonString(response);
            const parsed = JSON.parse(jsonText);
            return this.normalizeInsights(parsed, projectData, options);
        }
        catch (error) {
            console.warn('[OllamaAnalysisService] ⚠️ Standard JSON parse failed, attempting advanced repair...');
            try {
                // Second try: Advanced repair (fix unquoted keys, trailing commas)
                const repairedJson = this.repairJson(response);
                const parsed = JSON.parse(repairedJson);
                console.log('[OllamaAnalysisService] ✅ Advanced JSON repair successful');
                return this.normalizeInsights(parsed, projectData, options);
            }
            catch (secondError) {
                console.error('[OllamaAnalysisService] ❌ Failed to parse JSON even after repair:', secondError);
                console.error('[OllamaAnalysisService] Raw response:', response.substring(0, 500) + '...');
                // Fallback: Try to extract key parts manually
                return this.extractInsightsFromText(response, projectData, options);
            }
        }
    }
    /**
     * Basic JSON string cleanup (markdown, extraction)
     */
    cleanJsonString(input) {
        let text = input.trim();
        // Remove markdown code blocks
        text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        // Extract JSON structure if embedded in text
        const match = text.match(/\{[\s\S]*\}/);
        if (match)
            text = match[0];
        return text;
    }
    /**
     * Advanced JSON repair for common LLM errors
     */
    repairJson(input) {
        let text = this.cleanJsonString(input);
        // Remove comments
        text = text.replace(/\/\/.*$/gm, '');
        text = text.replace(/\/\*[\s\S]*?\*\//g, '');
        // Fix trailing commas
        text = text.replace(/,(\s*[}\]])/g, '$1');
        // Fix unquoted keys (e.g., key: "value" -> "key": "value")
        // Be careful not to replace things inside strings
        // This regex looks for { or , followed by word chars, followed by :
        text = text.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        // Fix single quoted keys ('key': "value" -> "key": "value")
        text = text.replace(/([{,]\s*)'([a-zA-Z0-9_]+)'\s*:/g, '$1"$2":');
        return text;
    }
    /**
     * Normalize parsed insights to match expected structure
     */
    normalizeInsights(parsed, projectData, options) {
        // Ensure all required fields exist
        const insights = {
            executiveSummary: parsed.executiveSummary || this.generateFallbackSummary(projectData, options),
            keyHighlights: Array.isArray(parsed.keyHighlights)
                ? parsed.keyHighlights
                : this.extractHighlights(parsed),
            risks: Array.isArray(parsed.risks)
                ? parsed.risks.map((r) => ({
                    category: r.category || 'General',
                    description: r.description || r.risk || '',
                    severity: (r.severity || 'medium'),
                    mitigation: r.mitigation || r.recommendation || ''
                }))
                : [],
            recommendations: Array.isArray(parsed.recommendations)
                ? parsed.recommendations
                : this.extractRecommendations(parsed),
            metrics: this.normalizeMetrics(parsed.metrics || {}, projectData, options)
        };
        // Ensure minimum counts
        if (insights.keyHighlights.length < 5) {
            insights.keyHighlights.push(...this.generateDefaultHighlights(projectData));
        }
        if (insights.risks.length < 3) {
            insights.risks.push(...this.generateDefaultRisks(projectData));
        }
        if (insights.recommendations.length < 5) {
            insights.recommendations.push(...this.generateDefaultRecommendations(projectData));
        }
        return insights;
    }
    /**
     * Extract insights from text if JSON parsing fails
     */
    extractInsightsFromText(text, projectData, options) {
        console.warn('[OllamaAnalysisService] ⚠️ Using fallback text extraction');
        // Try to extract sections
        const summaryMatch = text.match(/executiveSummary["\s:]+"([^"]+)"/i) ||
            text.match(/summary["\s:]+"([^"]+)"/i);
        const highlights = [];
        const highlightsMatches = text.matchAll(/"([^"]+)"\s*[,\]]/g);
        for (const match of highlightsMatches) {
            if (match[1].length > 20 && match[1].length < 200) {
                highlights.push(match[1]);
            }
        }
        return {
            executiveSummary: summaryMatch?.[1] || this.generateFallbackSummary(projectData, options),
            keyHighlights: highlights.slice(0, 10) || this.generateDefaultHighlights(projectData),
            risks: this.generateDefaultRisks(projectData),
            recommendations: highlights.slice(10, 20) || this.generateDefaultRecommendations(projectData),
            metrics: this.normalizeMetrics({}, projectData, options)
        };
    }
    /**
     * Normalize metrics object
     */
    normalizeMetrics(metrics, projectData, options) {
        const formatCurrency = (num) => {
            return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        };
        const base = {
            totalBudget: typeof metrics.totalBudget === 'string'
                ? metrics.totalBudget
                : formatCurrency(projectData.budget?.allocated || 0),
            spent: typeof metrics.spent === 'string'
                ? metrics.spent
                : formatCurrency(projectData.budget?.spent || 0),
            completionPercentage: typeof metrics.completionPercentage === 'number'
                ? metrics.completionPercentage
                : projectData.keyMetrics?.completionPercentage || 0,
            activeTasks: typeof metrics.activeTasks === 'number'
                ? metrics.activeTasks
                : projectData.deliverables?.filter((d) => d.status !== 'completed').length || 0,
            teamUtilization: typeof metrics.teamUtilization === 'string'
                ? metrics.teamUtilization
                : `${projectData.team?.length || 0} team members`
        };
        // Add financial metrics for financial reports
        if (options.reportType === 'financial' && projectData.financialSummary) {
            const fs = projectData.financialSummary;
            return {
                ...base,
                ...(metrics.netCashFlow ? { netCashFlow: metrics.netCashFlow } : { netCashFlow: formatCurrency(fs.netCashFlow || 0) }),
                ...(metrics.totalIncome ? { totalIncome: metrics.totalIncome } : { totalIncome: formatCurrency(fs.totalIncome || 0) }),
                ...(metrics.totalExpenses ? { totalExpenses: metrics.totalExpenses } : { totalExpenses: formatCurrency(fs.totalExpenses || 0) }),
                ...(metrics.totalPayroll ? { totalPayroll: metrics.totalPayroll } : { totalPayroll: formatCurrency(fs.totalPayroll || 0) })
            };
        }
        return base;
    }
    /**
     * Generate fallback summary if parsing fails
     */
    generateFallbackSummary(projectData, options) {
        const budget = projectData.budget;
        const allocated = budget?.allocated || 0;
        const spent = budget?.spent || 0;
        const variance = (allocated > 0) ? ((spent - allocated) / allocated * 100).toFixed(1) : '0';
        return `This ${options.reportType} report analyzes ${projectData.projectName}. ` +
            `Budget status: ${variance}% variance ($${allocated.toLocaleString()} allocated, $${spent.toLocaleString()} spent). ` +
            `Project includes ${projectData.sessions?.length || 0} sessions, ${projectData.team?.length || 0} team members, ` +
            `and ${projectData.deliverables?.length || 0} deliverables. ` +
            `Analysis focuses on ${options.reportType === 'financial' ? 'financial performance, cash flow, and cost optimization' : 'project health, timeline, and resource utilization'}.`;
    }
    /**
     * Extract highlights from parsed object
     */
    extractHighlights(parsed) {
        const highlights = [];
        if (Array.isArray(parsed.keyHighlights)) {
            return parsed.keyHighlights;
        }
        if (parsed.highlights && Array.isArray(parsed.highlights)) {
            return parsed.highlights;
        }
        if (typeof parsed.keyPoints === 'string') {
            return parsed.keyPoints.split('\n').filter((s) => s.trim().length > 10);
        }
        return highlights;
    }
    /**
     * Extract recommendations from parsed object
     */
    extractRecommendations(parsed) {
        if (Array.isArray(parsed.recommendations)) {
            return parsed.recommendations;
        }
        if (parsed.recommendations && typeof parsed.recommendations === 'string') {
            return parsed.recommendations.split('\n').filter((s) => s.trim().length > 10);
        }
        return [];
    }
    /**
     * Generate default highlights
     */
    generateDefaultHighlights(projectData) {
        return [
            `Project: ${projectData.projectName}`,
            `Budget: $${(projectData.budget?.allocated || 0).toLocaleString()} allocated`,
            `${projectData.sessions?.length || 0} sessions in progress`,
            `${projectData.team?.length || 0} team members assigned`,
            `${projectData.deliverables?.length || 0} deliverables tracked`
        ];
    }
    /**
     * Generate default risks
     */
    generateDefaultRisks(projectData) {
        const risks = [];
        if (projectData.budget) {
            const variance = projectData.budget.allocated > 0
                ? ((projectData.budget.spent - projectData.budget.allocated) / projectData.budget.allocated * 100)
                : 0;
            if (variance > 10) {
                risks.push({
                    category: 'Financial',
                    description: `Budget variance of ${variance.toFixed(1)}% indicates potential overspending`,
                    severity: variance > 20 ? 'high' : 'medium',
                    mitigation: 'Review expenses and adjust spending to align with budget'
                });
            }
        }
        const blocked = projectData.deliverables?.filter((d) => d.status === 'blocked').length || 0;
        if (blocked > 0) {
            risks.push({
                category: 'Operational',
                description: `${blocked} deliverable(s) are blocked, impacting project timeline`,
                severity: blocked > 3 ? 'high' : 'medium',
                mitigation: 'Review blocked deliverables and resolve dependencies'
            });
        }
        return risks;
    }
    /**
     * Generate default recommendations
     */
    generateDefaultRecommendations(projectData) {
        return [
            'Monitor budget variance and adjust spending as needed',
            'Review blocked deliverables and resolve dependencies',
            'Optimize team resource allocation across departments',
            'Track workflow progress to identify bottlenecks',
            'Ensure regular status updates and communication'
        ];
    }
}
exports.OllamaAnalysisService = OllamaAnalysisService;
