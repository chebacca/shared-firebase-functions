# Gemma 3 12B Integration Guide

## Overview

Gemma 3 12B (8.1GB) has been integrated alongside phi4-mini (2.5GB) to provide enhanced analysis capabilities for reports and workflow analysis.

## Key Features

### Gemma 3 12B Advantages

- **8.1GB model** - More powerful reasoning and analysis
- **Multimodal** - Can analyze workflow diagram screenshots (future feature)
- **128K context window** - Can process entire project documentation for comprehensive reports
- **Better instruction following** - More accurate JSON generation and structured outputs

### Model Selection

The system automatically selects the best model based on task requirements:

| Task Type | Model Used | Reason |
|-----------|-----------|--------|
| Financial reports | gemma3:12b | Accuracy critical |
| Detailed reports | gemma3:12b | Comprehensive analysis needed |
| Executive summaries | phi4-mini | Speed priority |
| Workflow analysis (default) | phi4-mini | UI responsiveness |
| Workflow analysis (detailed) | gemma3:12b | User-selected option |
| Large context (>5K tokens) | gemma3:12b | Context capacity |
| Multimodal tasks | gemma3:12b | Required capability |

## Configuration

### Backend (Firebase Functions)

```bash
# Multi-model configuration (recommended)
OLLAMA_MODEL_FAST=phi4-mini          # Quick analysis
OLLAMA_MODEL_QUALITY=gemma3:12b      # Detailed reports
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_TIMEOUT=120000                # 2 minutes for gemma3
REPORT_USE_OLLAMA=true
```

### Client (Web App)

```bash
# Environment variables (optional, defaults provided)
VITE_OLLAMA_MODEL_FAST=phi4-mini
VITE_OLLAMA_MODEL_QUALITY=gemma3:12b
VITE_OLLAMA_BASE_URL=http://localhost:11434
```

## Usage

### Report Generation

Reports automatically select the best model:
- **Financial reports:** Uses gemma3:12b for accuracy
- **Detailed reports:** Uses gemma3:12b for comprehensive analysis
- **Executive reports:** Uses phi4-mini for speed

No user action required - model selection is automatic.

### Workflow Analysis

Users can toggle between fast and detailed analysis:

1. Open workflow analysis dialog
2. Toggle "Detailed Analysis" switch
3. Analysis will use gemma3:12b for more comprehensive insights

**Default:** phi4-mini (fast, 5-15 seconds)
**Detailed:** gemma3:12b (comprehensive, 20-40 seconds)

## Performance Expectations

| Task | phi4-mini | gemma3:12b | Improvement |
|------|-----------|------------|-------------|
| Workflow insights | 5-15s | 20-40s | Better quality |
| Simple report | 20-30s | 40-60s | More comprehensive |
| Financial report | 30-40s | 50-90s | Higher accuracy |
| Large context | Not ideal | 60-120s | Handles full docs |

## Installation

### Install Gemma 3 12B

```bash
# Pull the model
ollama pull gemma3:12b

# Verify installation
ollama list | grep gemma3
```

### Verify Both Models

```bash
ollama list
# Should show:
# - phi4-mini:latest (2.5GB)
# - gemma3:12b (8.1GB)
```

## Testing

### Test Model Selection

```bash
# Test phi4-mini
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "phi4-mini", "prompt": "Test", "stream": false}'

# Test gemma3:12b
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma3:12b", "prompt": "Test", "stream": false}'
```

### Test Report Generation

1. Generate a financial report in CNS Master Agent
2. Check logs for model selection:
   ```
   [OllamaAnalysisService] 🎯 Selected model: gemma3:12b for financial report
   ```

### Test Workflow Analysis

1. Open workflow analysis dialog
2. Toggle "Detailed Analysis" switch
3. Check logs for model usage:
   ```
   [WorkflowAnalyzer] 🚀 Enhancing analysis with AI insights using gemma3:12b (detailed)...
   ```

## Troubleshooting

### Model Not Found

If gemma3:12b is not available, the system falls back to phi4-mini:

```
[OllamaModelSelector] ⚠️ Quality model not available, using fast model
```

**Solution:** Install gemma3:12b with `ollama pull gemma3:12b`

### Timeout Issues

If gemma3:12b times out, increase timeout:

```bash
OLLAMA_TIMEOUT=180000  # 3 minutes
```

### Performance Issues

For faster responses, use phi4-mini for simple tasks:
- Executive summaries
- Quick workflow insights
- Small context analysis

Use gemma3:12b only when needed:
- Financial reports
- Detailed analysis
- Large context

## Future Enhancements

1. **Multimodal workflow analysis:** Upload workflow diagram screenshot, get visual design feedback
2. **Full project context:** Feed entire project documentation to gemma3:12b for comprehensive reports
3. **Hybrid mode:** Use phi4-mini for draft, gemma3:12b for refinement
4. **Model fallback chain:** gemma3:12b → phi4-mini → Gemini (cloud)

## Files Modified

1. `shared-firebase-functions/src/ai/services/OllamaModelSelector.ts` - Model selection logic
2. `shared-firebase-functions/src/ai/services/OllamaAnalysisService.ts` - Multi-model support
3. `_backbone_production_workflow_system/apps/web/src/services/ollamaService.ts` - Client multi-model
4. `_backbone_production_workflow_system/apps/web/src/services/workflowAnalyzerService.ts` - Detailed analysis option
5. `_backbone_production_workflow_system/apps/web/src/features/sessions/components/workflow/WorkflowAnalysisDialog.tsx` - UI toggle

## Benefits

✅ **Better Quality:** Gemma 3 12B provides superior analysis for complex reports
✅ **Flexibility:** Choose between speed (phi4-mini) and quality (gemma3:12b)
✅ **Large Context:** Process entire project documentation with 128K context
✅ **Future-Ready:** Multimodal support for visual analysis
✅ **Automatic Selection:** System chooses best model automatically
✅ **User Control:** Toggle detailed analysis in workflow editor
