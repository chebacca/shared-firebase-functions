# Gemini API Setup for Video Transcription

## Overview

The `extractTranscript` function supports Gemini as a fallback for videos that don't have captions available. This allows automatic transcription of videos using Google's Gemini AI.

## Prerequisites

✅ **Encryption Key**: Already configured (`INTEGRATIONS_ENCRYPTION_KEY` secret is set)  
✅ **Function Deployed**: `extractTranscript` function is deployed with encryption key access

## Step 1: Get a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key (starts with `AIza...`)

## Step 2: Store the Gemini API Key

### Option A: Using the UI (Recommended)

1. In Clip Show Pro, go to **Settings** → **Integrations** → **AI API Keys** tab
2. Find the **Gemini** section
3. Paste your API key
4. Select model (default: `gemini-2.5-flash`)
5. Click **Save**

The key will be encrypted and stored securely in Firestore.

### Option B: Using Firebase Function Directly

If you prefer to use the Firebase Function directly:

```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const storeAIApiKey = httpsCallable(functions, 'storeAIApiKey');

await storeAIApiKey({
  organizationId: 'clip-show-pro-productions',
  service: 'gemini',
  apiKey: 'AIza...', // Your Gemini API key
  model: 'gemini-2.5-flash', // Optional, defaults to gemini-2.5-flash
  enabled: true
});
```

## Step 3: Verify Setup

1. Try extracting a transcript from a video without captions
2. The function will:
   - First try YouTube captions (if available)
   - If no captions, fall back to Gemini transcription
   - If Gemini is not configured, show manual entry dialog

## How It Works

1. **YouTube Videos with Captions**: Uses YouTube's public transcript API (no API key needed)
2. **YouTube Videos without Captions**: Falls back to Gemini (requires API key)
3. **Other Video Platforms**: Uses Gemini directly (requires API key)
4. **Manual Entry**: Always available as a fallback

## Storage Location

- **Organization-level keys**: `organizations/{orgId}/aiApiKeys/gemini`
- Keys are encrypted using AES-256-GCM before storage
- Only organization administrators can store/update keys

## Troubleshooting

### "Encryption key not configured"
- ✅ Already fixed - `INTEGRATIONS_ENCRYPTION_KEY` is set

### "Gemini API key not found"
- Make sure you've stored the API key using the UI or `storeAIApiKey` function
- Verify you're an organization administrator
- Check Firestore: `organizations/{orgId}/aiApiKeys/gemini`

### "Gemini transcription failed"
- Verify your API key is valid
- Check API quota/limits in Google AI Studio
- Ensure the model name is correct (e.g., `gemini-2.5-flash`)

## API Key Security

- ✅ Keys are encrypted before storage (AES-256-GCM)
- ✅ Encryption happens server-side only
- ✅ Keys never leave the server in plaintext
- ✅ Only admins can view/manage keys

## Cost Considerations

- Gemini API has free tier with limits
- Check [Google AI Studio pricing](https://ai.google.dev/pricing) for details
- Transcription costs depend on video length and model used
- `gemini-2.5-flash` is the default model for cost-effective transcription

## Next Steps

1. ✅ Get Gemini API key from Google AI Studio
2. ✅ Store it using the UI (Settings → Integrations → AI API Keys)
3. ✅ Test with a video that doesn't have captions
4. ✅ Verify transcription works automatically

The function is now ready to use Gemini for video transcription! 🎉

