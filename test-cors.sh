#!/bin/bash

echo "🔍 Testing CORS headers for deployed functions..."
echo ""

FUNCTIONS=(
  "slackGetUsers"
  "slackListChannels"
  "getVideoConferencingProviders"
  "getBoxAccessToken"
  "scheduleMeetMeeting"
)

for func in "${FUNCTIONS[@]}"; do
  echo "Testing: $func"
  
  # Send OPTIONS request (CORS preflight)
  response=$(curl -s -X OPTIONS \
    -H "Origin: http://localhost:4003" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: Content-Type,Authorization" \
    -I "https://us-central1-backbone-logic.cloudfunctions.net/$func" 2>&1)
  
  # Check for CORS headers
  if echo "$response" | grep -qi "access-control-allow-origin"; then
    cors_origin=$(echo "$response" | grep -i "access-control-allow-origin" | cut -d: -f2- | tr -d '\r')
    echo "  ✅ CORS enabled - Origin:$cors_origin"
  else
    echo "  ❌ CORS not enabled yet"
  fi
  
  echo ""
done

echo "🔄 Run this script again in a few minutes to check if CORS has propagated."
