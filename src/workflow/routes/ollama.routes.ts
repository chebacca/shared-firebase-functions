/**
 * Ollama API Routes
 * 
 * Provides a scalable, multi-user proxy to Ollama for workflow analysis.
 * Handles request queuing, rate limiting, caching, and concurrent access.
 */

import { Router, Request, Response } from 'express';
import { enhancedAuthMiddleware } from '../middleware/tierAuth';
import * as admin from 'firebase-admin';

// Environment configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi4-mini';
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.OLLAMA_MAX_CONCURRENT || '3', 10);

const router: Router = Router();

// Request queue for managing concurrent Ollama requests
interface QueuedRequest {
  id: string;
  prompt: string;
  model: string;
  options: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

class OllamaRequestQueue {
  private queue: QueuedRequest[] = [];
  private processing: Set<string> = new Set();
  private maxConcurrent: number;
  private ollamaBaseUrl: string;
  private requestCache: Map<string, { response: string; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(ollamaBaseUrl: string, maxConcurrent: number = 3) {
    this.ollamaBaseUrl = ollamaBaseUrl;
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Generate a cache key from request parameters
   */
  private getCacheKey(prompt: string, model: string, options: any): string {
    const key = `${model}:${JSON.stringify(options)}:${prompt.substring(0, 200)}`;
    return Buffer.from(key).toString('base64').substring(0, 100);
  }

  /**
   * Check cache for similar requests
   */
  private getCached(prompt: string, model: string, options: any): string | null {
    const cacheKey = this.getCacheKey(prompt, model, options);
    const cached = this.requestCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      console.log('[OllamaQueue] ✅ Cache hit for request');
      return cached.response;
    }
    
    return null;
  }

  /**
   * Store response in cache
   */
  private setCache(prompt: string, model: string, options: any, response: string): void {
    const cacheKey = this.getCacheKey(prompt, model, options);
    this.requestCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });
    
    // Clean old cache entries (keep last 100)
    if (this.requestCache.size > 100) {
      const entries = Array.from(this.requestCache.entries())
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, 100);
      this.requestCache.clear();
      entries.forEach(([key, value]) => this.requestCache.set(key, value));
    }
  }

  /**
   * Process next request in queue
   */
  private async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.processing.add(request.id);
    console.log(`[OllamaQueue] 🚀 Processing request ${request.id} (${this.processing.size}/${this.maxConcurrent} active)`);

    try {
      // Check cache first
      const cached = this.getCached(request.prompt, request.model, request.options);
      if (cached) {
        request.resolve(cached);
        this.processing.delete(request.id);
        this.processNext(); // Process next in queue
        return;
      }

      // Make request to Ollama
      const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          stream: false,
          options: request.options
        }),
        signal: AbortSignal.timeout(60000) // 60 second timeout
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json();
      const generatedText = data.response || '';

      // Cache the response
      this.setCache(request.prompt, request.model, request.options, generatedText);

      request.resolve(generatedText);
    } catch (error) {
      console.error(`[OllamaQueue] ❌ Error processing request ${request.id}:`, error);
      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing.delete(request.id);
      this.processNext(); // Process next in queue
    }
  }

  /**
   * Add request to queue
   */
  async enqueue(prompt: string, model: string, options: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const request: QueuedRequest = {
        id: requestId,
        prompt,
        model,
        options,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(request);
      console.log(`[OllamaQueue] 📥 Enqueued request ${requestId} (queue length: ${this.queue.length})`);
      
      // Start processing if not at max capacity
      this.processNext();
    });
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing.size,
      maxConcurrent: this.maxConcurrent,
      cacheSize: this.requestCache.size
    };
  }
}

// Initialize queue (one per Ollama server)
const ollamaQueue = new OllamaRequestQueue(
  OLLAMA_BASE_URL,
  MAX_CONCURRENT_REQUESTS
);

// Handle OPTIONS preflight requests
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    return res.status(204).send();
  }
  next();
});

// Apply authentication
router.use(enhancedAuthMiddleware);

/**
 * GET /ollama/status
 * Get Ollama service status and queue information
 */
router.get('/status', async (req: Request, res: Response) => {
    try {
      // Check if Ollama is available
      const ollamaUrl = OLLAMA_BASE_URL;
    let ollamaAvailable = false;
    let models: any[] = [];

    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        ollamaAvailable = true;
        models = data.models || [];
      }
    } catch (error) {
      console.warn('[OllamaRoutes] Ollama not available:', error);
    }

    const queueStatus = ollamaQueue.getStatus();

    res.json({
      success: true,
      data: {
        ollamaAvailable,
        ollamaUrl,
        models: models.map((m: any) => ({
          name: m.name,
          size: m.size
        })),
        queue: queueStatus
      }
    });
  } catch (error) {
    console.error('[OllamaRoutes] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get Ollama status'
    });
  }
});

/**
 * POST /ollama/generate
 * Generate text using Ollama (queued, cached, rate-limited)
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, model, options } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required and must be a string'
      });
    }

    const modelToUse = model || OLLAMA_MODEL;
    const generationOptions = {
      temperature: options?.temperature ?? 0.6,
      top_p: options?.top_p ?? 0.9,
      top_k: options?.top_k ?? 20,
      num_predict: options?.maxTokens ?? 200,
      repeat_penalty: 1.1,
      stop: ['\n\n', '---', '###'],
      ...options
    };

    console.log('[OllamaRoutes] 📥 Received generation request:', {
      promptLength: prompt.length,
      model: modelToUse,
      queueLength: ollamaQueue.getStatus().queueLength
    });

    // Enqueue request (handles caching, queuing, rate limiting)
    const startTime = Date.now();
    const response = await ollamaQueue.enqueue(prompt, modelToUse, generationOptions);
    const duration = Date.now() - startTime;

    console.log(`[OllamaRoutes] ✅ Generation complete in ${duration}ms`);

    res.json({
      success: true,
      data: {
        response,
        duration,
        cached: duration < 100 // Very fast = likely cached
      }
    });
  } catch (error) {
    console.error('[OllamaRoutes] Error generating text:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate text'
    });
  }
});

/**
 * POST /ollama/workflow-insights
 * Generate workflow analysis insights (optimized endpoint)
 */
router.post('/workflow-insights', async (req: Request, res: Response) => {
  try {
    const { analysis } = req.body;

    if (!analysis) {
      return res.status(400).json({
        success: false,
        error: 'Analysis data is required'
      });
    }

    // Build optimized prompt
    const { structure, validation, gaps, insights } = analysis;
    const issues: string[] = [];
    if (validation.hasCircularDependencies) issues.push('circular dependencies');
    if (validation.orphanedNodes?.length > 0) issues.push(`${validation.orphanedNodes.length} orphaned nodes`);
    if (gaps.missingCriticalSteps?.length > 0) issues.push(`${gaps.missingCriticalSteps.length} missing steps`);
    if (gaps.phaseGaps?.length > 0) issues.push(`${gaps.phaseGaps.length} phase gaps`);
    const issuesText = issues.length > 0 ? issues.join(', ') : 'no critical issues';

    const prompt = `Analyze this video production workflow in 2-3 sentences:

Stats: ${structure.totalNodes} nodes, ${structure.totalEdges} connections, ${structure.phases?.length || 0} phases
Issues: ${issuesText}
Timeline: ${Math.round(insights.estimatedDuration.criticalPath)}h critical path (${Math.round(insights.estimatedDuration.parallel)}h parallel)

Focus on: strengths, critical gaps, and one key improvement. Be concise and actionable.`;

    const model = OLLAMA_MODEL;
    const startTime = Date.now();
    const response = await ollamaQueue.enqueue(prompt, model, {
      temperature: 0.5,
      num_predict: 150
    });
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        summary: response,
        duration,
        cached: duration < 100
      }
    });
  } catch (error) {
    console.error('[OllamaRoutes] Error generating insights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate insights'
    });
  }
});

/**
 * POST /ollama/workflow-recommendations
 * Generate workflow recommendations (optimized endpoint)
 */
router.post('/workflow-recommendations', async (req: Request, res: Response) => {
  try {
    const { gaps, context } = req.body;

    if (!gaps || !Array.isArray(gaps)) {
      return res.status(400).json({
        success: false,
        error: 'Gaps array is required'
      });
    }

    // Build optimized prompt
    const missingSteps = gaps
      .filter((g: any) => g.stepType && g.stepType !== 'phase_gap')
      .map((g: any) => `${g.stepType} (${g.phase})`)
      .slice(0, 3)
      .join(', ');

    const phaseGaps = gaps
      .filter((g: any) => g.issue || g.stepType === 'phase_gap')
      .map((g: any) => g.phase || g.stepType)
      .slice(0, 2)
      .join(', ');

    const prompt = `Generate 3-5 workflow improvement recommendations. Format: one per line, start with "1. " or "- ".

Gaps: ${missingSteps || 'none'}. Phase issues: ${phaseGaps || 'none'}.
Context: ${context.nodes?.length || 0} nodes, ${context.phases?.length || 0} phases.

Focus on: missing steps, phase gaps, efficiency. Be specific and actionable.`;

    const model = OLLAMA_MODEL;
    const startTime = Date.now();
    const response = await ollamaQueue.enqueue(prompt, model, {
      temperature: 0.6,
      num_predict: 300
    });
    const duration = Date.now() - startTime;

    // Parse recommendations
    const recommendations = response
      .split(/\n+/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 15)
      .filter((l: string) => /^[\d+\-*•]/.test(l) || /^[A-Z]/.test(l))
      .map((l: string) => l.replace(/^[\d+\-*•]\s*/, '').trim())
      .filter((r: string) => r.length > 15 && r.length < 500)
      .slice(0, 5);

    res.json({
      success: true,
      data: {
        recommendations: recommendations.length > 0 ? recommendations : [response.trim()],
        duration,
        cached: duration < 100
      }
    });
  } catch (error) {
    console.error('[OllamaRoutes] Error generating recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recommendations'
    });
  }
});

export default router;
