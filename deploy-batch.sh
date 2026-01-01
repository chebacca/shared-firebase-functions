#!/bin/bash
# Deploy Firebase Functions in batches to avoid quota limits

set -e

echo "🚀 Starting Firebase Functions deployment in batches..."
echo ""

cd "$(dirname "$0")"

# Batch 1: Critical OAuth functions
echo "📦 Batch 1: OAuth functions..."
firebase deploy --only functions:appleConnectOAuthCallbackHttp,functions:googleOAuthInitiate,functions:googleOAuthCallback,functions:googleOAuthRefresh,functions:googleRevokeAccess 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 2: Slack functions (first batch)
echo "📦 Batch 2: Slack functions (part 1)..."
firebase deploy --only functions:slackGetPinnedMessages,functions:getSlackConfigStatus,functions:slackOpenDM,functions:slackSendMessage,functions:slackGetUserPresence 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 3: More Slack functions
echo "📦 Batch 3: Slack functions (part 2)..."
firebase deploy --only functions:slackListChannels,functions:slackGetWorkspaceInfo,functions:slackGetUsers,functions:slackOAuthInitiate,functions:slackOAuthRefresh 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 4: Webex and other integrations
echo "📦 Batch 4: Webex and integrations..."
firebase deploy --only functions:getWebexConfigStatus,functions:getWebexMeetingDetails,functions:webexOAuthInitiate,functions:webexOAuthRefresh,functions:webexOAuthRevoke 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 5: AI and other functions
echo "📦 Batch 5: AI and other functions..."
firebase deploy --only functions:storeAIApiKey,functions:triggerAlertGeneration,functions:processTranscriptionTask,functions:appRoleDefinitionsApi 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 6: Timecard functions (callable versions)
echo "📦 Batch 6: Timecard functions..."
firebase deploy --only functions:getTimecardTemplates,functions:createTimecardTemplate,functions:updateTimecardTemplate,functions:deleteTimecardTemplate,functions:getTimecardAssignments 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 7: More timecard functions
echo "📦 Batch 7: More timecard functions..."
firebase deploy --only functions:getTimecardAnalytics,functions:generateTimecardReport,functions:getAllTimecards,functions:getTimecardUsers,functions:getTimecardConfigurations 2>&1 | tail -20
echo "⏳ Waiting 3 minutes for quota reset..."
sleep 180

# Batch 8: Remaining timecard and other functions
echo "📦 Batch 8: Remaining functions..."
firebase deploy --only functions:getPendingApprovals,functions:getMySubmissions,functions:getApprovalHistory,functions:getDirectReports,functions:timecardApprovalApi 2>&1 | tail -20

echo ""
echo "✅ Deployment batches complete!"
echo ""
echo "📊 Verifying deployment..."
firebase functions:list 2>&1 | grep -E "(Http|http)" | head -20 || echo "No HTTP functions found (expected for removed ones)"

