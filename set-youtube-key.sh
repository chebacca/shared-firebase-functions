#!/bin/bash

# Quick script to set YouTube API key secret
# Usage: ./set-youtube-key.sh YOUR_API_KEY_HERE

set -e

cd "$(dirname "$0")"

if [ -z "$1" ]; then
  echo "Usage: ./set-youtube-key.sh YOUR_YOUTUBE_API_KEY"
  echo ""
  echo "Or provide it interactively:"
  echo "  ./set-youtube-key.sh"
  echo "  # Then paste your key when prompted"
  exit 1
fi

API_KEY="$1"

echo "Setting YouTube API key secret..."
echo "$API_KEY" | firebase functions:secrets:set YOUTUBE_API_KEY --project backbone-logic

echo "✅ YouTube API key secret set successfully!"
echo ""
echo "Now you can deploy:"
echo "  firebase deploy --only functions --project backbone-logic"


