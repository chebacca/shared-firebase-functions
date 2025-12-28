#!/bin/bash

# Firebase ML Services Setup Script
# This script sets up the necessary Google Cloud APIs and configurations for ML services

set -e

echo "🔥 Setting up Firebase ML Services..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install Google Cloud SDK first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No Google Cloud project set. Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Using project: $PROJECT_ID"

# Enable required APIs
echo "🔌 Enabling required APIs..."

gcloud services enable aiplatform.googleapis.com --project=$PROJECT_ID
echo "✅ Vertex AI API enabled"

gcloud services enable documentai.googleapis.com --project=$PROJECT_ID
echo "✅ Document AI API enabled"

gcloud services enable vision.googleapis.com --project=$PROJECT_ID
echo "✅ Vision API enabled"

gcloud services enable videointelligence.googleapis.com --project=$PROJECT_ID
echo "✅ Video Intelligence API enabled"

# Check if GEMINI_API_KEY secret exists
echo ""
echo "🔐 Checking secrets..."

if firebase functions:secrets:access GEMINI_API_KEY &> /dev/null; then
    echo "✅ GEMINI_API_KEY secret already exists"
else
    echo "⚠️  GEMINI_API_KEY secret not found"
    echo "   Set it with: firebase functions:secrets:set GEMINI_API_KEY"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd "$(dirname "$0")/../.."
pnpm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Set GEMINI_API_KEY secret: firebase functions:secrets:set GEMINI_API_KEY"
echo "   2. Create Document AI processor in Google Cloud Console"
echo "   3. Set DOCUMENT_AI_PROCESSOR_ID environment variable"
echo "   4. Build and deploy: pnpm build && firebase deploy --only functions"
echo ""
echo "📚 See src/ml/README.md for detailed setup instructions"

