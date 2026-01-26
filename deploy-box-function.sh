#!/bin/bash

# Deploy Box Access Token Cloud Function
# This script builds and deploys the getBoxAccessToken function to Firebase
# Must be run from the shared-firebase-functions directory

set -e  # Exit on error

echo "🔧 Building Cloud Functions..."
npm run build

echo ""
echo "🚀 Deploying functions to Firebase from project root..."
cd ..
firebase deploy --only functions --project backbone-logic

echo ""
echo "✅ Deployment complete!"
echo ""
echo "The function is now available at:"
echo "https://us-central1-backbone-logic.cloudfunctions.net/getBoxAccessToken"
