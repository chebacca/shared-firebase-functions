#!/bin/bash
# Test script to verify Google Maps API key configuration

set -e

PROJECT_ID="backbone-logic"
API_URL="https://us-central1-${PROJECT_ID}.cloudfunctions.net/api/google-maps/config"

echo "🧪 Testing Google Maps API Configuration"
echo "========================================"
echo "Endpoint: $API_URL"
echo ""

# Test the endpoint
echo "Making request to config endpoint..."
RESPONSE=$(curl -s "$API_URL" || echo '{"error": "Request failed"}')

echo ""
echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if API key is present
if echo "$RESPONSE" | grep -q '"apiKey"'; then
    echo "✅ API key is being returned"
    API_KEY_LENGTH=$(echo "$RESPONSE" | jq -r '.apiKey // .data.apiKey // ""' 2>/dev/null | wc -c)
    if [ "$API_KEY_LENGTH" -gt 10 ]; then
        echo "✅ API key appears to be valid (length: $((API_KEY_LENGTH - 1)))"
    else
        echo "⚠️  API key may be empty or invalid"
    fi
else
    echo "❌ API key is NOT being returned"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if GOOGLE_MAPS_API_KEY secret exists:"
    echo "   gcloud secrets describe GOOGLE_MAPS_API_KEY --project=$PROJECT_ID"
    echo ""
    echo "2. Check if secret has a value:"
    echo "   gcloud secrets versions list GOOGLE_MAPS_API_KEY --project=$PROJECT_ID"
    echo ""
    echo "3. Verify the API function has access to the secret"
    echo "4. Check function logs for errors"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
