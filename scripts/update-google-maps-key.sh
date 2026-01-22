#!/bin/bash
# Script to update GOOGLE_MAPS_API_KEY secret from .env file

set -e

PROJECT_ID="backbone-logic"
SECRET_NAME="GOOGLE_MAPS_API_KEY"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔑 Update Google Maps API Key Secret${NC}"
echo "========================================"
echo "Project: $PROJECT_ID"
echo "Secret: $SECRET_NAME"
echo ""

# Try to find API key in .env files
ENV_FILES=(
  "$(pwd)/.env"
  "$(pwd)/../.env"
  "$(pwd)/../../.env"
  "$(pwd)/../_backbone_licensing_website/.env"
)

API_KEY=""

# Try to read from .env files
for ENV_FILE in "${ENV_FILES[@]}"; do
  if [ -f "$ENV_FILE" ]; then
    echo -e "${BLUE}Checking: $ENV_FILE${NC}"
    FOUND_KEY=$(grep -i "GOOGLE_MAPS_API_KEY" "$ENV_FILE" 2>/dev/null | cut -d '=' -f2- | tr -d ' ' | tr -d '"' | tr -d "'" || echo "")
    if [ -n "$FOUND_KEY" ] && [ "$FOUND_KEY" != "your-google-maps-api-key-here" ] && [ "$FOUND_KEY" != "placeholder" ]; then
      API_KEY="$FOUND_KEY"
      echo -e "${GREEN}✅ Found API key in: $ENV_FILE${NC}"
      break
    fi
  fi
done

# If not found in .env, prompt user
if [ -z "$API_KEY" ]; then
  echo -e "${YELLOW}⚠️  Could not find API key in .env files${NC}"
  echo ""
  read -sp "Enter your Google Maps API key: " API_KEY
  echo ""
fi

if [ -z "$API_KEY" ] || [ "$API_KEY" == "your-google-maps-api-key-here" ] || [ "$API_KEY" == "placeholder" ]; then
  echo -e "${RED}❌ Invalid or empty API key${NC}"
  exit 1
fi

# Show first 10 chars for verification
KEY_PREFIX="${API_KEY:0:10}..."
echo -e "${BLUE}API Key (first 10 chars): $KEY_PREFIX${NC}"
echo ""

# Confirm update
read -p "Update the secret with this API key? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo -e "${YELLOW}Cancelled${NC}"
  exit 0
fi

# Update the secret
echo ""
echo -e "${BLUE}Updating secret...${NC}"
echo -n "$API_KEY" | gcloud secrets versions add $SECRET_NAME \
  --project=$PROJECT_ID \
  --data-file=-

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Secret updated successfully!${NC}"
  echo ""
  echo "Testing endpoint..."
  sleep 2
  curl -s "https://us-central1-${PROJECT_ID}.cloudfunctions.net/api/google-maps/config" | python3 -m json.tool 2>/dev/null || \
    curl -s "https://us-central1-${PROJECT_ID}.cloudfunctions.net/api/google-maps/config"
  echo ""
  echo -e "${GREEN}✅ Done! Refresh your browser to see the map.${NC}"
else
  echo -e "${RED}❌ Failed to update secret${NC}"
  exit 1
fi
