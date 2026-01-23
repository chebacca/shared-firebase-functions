/**
 * Ollama Model Selector
 * 
 * Intelligently selects between available Ollama models based on task requirements.
 * Supports phi4-mini (fast) and gemma3:12b (quality) models.
 */

export interface ModelCapabilities {
  name: string;
  size: number; // GB
  multimodal: boolean;
  contextWindow: number; // tokens
  speedRating: 'fast' | 'medium' | 'slow';
  qualityRating: 'good' | 'excellent' | 'superior';
}

export interface TaskRequirements {
  type: 'workflow_analysis' | 'report_generation' | 'multimodal_analysis';
  contextSize: 'small' | 'medium' | 'large'; // <1K, 1K-10K, >10K tokens
  priority: 'speed' | 'quality' | 'balanced';
  requiresMultimodal?: boolean;
  reportType?: 'executive' | 'detailed' | 'financial' | 'production';
}

export class OllamaModelSelector {
  private static readonly MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
    'phi4-mini': {
      name: 'phi4-mini',
      size: 2.5,
      multimodal: false,
      contextWindow: 8192,
      speedRating: 'fast',
      qualityRating: 'good'
    },
    'gemma3:12b': {
      name: 'gemma3:12b',
      size: 8.1,
      multimodal: true,
      contextWindow: 131072, // 128K
      speedRating: 'slow',
      qualityRating: 'superior'
    }
  };

  /**
   * Select the best model for a given task
   */
  static selectModel(requirements: TaskRequirements, availableModels: string[]): string {
    const fastModel = process.env.OLLAMA_MODEL_FAST || 'phi4-mini';
    const qualityModel = process.env.OLLAMA_MODEL_QUALITY || 'gemma3:12b';

    // Check if models are available
    const fastAvailable = availableModels.some(m => 
      m.includes(fastModel.split(':')[0]) || m === fastModel
    );
    const qualityAvailable = availableModels.some(m => 
      m.includes(qualityModel.split(':')[0]) || m === qualityModel
    );

    // Multimodal tasks require gemma3:12b
    if (requirements.requiresMultimodal && qualityAvailable) {
      console.log('[OllamaModelSelector] 🎨 Selecting gemma3:12b for multimodal task');
      return qualityModel;
    }

    // Large context requires gemma3:12b
    if (requirements.contextSize === 'large' && qualityAvailable) {
      console.log('[OllamaModelSelector] 📚 Selecting gemma3:12b for large context');
      return qualityModel;
    }

    // Financial and detailed reports prefer gemma3:12b for accuracy
    if (requirements.type === 'report_generation') {
      if ((requirements.reportType === 'financial' || requirements.reportType === 'detailed') && qualityAvailable) {
        console.log('[OllamaModelSelector] 💰 Selecting gemma3:12b for detailed/financial report');
        return qualityModel;
      }
      
      // Executive reports can use fast model if speed is priority
      if (requirements.reportType === 'executive' && requirements.priority === 'speed' && fastAvailable) {
        console.log('[OllamaModelSelector] ⚡ Selecting phi4-mini for quick executive report');
        return fastModel;
      }
    }

    // Workflow analysis: prefer fast model for speed, but allow quality if requested
    if (requirements.type === 'workflow_analysis') {
      if (requirements.priority === 'quality' && qualityAvailable) {
        console.log('[OllamaModelSelector] 🎯 Selecting gemma3:12b for detailed workflow analysis');
        return qualityModel;
      }
      
      if (fastAvailable) {
        console.log('[OllamaModelSelector] ⚡ Selecting phi4-mini for quick workflow analysis');
        return fastModel;
      }
    }

    // Priority-based selection
    if (requirements.priority === 'speed' && fastAvailable) {
      console.log('[OllamaModelSelector] ⚡ Selecting phi4-mini for speed priority');
      return fastModel;
    }

    if (requirements.priority === 'quality' && qualityAvailable) {
      console.log('[OllamaModelSelector] 🎯 Selecting gemma3:12b for quality priority');
      return qualityModel;
    }

    // Default: use quality if available, otherwise fast
    if (qualityAvailable) {
      console.log('[OllamaModelSelector] 🎯 Defaulting to gemma3:12b');
      return qualityModel;
    }

    if (fastAvailable) {
      console.log('[OllamaModelSelector] ⚡ Defaulting to phi4-mini');
      return fastModel;
    }

    // Fallback: return configured default
    console.warn('[OllamaModelSelector] ⚠️ No models available, using configured default');
    return fastModel;
  }

  /**
   * Get model capabilities
   */
  static getModelCapabilities(modelName: string): ModelCapabilities | null {
    const baseName = modelName.split(':')[0];
    return this.MODEL_CAPABILITIES[baseName] || this.MODEL_CAPABILITIES[modelName] || null;
  }

  /**
   * Estimate generation time based on model and task
   */
  static estimateGenerationTime(modelName: string, contextSize: 'small' | 'medium' | 'large'): number {
    const capabilities = this.getModelCapabilities(modelName);
    if (!capabilities) return 30000; // Default 30s

    const baseTime = capabilities.speedRating === 'fast' ? 5000 : 
                     capabilities.speedRating === 'medium' ? 20000 : 40000;

    const contextMultiplier = contextSize === 'small' ? 1 : 
                              contextSize === 'medium' ? 1.5 : 2.5;

    return Math.round(baseTime * contextMultiplier);
  }
}
