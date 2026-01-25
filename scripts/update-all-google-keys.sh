#!/bin/bash
# Script to update ALL Google-related keys across the project
# Handles GOOGLE_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, etc.

set -e

# Project Configuration
PROJECT_ID="backbone-logic"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔑 Update Universal Google API Keys${NC}"
echo "========================================"
echo "This script will update Google API keys across:"
echo "1. Firebase Functions Config"
echo "2. Google Cloud Secrets"
echo "3. Local .env files"
echo ""

# 1. Gather all potential keys user might want to update
echo -e "${YELLOW}Leave blank to skip any key you don't want to update.${NC}"
echo ""

echo -e "${BLUE}[1/4] Google API Key (Maps, Places, YouTube, Gemini fallback)${NC}"
read -sp "Enter new GOOGLE_API_KEY: " NEW_API_KEY
echo ""
if [ -n "$NEW_API_KEY" ]; then
    echo -e "   -> Will update GOOGLE_API_KEY"
fi
echo ""

echo -e "${BLUE}[2/4] Google OAuth Client ID${NC}"
read -p "Enter new GOOGLE_CLIENT_ID: " NEW_CLIENT_ID
if [ -n "$NEW_CLIENT_ID" ]; then
    echo -e "   -> Will update GOOGLE_CLIENT_ID"
fi
echo ""

echo -e "${BLUE}[3/4] Google OAuth Client Secret${NC}"
read -sp "Enter new GOOGLE_CLIENT_SECRET: " NEW_CLIENT_SECRET
echo ""
if [ -n "$NEW_CLIENT_SECRET" ]; then
    echo -e "   -> Will update GOOGLE_CLIENT_SECRET"
fi
echo ""

echo -e "${BLUE}[4/5] Google Maps Specific Key (if different from API Key)${NC}"
read -sp "Enter new GOOGLE_MAPS_API_KEY (leave blank to use API KEY): " NEW_MAPS_KEY
echo ""
if [ -z "$NEW_MAPS_KEY" ] && [ -n "$NEW_API_KEY" ]; then
    NEW_MAPS_KEY="$NEW_API_KEY"
    echo -e "   -> Will update GOOGLE_MAPS_API_KEY using the general API Key provided."
elif [ -n "$NEW_MAPS_KEY" ]; then
    echo -e "   -> Will update GOOGLE_MAPS_API_KEY with specific key."
fi
echo ""

echo -e "${BLUE}[5/5] Gemini API Key (if different from general API Key)${NC}"
read -sp "Enter new GEMINI_API_KEY (leave blank to use API KEY): " NEW_GEMINI_KEY
echo ""
if [ -z "$NEW_GEMINI_KEY" ] && [ -n "$NEW_API_KEY" ]; then
    NEW_GEMINI_KEY="$NEW_API_KEY"
    echo -e "   -> Will update GEMINI_API_KEY using the general API Key provided."
elif [ -n "$NEW_GEMINI_KEY" ]; then
    echo -e "   -> Will update GEMINI_API_KEY with specific key."
fi
echo ""

# Confirmation
echo "----------------------------------------"
if [ -z "$NEW_API_KEY" ] && [ -z "$NEW_CLIENT_ID" ] && [ -z "$NEW_CLIENT_SECRET" ] && [ -z "$NEW_MAPS_KEY" ]; then
    echo -e "${RED}No keys provided. Exiting.${NC}"
    exit 0
fi

read -p "Apply these updates? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
fi

# Define list of env files to update
# These paths are relative to the project root where the script is usually run from
ENV_FILES=(
  "./.env"
  "./_backbone_address_book/.env"
  "./_backbone_bridge/.env"
  "./_backbone_clip_show_pro/.env"
  "./_backbone_cns/.env"
  "./_backbone_cuesheet_budget_tools/.env"
  "./_backbone_deliverables/.env"
  "./_backbone_hub/.env"
  "./_backbone_iwm/.env"
  "./_backbone_licensing_website/.env"
  "./_backbone_mobile_companion_v1.0/.env"
  "./_backbone_production_workflow_system/.env"
  "./_backbone_security_desk/.env"
  "./_backbone_shared_features/.env"
  "./_backbone_standalone_call_sheet/.env"
  "./_backbone_timecard_management_system/.env"
  "./shared-firebase-functions/.env"
)

# Helper function to update/add env var in a file
update_env_var() {
    local file=$1
    local key=$2
    local value=$3
    
    if [ ! -f "$file" ]; then
        return
    fi
    
    # Escape special characters for sed
    local escaped_value=$(echo "$value" | sed 's/[\/&]/\\&/g')
    
    if grep -q "^$key=" "$file"; then
        # Update existing
        sed -i '' "s/^$key=.*/$key=$escaped_value/" "$file"
    else
        # Append new
        echo "$key=$value" >> "$file"
    fi
    echo -e "   Updated $key in $file"
}

# Helper function to ensure secret exists
ensure_secret() {
    local secret_name=$1
    if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
        echo -e "${YELLOW}   Secret $secret_name not found. Creating it...${NC}"
        gcloud secrets create "$secret_name" --project="$PROJECT_ID" --replication-policy="automatic" --quiet
    fi
}

# Enable legacy Firebase config commands if needed (handling deprecation)
echo -e "${BLUE}Enabling legacy Firebase config commands...${NC}"
firebase experiments:enable legacyRuntimeConfigCommands --project=$PROJECT_ID &>/dev/null || true

# --- PROCESS UPDATES ---

# 1. GOOGLE_API_KEY
if [ -n "$NEW_API_KEY" ]; then
    echo -e "${BLUE}Updating GOOGLE_API_KEY...${NC}"
    
    # Update Secrets
    ensure_secret "GOOGLE_API_KEY"
    echo -n "$NEW_API_KEY" | gcloud secrets versions add GOOGLE_API_KEY --project=$PROJECT_ID --data-file=- --quiet || echo -e "${YELLOW}   Failed to update Secret Manager${NC}"
    
    # Update Firebase Config
    firebase functions:config:set google.api_key="$NEW_API_KEY" --project=$PROJECT_ID || echo -e "${YELLOW}   Failed to update Firebase Config${NC}"
    
    # Update .env files
    for f in "${ENV_FILES[@]}"; do
        update_env_var "$f" "GOOGLE_API_KEY" "$NEW_API_KEY"
        update_env_var "$f" "VITE_GOOGLE_API_KEY" "$NEW_API_KEY"
        update_env_var "$f" "NEXT_PUBLIC_GOOGLE_API_KEY" "$NEW_API_KEY"
    done
fi

# 2. GOOGLE_CLIENT_ID
if [ -n "$NEW_CLIENT_ID" ]; then
    echo -e "${BLUE}Updating GOOGLE_CLIENT_ID...${NC}"
    
    # Update Secrets
    ensure_secret "GOOGLE_CLIENT_ID"
    echo -n "$NEW_CLIENT_ID" | gcloud secrets versions add GOOGLE_CLIENT_ID --project=$PROJECT_ID --data-file=- --quiet || echo -e "${YELLOW}   Failed to update Secret Manager${NC}"
    
    # Update Firebase Config
    firebase functions:config:set google.client_id="$NEW_CLIENT_ID" --project=$PROJECT_ID || echo -e "${YELLOW}   Failed to update Firebase Config${NC}"
    
    # Update .env files
    for f in "${ENV_FILES[@]}"; do
        update_env_var "$f" "GOOGLE_CLIENT_ID" "$NEW_CLIENT_ID"
        update_env_var "$f" "VITE_GOOGLE_CLIENT_ID" "$NEW_CLIENT_ID"
        update_env_var "$f" "NEXT_PUBLIC_GOOGLE_CLIENT_ID" "$NEW_CLIENT_ID"
    done
fi

# 3. GOOGLE_CLIENT_SECRET
if [ -n "$NEW_CLIENT_SECRET" ]; then
    echo -e "${BLUE}Updating GOOGLE_CLIENT_SECRET...${NC}"
    
    # Update Secrets
    ensure_secret "GOOGLE_CLIENT_SECRET"
    echo -n "$NEW_CLIENT_SECRET" | gcloud secrets versions add GOOGLE_CLIENT_SECRET --project=$PROJECT_ID --data-file=- --quiet || echo -e "${YELLOW}   Failed to update Secret Manager${NC}"
    
    # Update Firebase Config
    firebase functions:config:set google.client_secret="$NEW_CLIENT_SECRET" --project=$PROJECT_ID || echo -e "${YELLOW}   Failed to update Firebase Config${NC}"
    
    # Update .env files
    for f in "${ENV_FILES[@]}"; do
        update_env_var "$f" "GOOGLE_CLIENT_SECRET" "$NEW_CLIENT_SECRET"
    done
fi

# 4. GOOGLE_MAPS_API_KEY
if [ -n "$NEW_MAPS_KEY" ]; then
     echo -e "${BLUE}Updating GOOGLE_MAPS_API_KEY...${NC}"
     
     # Update Secrets
     ensure_secret "GOOGLE_MAPS_API_KEY"
     echo -n "$NEW_MAPS_KEY" | gcloud secrets versions add GOOGLE_MAPS_API_KEY --project=$PROJECT_ID --data-file=- --quiet || echo -e "${YELLOW}   Failed to update Secret Manager${NC}"
     
     # Update .env files
     for f in "${ENV_FILES[@]}"; do
         update_env_var "$f" "GOOGLE_MAPS_API_KEY" "$NEW_MAPS_KEY"
         update_env_var "$f" "VITE_GOOGLE_MAPS_API_KEY" "$NEW_MAPS_KEY"
         update_env_var "$f" "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY" "$NEW_MAPS_KEY"
     done
fi

# 5. GEMINI_API_KEY
if [ -n "$NEW_GEMINI_KEY" ]; then
     echo -e "${BLUE}Updating GEMINI_API_KEY...${NC}"
     
     # Update Secrets
     ensure_secret "GEMINI_API_KEY"
     echo -n "$NEW_GEMINI_KEY" | gcloud secrets versions add GEMINI_API_KEY --project=$PROJECT_ID --data-file=- --quiet || echo -e "${YELLOW}   Failed to update Secret Manager${NC}"
     
     # Update .env files
     for f in "${ENV_FILES[@]}"; do
         update_env_var "$f" "GEMINI_API_KEY" "$NEW_GEMINI_KEY"
     done
fi

echo ""
echo -e "${GREEN}✅ All requested keys have been updated!${NC}"

echo "Note: For Firebase functions, you must redeploy for changes to take effect: ./scripts/deploy-master-agent-v2.sh"

