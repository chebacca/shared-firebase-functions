#!/bin/bash

# Setup Box Configuration for Firebase Functions
# This script helps configure Box OAuth credentials

set -e

echo "📦 Box Configuration Setup"
echo "=========================="
echo ""

echo "To configure Box integration, you need:"
echo "  1. Box Client ID"
echo "  2. Box Client Secret"
echo "  3. Box Redirect URI (optional)"
echo "  4. Box Scope (optional, defaults to root_readwrite)"
echo ""

read -p "Do you have Box credentials ready? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "📋 Get Box Credentials:"
  echo "  1. Go to https://app.box.com/developers/console"
  echo "  2. Create a new app or select existing app"
  echo "  3. Go to 'Configuration' → 'General'"
  echo "  4. Copy Client ID and Client Secret"
  echo "  5. Set Redirect URI to: https://clipshowpro.web.app/auth/box/callback.html"
  echo ""
  exit 0
fi

echo ""
read -p "Enter Box Client ID: " BOX_CLIENT_ID
read -p "Enter Box Client Secret: " BOX_CLIENT_SECRET
read -p "Enter Box Redirect URI (or press Enter for default): " BOX_REDIRECT_URI
read -p "Enter Box Scope (or press Enter for root_readwrite): " BOX_SCOPE

BOX_REDIRECT_URI=${BOX_REDIRECT_URI:-"https://clipshowpro.web.app/auth/box/callback.html"}
BOX_SCOPE=${BOX_SCOPE:-"root_readwrite"}

echo ""
echo "📋 Configuring Box credentials..."
echo ""

# Option 1: Set as Firebase Functions config (legacy but works)
echo "Setting Box config in Firebase Functions config..."
firebase functions:config:set box.client_id="$BOX_CLIENT_ID" \
                             box.client_secret="$BOX_CLIENT_SECRET" \
                             box.redirect_uri="$BOX_REDIRECT_URI" \
                             box.scope="$BOX_SCOPE"

echo ""
echo "✅ Box configuration set!"
echo ""
echo "📦 Deploying updated functions..."
firebase deploy --only functions:listBoxFolders,functions:getBoxFiles,functions:createBoxFolder,functions:handleBoxOAuthCallback,functions:getBoxIntegrationStatus

echo ""
echo "✅ Setup complete!"
echo ""
echo "You can now use Box integration in your application."
echo ""

