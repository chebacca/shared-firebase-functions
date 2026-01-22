#!/bin/bash
# Export current functions.config() values for migration reference
# WARNING: This exports secrets - handle with care!

set -e

PROJECT_ID="backbone-logic"
OUTPUT_FILE="current-functions-config-$(date +%Y%m%d-%H%M%S).json"

echo "📥 Exporting functions.config() values"
echo "======================================"
echo "Project: $PROJECT_ID"
echo "Output: $OUTPUT_FILE"
echo ""
echo -e "\033[1;33m⚠️  WARNING: This file will contain secrets!\033[0m"
echo "   - Review the file carefully"
echo "   - Delete it after migration"
echo "   - Never commit it to git"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Error: Firebase CLI is not installed"
    echo "Install it: npm install -g firebase-tools"
    exit 1
fi

# Export config
echo "Exporting functions.config()..."
firebase functions:config:get --project=$PROJECT_ID > "$OUTPUT_FILE" 2>&1 || {
    echo "❌ Error exporting config"
    echo "This might mean:"
    echo "  - No functions.config() values are set"
    echo "  - You're not authenticated"
    echo "  - Project ID is incorrect"
    exit 1
}

# Check if file has content
if [ ! -s "$OUTPUT_FILE" ] || grep -q "{}" "$OUTPUT_FILE"; then
    echo "⚠️  No functions.config() values found (or empty)"
    rm -f "$OUTPUT_FILE"
    exit 0
fi

echo ""
echo "✅ Config exported to: $OUTPUT_FILE"
echo ""
echo "Next steps:"
echo "  1. Review the file: cat $OUTPUT_FILE"
echo "  2. Use values to create secrets in Secret Manager"
echo "  3. Delete this file after migration: rm $OUTPUT_FILE"
echo ""
echo -e "\033[1;31m⚠️  REMEMBER: Delete this file after migration!\033[0m"
