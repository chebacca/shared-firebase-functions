#!/bin/bash
# Setup script for Google Cloud Secret Manager
# This script helps create all required secrets for Firebase Functions

set -e  # Exit on error

PROJECT_ID="backbone-logic"
FIREBASE_SA="${PROJECT_ID}@appspot.gserviceaccount.com"

echo "🔐 Firebase Functions Secret Manager Setup"
echo "=========================================="
echo "Project: $PROJECT_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️  Not authenticated with gcloud${NC}"
    echo "Running: gcloud auth login"
    gcloud auth login
fi

# Set project
echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo ""
echo "This script will create the following secrets:"
echo "  1. GEMINI_API_KEY"
echo "  2. GOOGLE_MAPS_API_KEY"
echo "  3. ENCRYPTION_KEY (auto-generated)"
echo "  4. INTEGRATIONS_ENCRYPTION_KEY (auto-generated)"
echo "  5. GOOGLE_OAUTH_CONFIG (JSON secret)"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Function to create secret if it doesn't exist
create_secret_if_not_exists() {
    local SECRET_NAME=$1
    local DESCRIPTION=$2
    
    if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
        echo -e "${YELLOW}⚠️  Secret $SECRET_NAME already exists. Skipping...${NC}"
        return 0
    fi
    
    echo -e "${GREEN}Creating secret: $SECRET_NAME${NC}"
    echo "$DESCRIPTION" | gcloud secrets create $SECRET_NAME \
        --project=$PROJECT_ID \
        --replication-policy="automatic" \
        --data-file=- \
        --labels="managed-by=firebase-functions,created-by=setup-script"
    
    echo -e "${GREEN}✅ Created $SECRET_NAME${NC}"
}

# Function to grant service account access
grant_access() {
    local SECRET_NAME=$1
    
    echo "Granting access to $FIREBASE_SA..."
    gcloud secrets add-iam-policy-binding $SECRET_NAME \
        --project=$PROJECT_ID \
        --member="serviceAccount:$FIREBASE_SA" \
        --role="roles/secretmanager.secretAccessor" \
        --quiet || echo -e "${YELLOW}⚠️  Access may already be granted${NC}"
}

# 1. GEMINI_API_KEY
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. GEMINI_API_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -sp "Enter your Gemini API key: " GEMINI_KEY
echo ""

if [ -z "$GEMINI_KEY" ]; then
    echo -e "${YELLOW}⚠️  Skipping GEMINI_API_KEY (empty input)${NC}"
else
    echo -n "$GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY \
        --project=$PROJECT_ID \
        --replication-policy="automatic" \
        --data-file=- \
        --labels="managed-by=firebase-functions,created-by=setup-script" 2>/dev/null || \
    echo -e "${YELLOW}⚠️  GEMINI_API_KEY already exists${NC}"
    grant_access "GEMINI_API_KEY"
fi

# 2. GOOGLE_MAPS_API_KEY
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. GOOGLE_MAPS_API_KEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -sp "Enter your Google Maps API key: " MAPS_KEY
echo ""

if [ -z "$MAPS_KEY" ]; then
    echo -e "${YELLOW}⚠️  Skipping GOOGLE_MAPS_API_KEY (empty input)${NC}"
else
    echo -n "$MAPS_KEY" | gcloud secrets create GOOGLE_MAPS_API_KEY \
        --project=$PROJECT_ID \
        --replication-policy="automatic" \
        --data-file=- \
        --labels="managed-by=firebase-functions,created-by=setup-script" 2>/dev/null || \
    echo -e "${YELLOW}⚠️  GOOGLE_MAPS_API_KEY already exists${NC}"
    grant_access "GOOGLE_MAPS_API_KEY"
fi

# 3. ENCRYPTION_KEY (auto-generated)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. ENCRYPTION_KEY (auto-generating)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ENCRYPTION_KEY=$(openssl rand -hex 16)
echo "Generated encryption key: ${ENCRYPTION_KEY:0:8}...${ENCRYPTION_KEY: -8}"

echo -n "$ENCRYPTION_KEY" | gcloud secrets create ENCRYPTION_KEY \
    --project=$PROJECT_ID \
    --replication-policy="automatic" \
    --data-file=- \
    --labels="managed-by=firebase-functions,created-by=setup-script" 2>/dev/null || \
echo -e "${YELLOW}⚠️  ENCRYPTION_KEY already exists${NC}"
grant_access "ENCRYPTION_KEY"

# 4. INTEGRATIONS_ENCRYPTION_KEY (auto-generated)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. INTEGRATIONS_ENCRYPTION_KEY (auto-generating)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
INTEGRATIONS_KEY=$(openssl rand -hex 16)
echo "Generated integrations key: ${INTEGRATIONS_KEY:0:8}...${INTEGRATIONS_KEY: -8}"

echo -n "$INTEGRATIONS_KEY" | gcloud secrets create INTEGRATIONS_ENCRYPTION_KEY \
    --project=$PROJECT_ID \
    --replication-policy="automatic" \
    --data-file=- \
    --labels="managed-by=firebase-functions,created-by=setup-script" 2>/dev/null || \
echo -e "${YELLOW}⚠️  INTEGRATIONS_ENCRYPTION_KEY already exists${NC}"
grant_access "INTEGRATIONS_ENCRYPTION_KEY"

# 5. GOOGLE_OAUTH_CONFIG (JSON)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. GOOGLE_OAUTH_CONFIG (JSON secret)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Enter Google OAuth Client ID: " CLIENT_ID
read -sp "Enter Google OAuth Client Secret: " CLIENT_SECRET
echo ""
read -p "Enter Redirect URI [default: https://backbone-client.web.app/auth/google/callback]: " REDIRECT_URI
REDIRECT_URI=${REDIRECT_URI:-"https://backbone-client.web.app/auth/google/callback"}

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
    echo -e "${YELLOW}⚠️  Skipping GOOGLE_OAUTH_CONFIG (missing values)${NC}"
else
    # Create temporary JSON file
    TEMP_JSON=$(mktemp)
    cat > "$TEMP_JSON" << EOF
{
  "client_id": "$CLIENT_ID",
  "client_secret": "$CLIENT_SECRET",
  "redirect_uri": "$REDIRECT_URI"
}
EOF
    
    gcloud secrets create GOOGLE_OAUTH_CONFIG \
        --project=$PROJECT_ID \
        --replication-policy="automatic" \
        --data-file="$TEMP_JSON" \
        --labels="managed-by=firebase-functions,created-by=setup-script" 2>/dev/null || \
    echo -e "${YELLOW}⚠️  GOOGLE_OAUTH_CONFIG already exists${NC}"
    
    # Clean up temp file
    rm -f "$TEMP_JSON"
    grant_access "GOOGLE_OAUTH_CONFIG"
fi

# Grant access to all secrets
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Granting service account access..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for SECRET in GEMINI_API_KEY GOOGLE_MAPS_API_KEY ENCRYPTION_KEY INTEGRATIONS_ENCRYPTION_KEY GOOGLE_OAUTH_CONFIG; do
    if gcloud secrets describe $SECRET --project=$PROJECT_ID &>/dev/null; then
        grant_access "$SECRET"
    fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Created secrets:"
gcloud secrets list --project=$PROJECT_ID --filter="labels.managed-by=firebase-functions" --format="table(name,createTime)"
echo ""
echo "Next steps:"
echo "  1. Verify secrets: ./scripts/verify-secrets.sh"
echo "  2. Deploy functions: firebase deploy --only functions"
echo "  3. Test in staging environment"
echo ""
