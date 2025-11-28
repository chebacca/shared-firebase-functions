#!/bin/bash

# Setup Video Transcript API Keys for Firebase Functions
# This script helps set up YouTube and Vimeo API keys as Firebase Secrets

set -e

echo "🎬 Video Transcript API Setup"
echo "=============================="
echo ""

# Check if YouTube API key is already set
if firebase functions:secrets:access YOUTUBE_API_KEY --project backbone-logic >/dev/null 2>&1; then
  echo "✅ YouTube API key is already set"
else
  echo "⚠️  YouTube API key is not set"
  echo ""
  echo "To set the YouTube API key:"
  echo "  1. Get your YouTube Data API v3 key from Google Cloud Console"
  echo "  2. Run: firebase functions:secrets:set YOUTUBE_API_KEY"
  echo "  3. Paste your API key when prompted"
  echo ""
  read -p "Do you want to set the YouTube API key now? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic
  fi
fi

echo ""

# Check if Vimeo access token is set (optional)
if firebase functions:secrets:access VIMEO_ACCESS_TOKEN --project backbone-logic >/dev/null 2>&1; then
  echo "✅ Vimeo access token is already set"
else
  echo "ℹ️  Vimeo access token is not set (optional)"
  echo ""
  read -p "Do you want to set the Vimeo access token? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    firebase functions:secrets:set VIMEO_ACCESS_TOKEN --project backbone-logic
  fi
fi

echo ""
echo "📋 Next step: Deploy the extractTranscript function"
echo "   Run: firebase deploy --only functions:extractTranscript --project backbone-logic"
echo ""


