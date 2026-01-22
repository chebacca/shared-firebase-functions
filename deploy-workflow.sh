#!/bin/bash
# Deploy functions for Production Workflow System
# Deploys: shared functions + workflow-specific functions
#
# NOTE: This script now calls the master deployment script at the root.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FUNCTIONS="scheduleMeetMeeting,getVideoConferencingProviders,sendDeliveryPackageEmail,generateDeliveryPackageZip,proxyFileDownload,onWorkflowStepUpdate"

echo "🚀 Deploying Production Workflow System functions..."
echo "📦 Includes: shared functions (videoConferencing, integrations) + workflow-specific"

cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/scripts/deployment/deploy-functions.sh" --only "$FUNCTIONS"
