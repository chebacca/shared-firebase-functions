# ML Services Setup Guide

This directory contains Firebase ML integration services for the Backbone CNS application.

## Services

1. **VectorSearchService** - Semantic search using Vertex AI embeddings
2. **DocumentAIService** - Document parsing and extraction
3. **PredictiveAnalyticsService** - Budget and resource predictions

## Setup Instructions

### 1. Install Dependencies

Add the following to `package.json`:

```json
{
  "dependencies": {
    "@google-cloud/documentai": "^6.0.0",
    "@google-cloud/vision": "^4.0.0",
    "@google-cloud/video-intelligence": "^5.0.0",
    "node-fetch": "^3.3.2"
  }
}
```

Then run:
```bash
pnpm install
```

### 2. Enable APIs

Enable the following Google Cloud APIs in your Firebase project:

```bash
# Enable Vertex AI API
gcloud services enable aiplatform.googleapis.com

# Enable Document AI API
gcloud services enable documentai.googleapis.com

# Enable Vision API (optional, for media analysis)
gcloud services enable vision.googleapis.com

# Enable Video Intelligence API (optional, for video analysis)
gcloud services enable videointelligence.googleapis.com
```

### 3. Set Up Secrets

Set the Gemini API key secret (if not already set):

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### 4. Configure Document AI

1. Go to [Google Cloud Console](https://console.cloud.google.com/ai/document-ai)
2. Create a Document AI processor (or use existing)
3. Note the processor ID
4. Set environment variable:

```bash
firebase functions:config:set documentai.processor_id="YOUR_PROCESSOR_ID"
firebase functions:config:set documentai.location="us"
```

Or set in `.env` file:
```
DOCUMENT_AI_PROCESSOR_ID=your-processor-id
DOCUMENT_AI_LOCATION=us
```

### 5. Deploy Functions

Deploy the ML functions:

```bash
cd shared-firebase-functions
pnpm build
firebase deploy --only functions:semanticSearch,functions:searchAll,functions:findSimilar,functions:indexEntity,functions:parseNetworkBible,functions:extractBudgetData,functions:parseScript,functions:predictBudgetHealth,functions:forecastSpending,functions:predictAvailability
```

Or deploy all functions:
```bash
firebase deploy --only functions
```

## Usage Examples

### Semantic Search

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const semanticSearch = httpsCallable(functions, 'semanticSearch');

const result = await semanticSearch({
  query: 'action-packed projects that need attention',
  collection: 'projects',
  organizationId: 'your-org-id',
  limit: 10
});

console.log(result.data);
```

### Predict Budget Health

```typescript
const predictBudgetHealth = httpsCallable(functions, 'predictBudgetHealth');

const result = await predictBudgetHealth({
  projectId: 'project-123'
});

console.log(result.data);
```

### Parse Network Bible

```typescript
const parseNetworkBible = httpsCallable(functions, 'parseNetworkBible');

const result = await parseNetworkBible({
  pdfUrl: 'https://storage.googleapis.com/.../bible.pdf'
});

console.log(result.data);
```

## Testing

Test the services locally:

```bash
# Start Firebase emulator
firebase emulators:start --only functions

# Test semantic search
curl -X POST http://localhost:5001/backbone-logic/us-central1/semanticSearch \
  -H "Content-Type: application/json" \
  -d '{"data": {"query": "test", "organizationId": "test-org"}}'
```

## Next Steps

1. Set up Vector Search Firebase Extension
2. Create embedding generation pipeline
3. Index existing data
4. Integrate with UniversalSearchService
5. Add UI components for ML features

See `FIREBASE_ML_INTEGRATION_PLAN.md` for full implementation roadmap.

