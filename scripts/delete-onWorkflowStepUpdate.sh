#!/bin/bash
# One-time: delete old onWorkflowStepUpdate so the Firestore-triggered version can deploy.
# Run from repo root: ./shared-firebase-functions/scripts/delete-onWorkflowStepUpdate.sh

set -e
cd "$(dirname "$0")/../.."
echo "Deleting onWorkflowStepUpdate (wait ~30–60s)..."
firebase functions:delete onWorkflowStepUpdate --region us-central1 --project backbone-logic --force
echo "Done. Now run: ./scripts/deployment/deploy-functions.sh --project backbone-logic"
