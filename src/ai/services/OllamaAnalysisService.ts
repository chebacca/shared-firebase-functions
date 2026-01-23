/**
 * Ollama Analysis Service
 * 
 * Replaces Gemini for report generation analysis using local Ollama models.
 * Supports both phi4-mini (fast) and gemma3:12b (quality) with intelligent selection.
 * Provides comprehensive project analysis with structured JSON output.
 */

import { ProjectData, AnalysisOptions, ProjectInsights, Risk, KeyMetrics } from './DocumentAnalysisService';
import { OllamaModelSelector, TaskRequirements } from './OllamaModelSelector';

export class OllamaAnalysisService {
    private ollamaBaseUrl: string;
    private availableModels: {
        fast: string;
        quality: string;
    };
    private model: string;
    private timeout: number;

    constructor() {
        this.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        
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
     * Check if Ollama is available and get list of available models
     */
    async checkAvailability(): Promise<boolean> {
        try {
            const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                return false;
            }

            const data = await response.json();
            const availableModelNames = data.models.map((m: any) => m.name || m.model);
            
            // Check if at least one of our models is available
            const fastAvailable = availableModelNames.some((m: string) => 
                m.includes(this.availableModels.fast.split(':')[0]) || m === this.availableModels.fast
            );
            const qualityAvailable = availableModelNames.some((m: string) => 
                m.includes(this.availableModels.quality.split(':')[0]) || m === this.availableModels.quality
            );
            
            console.log(`[OllamaAnalysisService] Available models: ${availableModelNames.join(', ')}`);
            console.log(`[OllamaAnalysisService] Fast model (${this.availableModels.fast}): ${fastAvailable ? '✅' : '❌'}`);
            console.log(`[OllamaAnalysisService] Quality model (${this.availableModels.quality}): ${qualityAvailable ? '✅' : '❌'}`);
            
            return fastAvailable || qualityAvailable;
        } catch (error) {
            console.warn('[OllamaAnalysisService] Ollama not available:', error);
            return false;
        }
    }

    /**
     * Get list of available models from Ollama
     */
    private async getAvailableModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.ollamaBaseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            return data.models.map((m: any) => m.name || m.model);
        } catch (error) {
            console.warn('[OllamaAnalysisService] Error fetching models:', error);
            return [];
        }
    }

    /**
     * Select the best model for the task
     */
    private async selectModelForTask(reportType: string, dataSize: number): Promise<string> {
        const availableModels = await this.getAvailableModels();
        
        // Estimate context size
        const contextSize: 'small' | 'medium' | 'large' = 
            dataSize < 1000 ? 'small' : 
            dataSize < 10000 ? 'medium' : 'large';

        const requirements: TaskRequirements = {
            type: 'report_generation',
            contextSize,
            priority: reportType === 'financial' || reportType === 'detailed' ? 'quality' : 'balanced',
            reportType: reportType as any
        };

        const selectedModel = OllamaModelSelector.selectModel(requirements, availableModels);
        console.log(`[OllamaAnalysisService] 🎯 Selected model: ${selectedModel} for ${reportType} report (context: ${contextSize})`);
        
        return selectedModel;
    }

    /**
     * Analyze project data and generate insights
     * Automatically selects best model (phi4-mini or gemma3:12b) based on task requirements
     */
    async analyzeProject(projectData: ProjectData, options: AnalysisOptions): Promise<ProjectInsights> {
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
        const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
    private buildAnalysisPrompt(projectData: ProjectData, options: AnalysisOptions): string {
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

OUTPUT FORMAT (JSON only, no markdown):
${outputFormat}

Generate the analysis now. Return ONLY valid JSON, no explanations.`;
    }

    /**
     * Build concise data summary
     */
    private buildDataSummary(projectData: ProjectData, options: AnalysisOptions): string {
        const lines: string[] = [];

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
            const statusCounts: Record<string, number> = {};
            projectData.sessions.forEach((s: any) => {
                const status = s.status || 'unknown';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });
            lines.push(`  Status: ${Object.entries(statusCounts).map(([s, c]) => `${s}:${c}`).join(', ')}`);
        }

        // Team
        lines.push(`Team: ${projectData.team?.length || 0} members`);
        if (projectData.team?.length > 0) {
            const deptCounts: Record<string, number> = {};
            projectData.team.forEach((t: any) => {
                const dept = t.department || 'General';
                deptCounts[dept] = (deptCounts[dept] || 0) + 1;
            });
            lines.push(`  Departments: ${Object.entries(deptCounts).map(([d, c]) => `${d}:${c}`).join(', ')}`);
        }

        // Deliverables
        lines.push(`Deliverables: ${projectData.deliverables?.length || 0} total`);
        if (projectData.deliverables?.length > 0) {
            const statusCounts: Record<string, number> = {};
            projectData.deliverables.forEach((d: any) => {
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
                Object.entries(a.timecardByDepartment).forEach(([dept, data]: [string, any]) => {
                    lines.push(`    ${dept}: ${(data.hours || 0).toFixed(1)}h, $${(data.cost || 0).toLocaleString()}`);
                });
            }
            if (a.expenseByCategory) {
                lines.push(`  Expenses:`);
                Object.entries(a.expenseByCategory).forEach(([cat, data]: [string, any]) => {
                    lines.push(`    ${cat}: $${(data.amount || 0).toLocaleString()}`);
                });
            }
        }

        return lines.join('\n');
    }

    /**
     * Build concise analysis requirements
     */
    private buildAnalysisRequirements(options: AnalysisOptions): string {
        const requirements: string[] = [];

        if (options.reportType === 'financial') {
            requirements.push('1. Financial Health: Analyze cash flow, budget variance, spending patterns');
            requirements.push('2. Cost Analysis: Review labor costs by department, expense categories');
            requirements.push('3. Financial Risks: Identify overspending, cash flow issues, budget problems');
            requirements.push('4. Recommendations: Provide cost optimization and financial management advice');
        } else {
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
    private buildOutputFormat(options: AnalysisOptions): string {
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
    private parseInsightsResponse(
        response: string,
        projectData: ProjectData,
        options: AnalysisOptions
    ): ProjectInsights {
        console.log('[OllamaAnalysisService] 🔍 Parsing insights response...');

        // Try to extract JSON from response
        let jsonText = response.trim();

        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

        // Extract JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        }

        try {
            const parsed = JSON.parse(jsonText);
            
            // Validate and normalize structure
            return this.normalizeInsights(parsed, projectData, options);
        } catch (error) {
            console.error('[OllamaAnalysisService] ❌ Failed to parse JSON:', error);
            console.error('[OllamaAnalysisService] Raw response:', response.substring(0, 500));
            
            // Fallback: Try to extract key parts manually
            return this.extractInsightsFromText(response, projectData, options);
        }
    }

    /**
     * Normalize parsed insights to match expected structure
     */
    private normalizeInsights(
        parsed: any,
        projectData: ProjectData,
        options: AnalysisOptions
    ): ProjectInsights {
        // Ensure all required fields exist
        const insights: ProjectInsights = {
            executiveSummary: parsed.executiveSummary || this.generateFallbackSummary(projectData, options),
            keyHighlights: Array.isArray(parsed.keyHighlights) 
                ? parsed.keyHighlights 
                : this.extractHighlights(parsed),
            risks: Array.isArray(parsed.risks) 
                ? parsed.risks.map((r: any) => ({
                    category: r.category || 'General',
                    description: r.description || r.risk || '',
                    severity: (r.severity || 'medium') as 'low' | 'medium' | 'high',
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
    private extractInsightsFromText(
        text: string,
        projectData: ProjectData,
        options: AnalysisOptions
    ): ProjectInsights {
        console.warn('[OllamaAnalysisService] ⚠️ Using fallback text extraction');

        // Try to extract sections
        const summaryMatch = text.match(/executiveSummary["\s:]+"([^"]+)"/i) ||
                            text.match(/summary["\s:]+"([^"]+)"/i);
        
        const highlights: string[] = [];
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
    private normalizeMetrics(
        metrics: any,
        projectData: ProjectData,
        options: AnalysisOptions
    ): KeyMetrics {
        const formatCurrency = (num: number) => {
            return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        };

        const base: KeyMetrics = {
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
                : projectData.deliverables?.filter((d: any) => d.status !== 'completed').length || 0,
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
            } as any;
        }

        return base;
    }

    /**
     * Generate fallback summary if parsing fails
     */
    private generateFallbackSummary(projectData: ProjectData, options: AnalysisOptions): string {
        const budget = projectData.budget || {};
        const allocated = budget.allocated || 0;
        const spent = budget.spent || 0;
        const variance = allocated > 0 ? ((spent - allocated) / allocated * 100).toFixed(1) : '0';

        return `This ${options.reportType} report analyzes ${projectData.projectName}. ` +
               `Budget status: ${variance}% variance ($${allocated.toLocaleString()} allocated, $${spent.toLocaleString()} spent). ` +
               `Project includes ${projectData.sessions?.length || 0} sessions, ${projectData.team?.length || 0} team members, ` +
               `and ${projectData.deliverables?.length || 0} deliverables. ` +
               `Analysis focuses on ${options.reportType === 'financial' ? 'financial performance, cash flow, and cost optimization' : 'project health, timeline, and resource utilization'}.`;
    }

    /**
     * Extract highlights from parsed object
     */
    private extractHighlights(parsed: any): string[] {
        const highlights: string[] = [];
        
        if (Array.isArray(parsed.keyHighlights)) {
            return parsed.keyHighlights;
        }
        
        if (parsed.highlights && Array.isArray(parsed.highlights)) {
            return parsed.highlights;
        }
        
        if (typeof parsed.keyPoints === 'string') {
            return parsed.keyPoints.split('\n').filter((s: string) => s.trim().length > 10);
        }
        
        return highlights;
    }

    /**
     * Extract recommendations from parsed object
     */
    private extractRecommendations(parsed: any): string[] {
        if (Array.isArray(parsed.recommendations)) {
            return parsed.recommendations;
        }
        
        if (parsed.recommendations && typeof parsed.recommendations === 'string') {
            return parsed.recommendations.split('\n').filter((s: string) => s.trim().length > 10);
        }
        
        return [];
    }

    /**
     * Generate default highlights
     */
    private generateDefaultHighlights(projectData: ProjectData): string[] {
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
    private generateDefaultRisks(projectData: ProjectData): Risk[] {
        const risks: Risk[] = [];
        
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
        
        const blocked = projectData.deliverables?.filter((d: any) => d.status === 'blocked').length || 0;
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
    private generateDefaultRecommendations(projectData: ProjectData): string[] {
        return [
            'Monitor budget variance and adjust spending as needed',
            'Review blocked deliverables and resolve dependencies',
            'Optimize team resource allocation across departments',
            'Track workflow progress to identify bottlenecks',
            'Ensure regular status updates and communication'
        ];
    }
}
