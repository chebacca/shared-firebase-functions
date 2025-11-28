# Deploy Transcript Extraction Function

## Prerequisites

Before deploying, you need to set the YouTube API key as a Firebase Secret.

## Step 1: Set YouTube API Key Secret

```bash
cd shared-firebase-functions

# Set the YouTube API key secret
firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic

# When prompted, paste your YouTube Data API v3 key
```

**Note**: If you don't have a YouTube API key yet:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable YouTube Data API v3
3. Create an API key
4. See [TRANSCRIPT_API_SETUP.md](./docs/TRANSCRIPT_API_SETUP.md) for detailed instructions

## Step 2: (Optional) Set Vimeo Access Token

If you want Vimeo transcript support:

```bash
firebase functions:secrets:set VIMEO_ACCESS_TOKEN --project backbone-logic
```

## Step 3: Deploy the Function

```bash
cd shared-firebase-functions

# Build TypeScript
npm run build

# Deploy just the transcript function
firebase deploy --only functions --project backbone-logic

# Or deploy all functions
firebase deploy --only functions --project backbone-logic
```

## Step 4: Verify Deployment

```bash
# List deployed functions
firebase functions:list --project backbone-logic | grep extractTranscript

# Check function logs
firebase functions:log --only extractTranscript --project backbone-logic
```

## Troubleshooting

### Error: "YouTube API key not configured"
- Make sure you set the secret: `firebase functions:secrets:set YOUTUBE_API_KEY`
- Verify the secret is set: `firebase functions:secrets:access YOUTUBE_API_KEY`

### Error: "Secret not found"
- The function needs the secret declared in its configuration (already done)
- Redeploy after setting the secret

### Function not appearing after deployment
- Check that the function is exported in `src/index.ts` (already done)
- Verify the build succeeded: `npm run build`
- Check Firebase Console for deployment status


