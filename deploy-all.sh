#!/bin/bash
# Deploy ALL functions (for full deployments)
# Use this for initial setup or major updates
#
# NOTE: This script now calls the master deployment script at the root.
# All deployment should happen from the root directory using root firebase.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🚀 Deploying ALL Firebase functions..."
echo "📦 This will deploy all functions from shared-firebase-functions"
echo "📝 Using master deployment script from project root"

cd "$PROJECT_ROOT"
exec "$PROJECT_ROOT/scripts/deployment/deploy-functions.sh"
