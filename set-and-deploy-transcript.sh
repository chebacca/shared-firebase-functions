#!/bin/bash

# Deploy Transcript Extraction Function with API Key
# Usage: ./set-and-deploy-transcript.sh YOUR_YOUTUBE_API_KEY

set -e

cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "❌ Error: YouTube API key required"
  echo ""
  echo "Usage:"
  echo "  ./set-and-deploy-transcript.sh YOUR_YOUTUBE_API_KEY"
  echo ""
  echo "Example:"
  echo "  ./set-and-deploy-transcript.sh AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q"
  exit 1
fi

YOUTUBE_KEY="$1"

echo "🎬 Deploying Transcript Extraction Function"
echo "============================================"
echo ""

# Check if secret already exists
if firebase functions:secrets:access YOUTUBE_API_KEY --project backbone-logic >/dev/null 2>&1; then
  echo "✅ YouTube API key secret already exists"
  read -p "Do you want to update it? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Keeping existing secret..."
  else
    echo "Updating YouTube API key secret..."
    echo "$YOUTUBE_KEY" | firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic --data-file -
    echo "✅ Secret updated"
  fi
else
  echo "Setting YouTube API key secret..."
  echo "$YOUTUBE_KEY" | firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic --data-file -
  echo "✅ Secret set successfully"
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

