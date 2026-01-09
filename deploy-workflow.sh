#!/bin/bash
# Deploy functions for Production Workflow System
# Deploys: shared functions + workflow-specific functions

echo "🚀 Deploying Production Workflow System functions..."
echo "📦 Includes: shared functions (videoConferencing, integrations) + workflow-specific"

cd "$(dirname "$0")"

firebase deploy --only functions:scheduleMeetMeeting,functions:getVideoConferencingProviders,functions:sendDeliveryPackageEmail,functions:generateDeliveryPackageZip,functions:proxyFileDownload,functions:onWorkflowStepUpdate

echo "✅ Production Workflow System functions deployment complete!"
