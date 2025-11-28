#!/bin/bash

# Deploy only timecard functions to avoid build errors
echo "🔥 Deploying timecard functions to Firebase..."

cd "/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/shared-firebase-functions"

# Build only the timecard functions
echo "📦 Building timecard functions..."
npx tsc src/timecards/*.ts --outDir lib/timecards --target es2018 --module commonjs --esModuleInterop --skipLibCheck

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
    
    # Create a minimal index.js for deployment
    cat > lib/index.js << 'EOF'
const { getTimecardTemplates, getTimecardTemplatesHttp } = require('./timecards/getTimecardTemplates');
const { createTimecardTemplate, createTimecardTemplateHttp } = require('./timecards/createTimecardTemplate');
const { getTimecardAssignments, getTimecardAssignmentsHttp } = require('./timecards/getTimecardAssignments');
const { getAllTimecards, getAllTimecardsHttp } = require('./timecards/getAllTimecards');
const { getTimecardUsers, getTimecardUsersHttp } = require('./timecards/getTimecardUsers');
const { getTimecardConfigurations, getTimecardConfigurationsHttp } = require('./timecards/getTimecardConfigurations');

module.exports = {
  getTimecardTemplates,
  getTimecardTemplatesHttp,
  createTimecardTemplate,
  createTimecardTemplateHttp,
  getTimecardAssignments,
  getTimecardAssignmentsHttp,
  getAllTimecards,
  getAllTimecardsHttp,
  getTimecardUsers,
  getTimecardUsersHttp,
  getTimecardConfigurations,
  getTimecardConfigurationsHttp
};
EOF

    echo "🚀 Deploying to Firebase..."
    firebase deploy --only functions:getTimecardTemplates,functions:getTimecardTemplatesHttp,functions:getTimecardAssignments,functions:getTimecardAssignmentsHttp,functions:getAllTimecards,functions:getAllTimecardsHttp,functions:getTimecardUsers,functions:getTimecardUsersHttp,functions:getTimecardConfigurations,functions:getTimecardConfigurationsHttp --project backbone-logic
    
    if [ $? -eq 0 ]; then
        echo "✅ Timecard functions deployed successfully!"
    else
        echo "❌ Deployment failed"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi
