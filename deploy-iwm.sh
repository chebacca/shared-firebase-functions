#!/bin/bash
# Deploy functions for IWM (Inventory & Workflow Management)
# Deploys: shared functions + IWM-specific functions

echo "🚀 Deploying IWM functions..."
echo "📦 Includes: shared functions + IWM-specific functions"

cd "$(dirname "$0")"

firebase deploy --only functions:iwmUpdateClaims

echo "✅ IWM functions deployment complete!"
