#!/bin/bash
# Extract all Firebase Function calls from the ecosystem

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_FILE="$REPO_ROOT/shared-firebase-functions/FUNCTION_DEPENDENCY_MATRIX.md"

echo "# Firebase Function Dependency Matrix" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generated: $(date)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "## Apps Analyzed" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

APPS=(
  "_backbone_production_workflow_system:Dashboard"
  "_backbone_licensing_website:Licensing"
  "_backbone_clip_show_pro:Clip Show Pro"
  "_backbone_cns:CNS"
  "_backbone_iwm:IWM"
  "_backbone_timecard_management_system:Timecard"
  "_backbone_standalone_call_sheet:Call Sheet"
  "_backbone_cuesheet_budget_tools:Cuesheet/Budget"
  "_backbone_address_book:Address Book"
  "_backbone_bridge:Bridge"
  "_backbone_mobile_companion_v1.0:Mobile Companion"
)

for app_info in "${APPS[@]}"; do
  IFS=':' read -r app_dir app_name <<< "$app_info"
  echo "### $app_name" >> "$OUTPUT_FILE"
  echo "" >> "$OUTPUT_FILE"
  
  # Find all function calls
  FUNCTIONS=$(grep -r "httpsCallable\|callFirebaseFunction" "$REPO_ROOT/$app_dir" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null | \
    grep -oE "httpsCallable\([^,]+,\s*['\"]([^'\"]+)['\"]|callFirebaseFunction\(['\"]([^'\"]+)['\"]" | \
    sed -E "s/.*['\"]([^'\"]+)['\"].*/\1/" | \
    sort -u)
  
  if [ -z "$FUNCTIONS" ]; then
    echo "- No function calls found" >> "$OUTPUT_FILE"
  else
    echo "$FUNCTIONS" | while read -r func; do
      echo "- \`$func\`" >> "$OUTPUT_FILE"
    done
  fi
  
  echo "" >> "$OUTPUT_FILE"
done

echo "✅ Function dependency matrix created: $OUTPUT_FILE"

