#!/bin/bash
# Deploy shared functions (videoConferencing, integrations, oauth, etc.)
# These are used by all apps
#
# NOTE: This script now calls the master deployment script at the root.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FUNCTIONS="scheduleMeetMeeting,createMeetMeeting,getVideoConferencingProviders,initiateOAuth,handleOAuthCallback,refreshOAuthToken,revokeOAuthConnection,listAvailableProviders,exchangeHubToken"

echo "🚀 Deploying shared Firebase functions..."
echo "📦 Includes: videoConferencing, integrations, oauth, slack, google, etc."

cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/scripts/deployment/deploy-functions.sh" --only "$FUNCTIONS"
