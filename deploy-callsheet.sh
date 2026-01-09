#!/bin/bash
# Deploy functions for Standalone Call Sheet
# Deploys: shared functions + callsheet-specific functions

echo "🚀 Deploying Standalone Call Sheet functions..."
echo "📦 Includes: shared functions + callsheet-specific functions"

cd "$(dirname "$0")"

firebase deploy --only functions:callsheet_createPersonnelAccount,functions:callsheet_changePersonnelPassword,functions:callsheet_resetPersonnelPassword

echo "✅ Standalone Call Sheet functions deployment complete!"
