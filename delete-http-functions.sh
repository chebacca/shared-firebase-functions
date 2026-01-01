#!/bin/bash
# Delete all removed HTTP functions from Firebase

set -e

cd "$(dirname "$0")"

echo "🗑️  Deleting removed HTTP functions from Firebase..."
echo ""

# List of HTTP functions to delete
FUNCTIONS=(
  "addParticipantHttp"
  "aggregateTimecardCostsHttp"
  "calculateBudgetVarianceHttp"
  "callAIAgentHttp"
  "createMessageSessionHttp"
  "createTimecardSessionLinkHttp"
  "createTimecardTemplateHttp"
  "deleteMessageHttp"
  "deleteTimecardTemplateHttp"
  "generateTimecardReportHttp"
  "getAIAgentHealthHttp"
  "getAllTimecardsHttp"
  "getApprovalHistoryHttp"
  "getBudgetsHttp"
  "getDirectReportsHttp"
  "getMessageSessionsHttp"
  "getMessagesHttp"
  "getMySubmissionsHttp"
  "getParticipantsHttp"
  "getPendingApprovalsHttp"
  "getTURNCredentialsHttp"
  "getTimecardAnalyticsHttp"
  "getTimecardAssignmentsHttp"
  "getTimecardConfigurationsHttp"
  "getTimecardTemplatesHttp"
  "getTimecardUsersHttp"
  "getUserPreferencesHttp"
  "markMessagesAsReadHttp"
  "removeTimecardSessionLinkHttp"
  "revertCommittedAmountHttp"
  "sendMessageHttp"
  "syncTimecardToBudgetHttp"
  "updateCommittedAmountHttp"
  "updateMessageSessionHttp"
  "updateTimecardTemplateHttp"
)

REGION="us-central1"
DELETED=0
FAILED=0

for func in "${FUNCTIONS[@]}"; do
  echo -n "Deleting $func... "
  if firebase functions:delete "$func" --region "$REGION" --force 2>&1 | grep -q "Successful delete"; then
    echo "✅"
    ((DELETED++))
  else
    echo "❌ (may not exist)"
    ((FAILED++))
  fi
  # Small delay to avoid rate limits
  sleep 1
done

echo ""
echo "✅ Deleted: $DELETED functions"
echo "⚠️  Failed/Not found: $FAILED functions"
echo ""
echo "🎯 Next: Deploy functions with: firebase deploy --only functions"

