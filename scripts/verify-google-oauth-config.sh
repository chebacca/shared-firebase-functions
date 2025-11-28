#!/bin/bash

# Verify Google OAuth Configuration for Firebase Functions
# This script checks if the OAuth credentials are properly configured

set -e

echo "🔍 Verifying Google OAuth Configuration..."
echo ""

# Navigate to shared-firebase-functions directory
cd "$(dirname "$0")/.."

# Check if Firebase CLI is available
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first."
    exit 1
fi

# Get current configuration
echo "📋 Current Firebase Functions Configuration:"
echo "----------------------------------------"
firebase functions:config:get google 2>&1 | grep -v "DEPRECATION NOTICE" || true
echo ""

# Extract values
CONFIG_OUTPUT=$(firebase functions:config:get google 2>&1 | grep -v "DEPRECATION NOTICE" || true)
CLIENT_ID=$(echo "$CONFIG_OUTPUT" | grep -o '"client_id": "[^"]*' | cut -d'"' -f4)
CLIENT_SECRET=$(echo "$CONFIG_OUTPUT" | grep -o '"client_secret": "[^"]*' | cut -d'"' -f4)
REDIRECT_URI=$(echo "$CONFIG_OUTPUT" | grep -o '"redirect_uri": "[^"]*' | cut -d'"' -f4)

echo "🔍 Configuration Details:"
echo "----------------------------------------"
echo "Client ID: ${CLIENT_ID:0:30}... (${#CLIENT_ID} chars)"
echo "Client Secret: ${CLIENT_SECRET:0:15}... (${#CLIENT_SECRET} chars)"
echo "Redirect URI: $REDIRECT_URI"
echo ""

# Validate configuration
ERRORS=0

if [ -z "$CLIENT_ID" ]; then
    echo "❌ Client ID is missing"
    ERRORS=$((ERRORS + 1))
elif [[ ! "$CLIENT_ID" == *".apps.googleusercontent.com"* ]]; then
    echo "⚠️  Client ID format may be incorrect (should contain .apps.googleusercontent.com)"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Client ID format looks correct"
fi

if [ -z "$CLIENT_SECRET" ]; then
    echo "❌ Client Secret is missing"
    ERRORS=$((ERRORS + 1))
elif [[ ! "$CLIENT_SECRET" == "GOCSPX-"* ]]; then
    echo "⚠️  Client Secret format may be incorrect (should start with GOCSPX-)"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Client Secret format looks correct"
fi

if [ -z "$REDIRECT_URI" ]; then
    echo "❌ Redirect URI is missing"
    ERRORS=$((ERRORS + 1))
elif [[ "$REDIRECT_URI" == *"localhost"* ]] && [[ "$REDIRECT_URI" != *"backbone-client.web.app"* ]]; then
    echo "⚠️  Redirect URI is set to localhost only. Production URI should also be configured."
    echo "   Recommended: Add both localhost and production URIs in Google Cloud Console"
else
    echo "✅ Redirect URI is configured"
fi

echo ""
echo "----------------------------------------"

if [ $ERRORS -eq 0 ]; then
    echo "✅ Configuration looks good!"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Verify the OAuth client exists in Google Cloud Console:"
    echo "   https://console.cloud.google.com/apis/credentials?project=backbone-logic"
    echo ""
    echo "2. Ensure the redirect URI is authorized in Google Cloud Console:"
    echo "   - Development: http://localhost:4010/auth/google/callback.html"
    echo "   - Production: https://backbone-client.web.app/auth/google/callback"
    echo ""
    echo "3. Deploy the functions to apply the configuration:"
    echo "   firebase deploy --only functions"
else
    echo "❌ Found $ERRORS issue(s) with the configuration"
    echo ""
    echo "🔧 To fix:"
    echo "1. Set missing values:"
    echo "   firebase functions:config:set google.client_id=\"YOUR_CLIENT_ID\""
    echo "   firebase functions:config:set google.client_secret=\"YOUR_CLIENT_SECRET\""
    echo "   firebase functions:config:set google.redirect_uri=\"YOUR_REDIRECT_URI\""
    echo ""
    echo "2. Get credentials from Google Cloud Console:"
    echo "   https://console.cloud.google.com/apis/credentials?project=backbone-logic"
    exit 1
fi

