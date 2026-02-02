#!/bin/bash
# One-time: delete old onUserDocumentUpdated so the Firestore-triggered version can deploy.
# Firebase does not allow changing from HTTPS to background trigger in place.
# Run from repo root: ./shared-firebase-functions/scripts/delete-onUserDocumentUpdated.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
echo "Deleting onUserDocumentUpdated (wait ~30–60s)..."
firebase functions:delete onUserDocumentUpdated --region us-central1 --project backbone-logic --force
echo "Done. Now redeploy functions: ./scripts/deployment/deploy-functions.sh"
