#!/bin/bash
# Deploy functions for Timecard Management System
# Deploys: shared functions + timecard-specific functions

echo "🚀 Deploying Timecard Management System functions..."
echo "📦 Includes: shared functions + timecard-specific functions"

cd "$(dirname "$0")"

firebase deploy --only functions:getTimecardTemplates,functions:createTimecardTemplate,functions:updateTimecardTemplate,functions:deleteTimecardTemplate,functions:getAllTimecards,functions:getTimecardUsers,functions:getTimecardConfigurations,functions:onTimecardStatusChange,functions:getBudgets,functions:calculateBudgetVariance,functions:syncTimecardToBudget,functions:aggregateTimecardCosts,functions:getLaborRules,functions:getExtendedUsers

echo "✅ Timecard Management System functions deployment complete!"
