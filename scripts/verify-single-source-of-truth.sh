#!/bin/bash
# ============================================================================
# 🔍 VERIFY SINGLE SOURCE OF TRUTH FOR FIREBASE FUNCTIONS
# ============================================================================
# 
# This script verifies that all Firebase Functions are defined ONLY in
# shared-firebase-functions/ and not duplicated in other projects.
# 
# Usage: ./scripts/verify-single-source-of-truth.sh
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get repository root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FUNCTIONS_DIR="$REPO_ROOT/shared-firebase-functions"

print_status "Repository root: $REPO_ROOT"
print_status "Functions directory: $FUNCTIONS_DIR"

# ============================================================================
# STEP 1: Verify shared-firebase-functions structure
# ============================================================================
print_status ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 1: Verifying shared-firebase-functions structure"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -d "$FUNCTIONS_DIR" ]; then
    print_error "shared-firebase-functions directory not found!"
    exit 1
fi

if [ ! -f "$FUNCTIONS_DIR/src/index.ts" ]; then
    print_error "shared-firebase-functions/src/index.ts not found!"
    exit 1
fi

if [ ! -f "$FUNCTIONS_DIR/firebase.json" ]; then
    print_error "shared-firebase-functions/firebase.json not found!"
    exit 1
fi

print_success "shared-firebase-functions structure is valid"

# ============================================================================
# STEP 2: Check for duplicate function definitions in other projects
# ============================================================================
print_status ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 2: Checking for duplicate function definitions"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Patterns to search for that indicate Firebase Functions
FUNCTION_PATTERNS=(
    "onRequest"
    "onCall"
    "https.onRequest"
    "https.onCall"
    "functions.https.onRequest"
    "functions.https.onCall"
    "export const.*=.*onRequest"
    "export const.*=.*onCall"
)

DUPLICATES_FOUND=0

# Directories to exclude from search
EXCLUDE_DIRS=(
    "node_modules"
    ".git"
    "dist"
    "build"
    "lib"
    "shared-firebase-functions"
)

# Build find exclude arguments
FIND_EXCLUDE=""
for dir in "${EXCLUDE_DIRS[@]}"; do
    FIND_EXCLUDE="$FIND_EXCLUDE -not -path '*/$dir/*'"
done

# Search for function definitions in other projects
print_status "Searching for Firebase Function definitions outside shared-firebase-functions..."

for pattern in "${FUNCTION_PATTERNS[@]}"; do
    # Search in TypeScript files
    RESULTS=$(eval "find '$REPO_ROOT' -type f -name '*.ts' $FIND_EXCLUDE -exec grep -l '$pattern' {} \; 2>/dev/null | grep -v 'shared-firebase-functions' | grep -v 'node_modules' || true")
    
    if [ -n "$RESULTS" ]; then
        print_warning "Found potential function definitions matching '$pattern':"
        echo "$RESULTS" | while read -r file; do
            if [ -n "$file" ]; then
                print_warning "  - $file"
                ((DUPLICATES_FOUND++))
            fi
        done
    fi
done

# Search for firebase.json files with functions configuration
print_status "Checking for firebase.json files with functions configuration..."
FIREBASE_JSON_FILES=$(find "$REPO_ROOT" -name "firebase.json" -not -path "*/node_modules/*" -not -path "*/shared-firebase-functions/*" 2>/dev/null || true)

if [ -n "$FIREBASE_JSON_FILES" ]; then
    for json_file in $FIREBASE_JSON_FILES; do
        # Check if firebase.json contains functions configuration
        if grep -q '"functions"' "$json_file" 2>/dev/null; then
            print_warning "Found firebase.json with functions configuration: $json_file"
            print_warning "  This should only exist in shared-firebase-functions/"
            ((DUPLICATES_FOUND++))
        fi
    done
fi

if [ $DUPLICATES_FOUND -eq 0 ]; then
    print_success "No duplicate function definitions found"
else
    print_error "Found $DUPLICATES_FOUND potential duplicate function definitions"
    print_warning "All Firebase Functions should be defined ONLY in shared-firebase-functions/"
fi

# ============================================================================
# STEP 3: Verify function exports in index.ts
# ============================================================================
print_status ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 3: Verifying function exports in index.ts"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if grep -q "export.*from" "$FUNCTIONS_DIR/src/index.ts"; then
    EXPORT_COUNT=$(grep -c "export.*from" "$FUNCTIONS_DIR/src/index.ts" || echo "0")
    print_success "Found $EXPORT_COUNT export statements in index.ts"
else
    print_warning "No exports found in index.ts"
fi

# ============================================================================
# STEP 4: Verify deployed functions match source
# ============================================================================
print_status ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
print_status "STEP 4: Verifying deployed functions"
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v firebase &> /dev/null; then
    print_status "Checking deployed functions..."
    DEPLOYED_FUNCTIONS=$(firebase functions:list --project backbone-logic 2>/dev/null | grep -v "Function" | grep -v "─" | awk '{print $1}' | grep -v "^$" || true)
    
    if [ -n "$DEPLOYED_FUNCTIONS" ]; then
        DEPLOYED_COUNT=$(echo "$DEPLOYED_FUNCTIONS" | wc -l | tr -d ' ')
        print_success "Found $DEPLOYED_COUNT deployed functions"
    else
        print_warning "Could not retrieve deployed functions list"
    fi
else
    print_warning "Firebase CLI not found, skipping deployed functions check"
fi

# ============================================================================
# SUMMARY
# ============================================================================
print_status ""
print_status "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $DUPLICATES_FOUND -eq 0 ]; then
    print_success "✅ SINGLE SOURCE OF TRUTH VERIFIED"
    print_success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
else
    print_error "❌ SINGLE SOURCE OF TRUTH VIOLATION DETECTED"
    print_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_status ""
    print_status "Next steps:"
    print_status "  1. Review the warnings above"
    print_status "  2. Remove duplicate function definitions from other projects"
    print_status "  3. Ensure all functions are defined only in shared-firebase-functions/"
    print_status "  4. Run this script again to verify"
    exit 1
fi
