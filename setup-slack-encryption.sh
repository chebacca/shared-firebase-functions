#!/bin/bash

# Setup Slack Encryption Key for Firebase Functions
# This script generates and sets up the encryption key for Slack integration

set -e

echo "🔐 Slack Encryption Key Setup"
echo "=============================="
echo ""

# Generate encryption key
echo "🔑 Generating secure 32-byte encryption key..."
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

echo "✅ Key generated!"
echo ""
echo "Your encryption key: $ENCRYPTION_KEY"
echo ""

# Instructions
echo "📋 Next steps:"
echo ""
echo "Option 1: Set as Firebase Secret (Recommended for production)"
echo "  firebase functions:secrets:set ENCRYPTION_KEY"
echo "  # When prompted, enter: $ENCRYPTION_KEY"
echo ""
echo "Option 2: Set as Firebase Config (Legacy)"
echo "  firebase functions:config:set integrations.encryption_key=\"$ENCRYPTION_KEY\""
echo "  firebase deploy --only functions"
echo ""

read -p "Would you like to set this key now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "⚠️  IMPORTANT: This will set the encryption key in your Firebase project."
  read -p "Continue? (y/n) " -n 1 -r
  echo ""
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Try secrets manager first (for v2 functions)
    if firebase functions:secrets:set ENCRYPTION_KEY <<< "$ENCRYPTION_KEY" 2>/dev/null; then
      echo "✅ Key set successfully as Firebase Secret!"
    else
      # Fallback to config
      echo "📝 Setting key in Firebase config (legacy)..."
      firebase functions:config:set integrations.encryption_key="$ENCRYPTION_KEY"
      echo "✅ Key set in Firebase config!"
      echo ""
      echo "📦 Deploying updated config..."
      firebase deploy --only functions
      echo ""
      echo "✅ Configuration complete!"
    fi
  fi
fi

echo ""
echo "⚠️  SECURITY REMINDER:"
echo "   - Never commit this key to version control"
echo "   - Store it securely in your password manager"
echo "   - Share only with authorized team members"
echo ""
echo "📝 Save this key: $ENCRYPTION_KEY"
echo ""


