#!/bin/bash

# ============================================================================
# SHARED FIREBASE FUNCTIONS DEPLOYMENT SCRIPT
# ============================================================================
# 
# Deploys all shared Firebase Functions to the backbone-logic project
# ============================================================================

set -e

echo "🔥 Deploying Shared Firebase Functions..."

# Check if we're in the shared-firebase-functions directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from shared-firebase-functions directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Deploy all functions
echo "🚀 Deploying all functions to Firebase..."
firebase deploy --only functions --project backbone-logic

echo "✅ Shared functions deployment complete!"

# List deployed functions
echo ""
echo "📋 Deployed Functions:"
echo "  - Authentication (8 functions)"
echo "  - Projects (7 functions)"
echo "  - Datasets (4 functions)"
echo "  - Sessions (4 functions)"
echo "  - Licensing (4 functions)"
echo "  - Payments (3 functions)"
echo "  - Database (4 functions)"
echo "  - System (4 functions)"
echo "  - AI Processing (3 functions)"
echo "  - Team Management (6 functions)"
echo "  - Debug (1 function)"
echo "  - Main API Router (1 function)"
echo ""
echo "🌐 API Base URL: https://us-central1-backbone-logic.cloudfunctions.net/api"
echo "🏥 Health Check: https://us-central1-backbone-logic.cloudfunctions.net/api/health"
echo "📚 API Docs: https://us-central1-backbone-logic.cloudfunctions.net/api/docs"
