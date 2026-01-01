#!/bin/bash

# Deploy only clockIn/clockOut functions for fast fixing
echo "🔥 Deploying clock fix functions to Firebase..."

cd "/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/shared-firebase-functions"

# Build only the timecard functions
echo "📦 Building timecard functions..."
npx tsc src/timecards/*.ts --outDir lib/timecards --target es2018 --module commonjs --esModuleInterop --skipLibCheck

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
    
    # Create a minimal index.js for deployment
    cat > lib/index.js << 'EOF'
const { clockIn } = require('./timecards/clockIn');
const { clockOut } = require('./timecards/clockOut');

module.exports = {
  clockIn,
  clockOut
};
EOF

    echo "🚀 Deploying to Firebase (clock functions only)..."
    firebase deploy --only functions:clockIn,functions:clockOut --project backbone-logic
    
    if [ $? -eq 0 ]; then
        echo "✅ Clock functions deployed successfully!"
    else
        echo "❌ Deployment failed"
        exit 1
    fi
else
    echo "❌ Build failed"
    exit 1
fi
