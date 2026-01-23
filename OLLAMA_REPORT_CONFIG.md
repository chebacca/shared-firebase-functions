# Ollama Report Generation Configuration

## Overview

Report generation now supports both Ollama (local) and Gemini (cloud) for AI analysis. Ollama is preferred when available for privacy and cost benefits.

## Configuration

### Environment Variables

**Enable Ollama for Reports:**
```bash
# In Firebase Functions .env or config
REPORT_USE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434

# Multi-model support (recommended)
OLLAMA_MODEL_FAST=phi4-mini          # Quick analysis (2.5GB)
OLLAMA_MODEL_QUALITY=gemma3:12b      # Detailed reports (8.1GB, 128K context, multimodal)
OLLAMA_TIMEOUT=120000                # 2 minutes for gemma3

# Legacy single model (backward compatible)
OLLAMA_MODEL=phi4-mini               # Default model if multi-model not configured
```

**Gemini Fallback:**
```bash
GEMINI_API_KEY=your_key_here  # Required for fallback
GEMINI_REPORT_MODEL=gemini-2.0-flash  # Optional, defaults to gemini-2.0-flash
```

### Firebase Functions Config

```bash
# Set via Firebase CLI
firebase functions:config:set report.use_ollama="true"
firebase functions:config:set ollama.base_url="http://localhost:11434"
firebase functions:config:set ollama.model="phi4-mini"
```

## Behavior

### Priority Order:
1. **Ollama** (if `REPORT_USE_OLLAMA=true` and Ollama available)
2. **Gemini** (fallback if Ollama unavailable or not configured)

### Auto-Detection:
- Checks Ollama availability on first use
- Falls back to Gemini if Ollama not running
- Logs which service is being used

## Performance

### Ollama (phi4-mini):
- **Latency:** 20-40 seconds
- **Cost:** $0 (local)
- **Quality:** Very good for structured analysis
- **Privacy:** All data stays local

### Gemini (fallback):
- **Latency:** 5-10 seconds
- **Cost:** ~$0.01-0.05 per report
- **Quality:** Excellent
- **Privacy:** Data sent to Google cloud

## Usage

Reports will automatically use Ollama if:
1. `REPORT_USE_OLLAMA=true` is set
2. Ollama is running and accessible
3. At least one model (phi4-mini or gemma3:12b) is installed

**Model Selection:**
- **Financial/Detailed reports:** Automatically uses gemma3:12b if available
- **Executive reports:** Uses phi4-mini for speed
- **Large context (>5K tokens):** Uses gemma3:12b
- **Small context (<2K tokens):** Uses phi4-mini

Otherwise, falls back to Gemini (requires `GEMINI_API_KEY`).

## Testing

Check which service is being used:
```bash
# Check logs during report generation
# Look for: "[DocumentAnalysisService] 🤖 Using Ollama..." or "[DocumentAnalysisService] 🔵 Using Gemini..."
```

## Benefits

✅ **Privacy:** Financial/project data stays local
✅ **Cost:** $0 vs $0.01-0.05 per report
✅ **Reliability:** No API rate limits
✅ **Offline:** Works without internet
✅ **Consistency:** Same model = consistent quality
