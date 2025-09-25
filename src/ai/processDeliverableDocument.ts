/**
 * Process Deliverable Document Enhanced Function
 * 
 * AI-powered document processing for deliverables using Google Gemini
 */

import { onCall } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createSuccessResponse, handleError } from '../shared/utils';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const processDeliverableDocumentEnhanced = onCall(
  {
    memory: '2GiB',
    timeoutSeconds: 300,
    cors: true
  },
  async (request) => {
    try {
      const { data } = request;
      const { documentText, documentType, organizationId, userId } = data;

      if (!documentText) {
        throw new Error('Document text is required');
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      console.log(`🤖 [AI PROCESSING] Processing ${documentType} document for org: ${organizationId}`);

      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      // Create AI prompt based on document type
      const prompt = createProcessingPrompt(documentType, documentText);

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiResponse = response.text();

      // Parse AI response
      const processedData = parseAIResponse(aiResponse, documentType);

      console.log(`🤖 [AI PROCESSING] Document processing completed for org: ${organizationId}`);

      return createSuccessResponse({
        documentType,
        organizationId,
        userId,
        processedData,
        aiResponse,
        timestamp: new Date()
      }, 'Document processed successfully');

    } catch (error: any) {
      console.error('❌ [AI PROCESSING] Error:', error);
      return handleError(error, 'processDeliverableDocumentEnhanced');
    }
  }
);

function createProcessingPrompt(documentType: string, documentText: string): string {
  const basePrompt = `You are an AI assistant specialized in processing film and video production documents. 
  Analyze the following ${documentType} document and extract structured information.`;

  switch (documentType) {
    case 'deliverable_specification':
      return `${basePrompt}
      
      Extract the following information from this deliverable specification:
      - Deliverable name and type
      - Technical requirements
      - Format specifications
      - Quality standards
      - Delivery timeline
      - Special instructions
      
      Document text:
      ${documentText}
      
      Return the information in JSON format.`;

    case 'network_delivery_bible':
      return `${basePrompt}
      
      Extract the following information from this network delivery bible:
      - Show information (title, season, episode)
      - Technical specifications
      - Delivery requirements
      - File formats and naming conventions
      - Quality control requirements
      - Contact information
      
      Document text:
      ${documentText}
      
      Return the information in JSON format.`;

    case 'edl_file':
      return `${basePrompt}
      
      Extract the following information from this EDL file:
      - Event information
      - Source and record timecodes
      - Transition effects
      - Audio/video tracks
      - Comments and notes
      
      Document text:
      ${documentText}
      
      Return the information in JSON format.`;

    default:
      return `${basePrompt}
      
      Extract structured information from this document:
      - Key information
      - Important details
      - Technical specifications
      - Requirements
      
      Document text:
      ${documentText}
      
      Return the information in JSON format.`;
  }
}

function parseAIResponse(aiResponse: string, documentType: string): any {
  try {
    // Try to extract JSON from the AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // If no JSON found, return structured text
    return {
      rawResponse: aiResponse,
      documentType,
      processedAt: new Date(),
      status: 'processed'
    };
  } catch (error) {
    console.error('❌ [AI PROCESSING] Error parsing AI response:', error);
    return {
      rawResponse: aiResponse,
      documentType,
      processedAt: new Date(),
      status: 'parsed_as_text',
      error: 'Failed to parse JSON response'
    };
  }
}
