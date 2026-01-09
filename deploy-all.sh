#!/bin/bash
# Deploy ALL functions (for full deployments)
# Use this for initial setup or major updates

echo "🚀 Deploying ALL Firebase functions..."
echo "📦 This will deploy all functions from shared-firebase-functions"

cd "$(dirname "$0")"

firebase deploy --only functions

echo "✅ All functions deployment complete!"
