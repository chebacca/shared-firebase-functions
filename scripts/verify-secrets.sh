#!/bin/bash
# Verification script for Google Cloud Secret Manager secrets
# Checks that all required secrets exist and are accessible

set -e

PROJECT_ID="backbone-logic"
FIREBASE_SA="${PROJECT_ID}@appspot.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔍 Verifying Secret Manager Setup"
echo "=================================="
echo "Project: $PROJECT_ID"
echo "Service Account: $FIREBASE_SA"
echo ""

# Required secrets
REQUIRED_SECRETS=(
    "GEMINI_API_KEY"
    "GOOGLE_MAPS_API_KEY"
    "ENCRYPTION_KEY"
    "INTEGRATIONS_ENCRYPTION_KEY"
    "GOOGLE_OAUTH_CONFIG"
)

ALL_GOOD=true

# Check each secret
for SECRET in "${REQUIRED_SECRETS[@]}"; do
    echo -n "Checking $SECRET... "
    
    # Check if secret exists
    if ! gcloud secrets describe $SECRET --project=$PROJECT_ID &>/dev/null; then
        echo -e "${RED}❌ NOT FOUND${NC}"
        ALL_GOOD=false
        continue
    fi
    
    # Check if service account has access
    if gcloud secrets get-iam-policy $SECRET --project=$PROJECT_ID --format="value(bindings.members)" 2>/dev/null | grep -q "$FIREBASE_SA"; then
        echo -e "${GREEN}✅ OK${NC}"
    else
        echo -e "${YELLOW}⚠️  EXISTS BUT NO ACCESS${NC}"
        echo "   Grant access: gcloud secrets add-iam-policy-binding $SECRET \\"
        echo "     --project=$PROJECT_ID \\"
        echo "     --member=\"serviceAccount:$FIREBASE_SA\" \\"
        echo "     --role=\"roles/secretmanager.secretAccessor\""
        ALL_GOOD=false
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test secret access (non-sensitive check)
echo ""
echo "Testing secret access (metadata only)..."
for SECRET in "${REQUIRED_SECRETS[@]}"; do
    if gcloud secrets describe $SECRET --project=$PROJECT_ID &>/dev/null; then
        VERSION=$(gcloud secrets versions list $SECRET --project=$PROJECT_ID --limit=1 --format="value(name)" 2>/dev/null | head -1)
        if [ -n "$VERSION" ]; then
            echo -e "${GREEN}✅ $SECRET: Version $VERSION accessible${NC}"
        else
            echo -e "${YELLOW}⚠️  $SECRET: No versions found${NC}"
            ALL_GOOD=false
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ All secrets verified successfully!${NC}"
    echo ""
    echo "You can now:"
    echo "  1. Deploy functions: firebase deploy --only functions"
    echo "  2. Test in staging environment"
    exit 0
else
    echo -e "${RED}❌ Some secrets are missing or inaccessible${NC}"
    echo ""
    echo "Run setup script: ./scripts/setup-secrets.sh"
    exit 1
fi
