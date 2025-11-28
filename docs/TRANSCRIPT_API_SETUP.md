# Video Transcript API Setup Guide

This guide explains how to set up API keys for video transcript extraction functionality.

## Overview

The transcript extraction feature supports:
- **YouTube**: Using YouTube Data API v3
- **Vimeo**: Using Vimeo API (optional)

## YouTube Data API v3 Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### Step 2: Enable YouTube Data API v3

1. Navigate to **APIs & Services** > **Library**
2. Search for "YouTube Data API v3"
3. Click **Enable**

### Step 3: Create API Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **API Key**
3. Copy the generated API key
4. (Recommended) Click **Restrict Key** and:
   - Under **API restrictions**, select "Restrict key"
   - Choose "YouTube Data API v3"
   - Under **Application restrictions**, configure IP restrictions if needed

### Step 4: Set API Key in Firebase Functions

#### Option A: Using Firebase Secrets (Recommended for Production)

```bash
# Set the secret
firebase functions:secrets:set YOUTUBE_API_KEY

# When prompted, paste your API key
```

Then in your function code, access it via:
```typescript
const apiKey = process.env.YOUTUBE_API_KEY;
```

#### Option B: Using Environment Variables (Development Only)

```bash
# In your .env file (DO NOT COMMIT)
YOUTUBE_API_KEY=your_api_key_here
```

#### Option C: Using Firebase Functions Config (Legacy)

```bash
firebase functions:config:set youtube.api_key="YOUR_API_KEY_HERE"
```

Then access it in code:
```typescript
const apiKey = functions.config().youtube.api_key;
```

### Step 5: Deploy Functions

After setting the API key, redeploy the functions:

```bash
cd shared-firebase-functions
npm run build
firebase deploy --only functions:extractTranscript
```

## Vimeo API Setup (Optional)

If you want to support Vimeo transcripts:

### Step 1: Create Vimeo App

1. Go to [Vimeo Developer Portal](https://developer.vimeo.com/)
2. Log in with your Vimeo account
3. Click **Create New App**
4. Fill in app details:
   - **App Name**: Your app name
   - **App URL**: Your app URL
   - **App Description**: Description of your app
5. Create the app

### Step 2: Generate Access Token

1. In your app settings, go to **Authentication**
2. Under **OAuth 2.0**, click **Generate Access Token**
3. Select scopes:
   - `video` - Read video information
   - `private` - Access private videos (if needed)
4. Copy the generated access token

### Step 3: Set Access Token in Firebase Functions

```bash
# Using Firebase Secrets (Recommended)
firebase functions:secrets:set VIMEO_ACCESS_TOKEN

# Or using config (Legacy)
firebase functions:config:set vimeo.access_token="YOUR_ACCESS_TOKEN_HERE"
```

### Step 4: Deploy Functions

```bash
firebase deploy --only functions:extractTranscript
```

## API Quotas and Limits

### YouTube Data API v3

- **Default Quota**: 10,000 units per day
- **Transcript Request**: ~50 units per request
- **Estimated Requests**: ~200 transcript requests per day

**Quota Breakdown:**
- `captions.list`: 1 unit
- `captions.download`: 1 unit

**To increase quota:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Quotas**
3. Search for "YouTube Data API v3"
4. Request quota increase if needed

### Vimeo API

- **Rate Limit**: 10,000 requests per hour
- **Transcript Request**: ~2 requests per video (list tracks + download)

## Testing the Setup

### Test YouTube Transcript Extraction

1. Open your Clip Show Pro application
2. Navigate to a story with a YouTube video link
3. Open the Script Editor
4. Click the transcript button (📝) next to a YouTube video link
5. The transcript should load and display in a popover window

### Verify API Key is Working

Check Firebase Functions logs:
```bash
firebase functions:log --only extractTranscript
```

Look for:
- ✅ Success: Transcript extracted successfully
- ❌ Error: `YouTube API key not configured` - API key not set
- ❌ Error: `API key not valid` - Invalid API key
- ❌ Error: `Quota exceeded` - Daily quota limit reached

## Troubleshooting

### Issue: "YouTube API key not configured"

**Solution:**
1. Verify the secret/config is set: `firebase functions:config:get`
2. Redeploy the function after setting the key
3. Check environment variable name matches exactly: `YOUTUBE_API_KEY`

### Issue: "API key not valid"

**Solution:**
1. Verify the API key is correct
2. Check if YouTube Data API v3 is enabled in Google Cloud Console
3. Verify API key restrictions allow the function to access the API

### Issue: "Quota exceeded"

**Solution:**
1. Check current quota usage in Google Cloud Console
2. Request quota increase if needed
3. Implement caching to reduce API calls (already implemented in service)

### Issue: "No captions available for this video"

**Solution:**
- Not all YouTube videos have captions
- Videos must have captions enabled by the uploader
- Try videos with auto-generated captions (more common)

## Security Best Practices

1. **Never commit API keys to version control**
   - Use `.gitignore` to exclude `.env` files
   - Use Firebase Secrets for production

2. **Restrict API keys**
   - Use IP restrictions when possible
   - Limit to specific APIs (YouTube Data API v3 only)

3. **Rotate keys regularly**
   - Change API keys periodically
   - Monitor for unusual usage

4. **Monitor usage**
   - Set up alerts for quota usage
   - Track API call patterns

## Cost Considerations

### YouTube Data API v3
- **Free Tier**: 10,000 units/day (sufficient for ~200 transcript requests)
- **Paid**: Contact Google Cloud sales for higher quotas

### Vimeo API
- **Free**: No cost for API access
- Rate limits apply (10,000 requests/hour)

## Additional Resources

- [YouTube Data API v3 Documentation](https://developers.google.com/youtube/v3/docs)
- [YouTube Captions API](https://developers.google.com/youtube/v3/docs/captions)
- [Vimeo API Documentation](https://developer.vimeo.com/api)
- [Firebase Functions Secrets](https://firebase.google.com/docs/functions/config-env)

## Support

For issues or questions:
1. Check Firebase Functions logs
2. Verify API key configuration
3. Test with a known video that has captions
4. Contact development team if issues persist


