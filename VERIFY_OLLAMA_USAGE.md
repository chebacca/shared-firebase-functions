# Verifying Ollama Usage in Report Generation

## Quick Check

When generating a report in CNS Master Agent, check the Firebase Functions logs for these indicators:

## ✅ Ollama is Being Used (Look for these logs):

```
[DocumentAnalysisService] 🔧 Initializing DocumentAnalysisService...
[DocumentAnalysisService] ✅ Ollama service initialized successfully
[DocumentAnalysisService] 🎯 Ollama will be used for report analysis (preferred over Gemini)
[DocumentAnalysisService] 🤖 Attempting to use Ollama for analysis...
[DocumentAnalysisService] ✅ Ollama is available - using Ollama for analysis
[OllamaAnalysisService] ✅ Selected model: gemma3:12b (or phi4-mini)
[OllamaAnalysisService] 🤖 Model: gemma3:12b
[OllamaAnalysisService] 💰 Cost: $0 (local processing, private)
[DocumentAnalysisService] 🎉 Report analysis completed using OLLAMA (local, private, $0 cost)
```

## ❌ Gemini is Being Used (Look for these logs):

```
[DocumentAnalysisService] 🔵 Using Gemini for analysis (cloud service)
[DocumentAnalysisService] ⚠️ NOTE: Data will be sent to Google cloud for processing
[DocumentAnalysisService] 🔵 Report analysis completed using GEMINI (cloud, ~$0.01-0.05 cost)
```

## Environment Variables Required

To ensure Ollama is used, set these in your Firebase Functions environment:

```bash
REPORT_USE_OLLAMA=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_FAST=phi4-mini
OLLAMA_MODEL_QUALITY=gemma3:12b
```

## Model Selection Logic

The system automatically selects the best model:

- **Financial reports** → `gemma3:12b` (quality, accuracy critical)
- **Detailed reports** → `gemma3:12b` (comprehensive analysis)
- **Executive reports** → `phi4-mini` (speed priority)
- **Large context (>5K tokens)** → `gemma3:12b` (128K context window)

## Troubleshooting

### If Gemini is being used instead of Ollama:

1. **Check environment variables:**
   ```bash
   firebase functions:config:get
   # Should show REPORT_USE_OLLAMA=true
   ```

2. **Check Ollama is running:**
   ```bash
   curl http://localhost:11434/api/tags
   # Should return list of models
   ```

3. **Check logs for errors:**
   ```
   [DocumentAnalysisService] ⚠️ Ollama initialization failed
   [OllamaAnalysisService] ❌ Ollama is not available
   ```

4. **Verify models are installed:**
   ```bash
   ollama list
   # Should show phi4-mini and/or gemma3:12b
   ```

## Expected Log Flow (Ollama Success)

```
1. [DocumentAnalysisService] 🔧 Initializing...
2. [DocumentAnalysisService] ✅ Ollama service initialized
3. [ReportGeneratorService] 📊 Starting report generation...
4. [DocumentAnalysisService] 🤖 Attempting to use Ollama...
5. [OllamaAnalysisService] 🔍 Checking Ollama availability...
6. [OllamaAnalysisService] ✅ Ollama is available
7. [OllamaAnalysisService] 🎯 Selecting best model...
8. [OllamaAnalysisService] ✅ Selected model: gemma3:12b
9. [OllamaAnalysisService] 🤖 Model: gemma3:12b
10. [OllamaAnalysisService] ✅ Analysis generated successfully
11. [DocumentAnalysisService] 🎉 Report analysis completed using OLLAMA
```

## Key Indicators

- ✅ **"using Ollama for analysis"** = Ollama is being used
- ✅ **"Model: gemma3:12b"** or **"Model: phi4-mini"** = Specific model selected
- ✅ **"Cost: $0"** = Local processing (Ollama)
- ❌ **"Using Gemini"** = Cloud service (Gemini)
- ❌ **"~$0.01-0.05 cost"** = Cloud service (Gemini)
