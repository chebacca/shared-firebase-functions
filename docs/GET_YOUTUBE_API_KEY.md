# How to Get Your YouTube Data API v3 Key

## Quick Steps

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account

### Step 2: Select or Create a Project
1. At the top of the page, click the project dropdown
2. Either:
   - Select an existing project (recommended: use `backbone-logic` if it exists)
   - Or click "New Project" to create one
   - Note: Creating a project is free

### Step 3: Enable YouTube Data API v3
1. In the search bar at the top, type: `YouTube Data API v3`
2. Click on "YouTube Data API v3" from the results
3. Click the **"Enable"** button
4. Wait a few seconds for it to enable

### Step 4: Create API Credentials
1. After enabling, you'll see an "API Overview" page
2. Click **"Create Credentials"** button (or go to "Credentials" in the left sidebar)
3. Choose **"API Key"** from the dropdown
4. Your API key will be generated immediately!

### Step 5: Copy Your API Key
- The API key will look like: `AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q`
- Click **"Copy"** to copy it to your clipboard
- **Save it securely** - you'll need it for deployment

### Step 6: (Recommended) Restrict Your API Key
1. Click **"Restrict Key"** on the credentials page
2. Under **"API restrictions"**:
   - Select "Restrict key"
   - Check only "YouTube Data API v3"
3. Under **"Application restrictions"** (optional):
   - You can leave as "None" for now, or set IP restrictions if needed
4. Click **"Save"**

## Important Notes

- **Free Tier**: Google provides 10,000 units per day for free
- **Quota**: Each transcript extraction uses ~50 units
- **Estimate**: You can extract ~200 transcripts per day on the free tier
- **Cost**: No cost unless you exceed the free tier

## Troubleshooting

### "API not enabled" error
- Make sure you enabled "YouTube Data API v3" (not just YouTube API)
- It might take a minute or two to fully enable

### "API key not valid" error
- Make sure you copied the entire key (they're long!)
- Check for extra spaces before/after the key
- Verify the API is enabled in your project

### Can't find the API
- Make sure you're in the correct Google Cloud project
- Try this direct link: https://console.cloud.google.com/apis/library/youtube.googleapis.com

## Direct Links

- **Google Cloud Console**: https://console.cloud.google.com/
- **API Library**: https://console.cloud.google.com/apis/library
- **YouTube Data API v3**: https://console.cloud.google.com/apis/library/youtube.googleapis.com
- **Credentials Page**: https://console.cloud.google.com/apis/credentials

## After Getting Your Key

Once you have your API key, deploy the function:

```bash
cd shared-firebase-functions

# Set the secret (paste your key when prompted)
firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic

# Deploy
firebase deploy --only functions --project backbone-logic
```

Or use the deployment script:

```bash
cd shared-firebase-functions
./deploy-transcript.sh
```

