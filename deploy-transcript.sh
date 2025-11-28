#!/bin/bash

# Deploy Transcript Extraction Function
# This script sets up the YouTube API key secret and deploys the function

set -e

cd "$(dirname "$0")"

echo "🎬 Deploying Transcript Extraction Function"
echo "============================================"
echo ""

# Check if YouTube API key secret is set
if firebase functions:secrets:access YOUTUBE_API_KEY --project backbone-logic >/dev/null 2>&1; then
  echo "✅ YouTube API key secret is already set"
else
  echo "⚠️  YouTube API key secret is not set"
  echo ""
  echo "Please provide your YouTube Data API v3 key."
  echo "You can get it from: https://console.cloud.google.com/apis/credentials"
  echo ""
  read -sp "Enter YouTube API Key: " YOUTUBE_KEY
  echo ""
  
  if [ -z "$YOUTUBE_KEY" ]; then
    echo "❌ No API key provided. Exiting."
    exit 1
  fi
  
  echo ""
  echo "Setting YouTube API key secret..."
  echo "$YOUTUBE_KEY" | firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic
  echo "✅ YouTube API key secret set"
fi

echo ""
echo "📦 Building TypeScript..."
npm run build

echo ""
echo "🚀 Deploying functions..."
firebase deploy --only functions --project backbone-logic

echo ""
echo "✅ Deployment complete!"
echo ""
echo "The extractTranscript function is now deployed and ready to use."
echo "You can test it by clicking the transcript button (📝) next to YouTube video links in the script editor."


