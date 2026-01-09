#!/bin/bash
# Deploy shared functions (videoConferencing, integrations, oauth, etc.)
# These are used by all apps

echo "🚀 Deploying shared Firebase functions..."
echo "📦 Includes: videoConferencing, integrations, oauth, slack, google, etc."

cd "$(dirname "$0")"

firebase deploy --only functions:scheduleMeetMeeting,functions:createMeetMeeting,functions:getVideoConferencingProviders,functions:initiateOAuth,functions:handleOAuthCallback,functions:refreshOAuthToken,functions:revokeOAuthConnection,functions:listAvailableProviders

echo "✅ Shared functions deployment complete!"
