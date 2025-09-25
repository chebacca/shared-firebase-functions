/**
 * Verify Deliverable Accuracy Function
 * 
 * AI-powered verification of deliverable accuracy and compliance
 */

import { onCall } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSuccessResponse, handleError } from '../shared/utils';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const verifyDeliverableAccuracy = onCall(
  {
    memory: '2GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (request) => {
    try {
      const { data } = request;
      const { deliverableData, specifications, organizationId, userId } = data;

      if (!deliverableData) {
        throw new Error('Deliverable data is required');
      }

      if (!specifications) {
        throw new Error('Specifications are required');
      }

      console.log(`🔍 [AI VERIFICATION] Verifying deliverable accuracy for org: ${organizationId}`);

      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      // Create verification prompt
      const prompt = createVerificationPrompt(deliverableData, specifications);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiResponse = response.text();

      // Parse verification results
      const verificationResults = parseVerificationResponse(aiResponse);

      console.log(`🔍 [AI VERIFICATION] Verification completed for org: ${organizationId}`);

      return createSuccessResponse({
        organizationId,
        userId,
        verificationResults,
        aiResponse,
        timestamp: new Date()
      }, 'Deliverable verification completed successfully');

    } catch (error: any) {
      console.error('❌ [AI VERIFICATION] Error:', error);
      return handleError(error, 'verifyDeliverableAccuracy');
    }
  }
);

function createVerificationPrompt(deliverableData: any, specifications: any): string {
  return `You are an AI assistant specialized in verifying film and video production deliverables.
  
  Please verify the following deliverable against the provided specifications:
  
  DELIVERABLE DATA:
  ${JSON.stringify(deliverableData, null, 2)}
  
  SPECIFICATIONS:
  ${JSON.stringify(specifications, null, 2)}
  
  Please check for:
  1. Format compliance (video format, resolution, frame rate, etc.)
  2. Technical specifications (codec, bitrate, audio channels, etc.)
  3. Naming conventions
  4. Quality standards
  5. Delivery requirements
  6. Any missing elements or discrepancies
  
  Return your analysis in the following JSON format:
  {
    "overallCompliance": "PASS" | "FAIL" | "PARTIAL",
    "complianceScore": 0-100,
    "issues": [
      {
        "type": "error" | "warning" | "info",
        "category": "format" | "technical" | "naming" | "quality" | "delivery",
        "message": "Description of the issue",
        "severity": "high" | "medium" | "low",
        "suggestion": "How to fix the issue"
      }
    ],
    "compliantAspects": [
      "List of aspects that are compliant"
    ],
    "recommendations": [
      "List of recommendations for improvement"
    ],
    "summary": "Overall summary of the verification"
  }`;
}

function parseVerificationResponse(aiResponse: string): any {
  try {
    // Try to extract JSON from the AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Ensure required fields exist
      return {
        overallCompliance: parsed.overallCompliance || 'UNKNOWN',
        complianceScore: parsed.complianceScore || 0,
        issues: parsed.issues || [],
        compliantAspects: parsed.compliantAspects || [],
        recommendations: parsed.recommendations || [],
        summary: parsed.summary || 'No summary provided',
        rawResponse: aiResponse,
        processedAt: new Date()
      };
    }
    
    // If no JSON found, return basic structure
    return {
      overallCompliance: 'UNKNOWN',
      complianceScore: 0,
      issues: [],
      compliantAspects: [],
      recommendations: [],
      summary: 'Failed to parse verification results',
      rawResponse: aiResponse,
      processedAt: new Date(),
      error: 'Failed to parse JSON response'
    };
  } catch (error) {
    console.error('❌ [AI VERIFICATION] Error parsing verification response:', error);
    return {
      overallCompliance: 'ERROR',
      complianceScore: 0,
      issues: [{
        type: 'error',
        category: 'system',
        message: 'Failed to parse AI verification response',
        severity: 'high',
        suggestion: 'Please try again or contact support'
      }],
      compliantAspects: [],
      recommendations: [],
      summary: 'System error during verification',
      rawResponse: aiResponse,
      processedAt: new Date(),
      error: (error as Error).message
    };
  }
}
