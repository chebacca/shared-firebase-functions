#!/bin/bash

# Deploy Accounting Approval System
# This script deploys all components needed for the accounting approval system

set -e

echo "🚀 Deploying Accounting Approval System..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}❌ Firebase CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Please run this script from the shared-firebase-functions directory${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Creating Firestore collections...${NC}"
node scripts/create-accounting-approval-collections.cjs
echo -e "${GREEN}✅ Collections created${NC}"
echo ""

echo -e "${YELLOW}Step 2: Deploying Firestore indexes...${NC}"
# Merge indexes if firestore.indexes.json exists
if [ -f "firestore.indexes.json" ]; then
    echo "Merging indexes..."
    # Note: You may need to manually merge firestore.indexes.accounting-approval.json into firestore.indexes.json
    echo -e "${YELLOW}⚠️  Please manually merge firestore.indexes.accounting-approval.json into firestore.indexes.json${NC}"
fi
firebase deploy --only firestore:indexes
echo -e "${GREEN}✅ Indexes deployed${NC}"
echo ""

echo -e "${YELLOW}Step 3: Deploying Firestore security rules...${NC}"
echo -e "${YELLOW}⚠️  Please ensure accounting approval rules are added to firestore.rules${NC}"
firebase deploy --only firestore:rules
echo -e "${GREEN}✅ Rules deployed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Deploying Firebase Functions...${NC}"
firebase deploy --only functions:getAccountingApprovalAlerts,functions:createAccountingApprovalAlert,functions:acknowledgeAccountingAlert,functions:resolveAccountingAlert,functions:checkManagerApprovalThreshold
echo -e "${GREEN}✅ Functions deployed${NC}"
echo ""

echo -e "${GREEN}✨ Accounting Approval System deployed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify functions are working: https://console.firebase.google.com/project/backbone-logic/functions"
echo "  2. Check Firestore collections: https://console.firebase.google.com/project/backbone-logic/firestore"
echo "  3. Test the system with sample data"
echo "  4. Configure manager thresholds in userDirectReports collection"
