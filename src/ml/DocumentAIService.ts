/**
 * Document AI Service
 * 
 * Provides document parsing and extraction capabilities using Google Cloud Document AI.
 * Handles network delivery bibles, budgets, scripts, and other structured documents.
 */

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { getStorage } from 'firebase-admin/storage';
import { config } from 'firebase-functions';

export interface NetworkBibleData {
  technicalSpecs: {
    videoFormat?: string;
    audioFormat?: string;
    resolution?: string;
    frameRate?: string;
    colorSpace?: string;
    [key: string]: any;
  };
  fileFormats: string[];
  deliveryDeadlines: Array<{
    type: string;
    date: string;
    description?: string;
  }>;
  qualityStandards: {
    [key: string]: string;
  };
  metadataRequirements: {
    [key: string]: string;
  };
  rawText?: string;
}

export interface BudgetData {
  lineItems: Array<{
    description: string;
    amount: number;
    category?: string;
    accountCode?: string;
  }>;
  total: number;
  subtotals?: {
    [category: string]: number;
  };
  categories: string[];
  metadata: {
    period?: string;
    projectName?: string;
    [key: string]: any;
  };
  rawText?: string;
}

export interface ScriptData {
  scenes: Array<{
    number: string;
    description: string;
    location?: string;
    timeOfDay?: string;
    characters?: string[];
  }>;
  characters: Array<{
    name: string;
    description?: string;
    appearances?: number;
  }>;
  locations: Array<{
    name: string;
    description?: string;
    appearances?: number;
  }>;
  props: string[];
  wardrobe: string[];
  rawText?: string;
}

export class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private projectId: string;
  private location: string;
  private processorId: string | null = null;

  constructor() {
    this.client = new DocumentProcessorServiceClient();
    this.projectId = process.env.GCLOUD_PROJECT || '';
    this.location = process.env.DOCUMENT_AI_LOCATION || config().documentai?.location || 'us';
    this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID || config().documentai?.processor_id || null;
  }

  /**
   * Parse network delivery bible PDF
   */
  async parseNetworkBible(pdfUrl: string): Promise<NetworkBibleData> {
    try {
      // Download PDF from URL
      const pdfBuffer = await this.downloadFile(pdfUrl);

      // Process with Document AI
      const result = await this.processDocument(pdfBuffer);

      // Extract structured data
      return this.extractNetworkBibleData(result);
    } catch (error) {
      console.error('Error parsing network bible:', error);
      throw new Error(`Failed to parse network bible: ${error}`);
    }
  }

  /**
   * Extract budget data from PDF
   */
  async extractBudgetData(pdfUrl: string): Promise<BudgetData> {
    try {
      // Download PDF
      const pdfBuffer = await this.downloadFile(pdfUrl);

      // Process with Document AI
      const result = await this.processDocument(pdfBuffer);

      // Extract budget data
      return this.extractBudgetDataFromResult(result);
    } catch (error) {
      console.error('Error extracting budget data:', error);
      throw new Error(`Failed to extract budget data: ${error}`);
    }
  }

  /**
   * Parse script PDF
   */
  async parseScript(pdfUrl: string): Promise<ScriptData> {
    try {
      // Download PDF
      const pdfBuffer = await this.downloadFile(pdfUrl);

      // Process with Document AI
      const result = await this.processDocument(pdfBuffer);

      // Extract script data
      return this.extractScriptData(result);
    } catch (error) {
      console.error('Error parsing script:', error);
      throw new Error(`Failed to parse script: ${error}`);
    }
  }

  /**
   * Process document with Document AI
   */
  private async processDocument(
    pdfBuffer: Buffer
  ): Promise<any> {
    if (!this.processorId) {
      throw new Error('Document AI processor ID not configured');
    }

    const name = `projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}`;

    const request = {
      name,
      rawDocument: {
        content: pdfBuffer,
        mimeType: 'application/pdf'
      }
    };

    const [result] = await this.client.processDocument(request);
    return result;
  }

  /**
   * Download file from URL (Firebase Storage or HTTP)
   */
  private async downloadFile(url: string): Promise<Buffer> {
    // Check if it's a Firebase Storage URL
    if (url.includes('firebasestorage.googleapis.com') || url.includes('firebase.storage')) {
      return this.downloadFromFirebaseStorage(url);
    }

    // Otherwise, download from HTTP
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Download file from Firebase Storage
   */
  private async downloadFromFirebaseStorage(url: string): Promise<Buffer> {
    try {
      const bucket = getStorage().bucket();
      
      // Extract file path from URL
      const urlParts = url.split('/');
      const filePath = urlParts.slice(urlParts.indexOf('o') + 1).join('/').split('?')[0];
      
      const file = bucket.file(decodeURIComponent(filePath));
      const [buffer] = await file.download();
      
      return buffer;
    } catch (error) {
      console.error('Error downloading from Firebase Storage:', error);
      throw error;
    }
  }

  /**
   * Extract network bible data from Document AI result
   */
  private extractNetworkBibleData(result: any): NetworkBibleData {
    const text = result.document?.text || '';
    
    // Basic extraction - this would be enhanced with specific Document AI processors
    const data: NetworkBibleData = {
      technicalSpecs: {},
      fileFormats: [],
      deliveryDeadlines: [],
      qualityStandards: {},
      metadataRequirements: {},
      rawText: text
    };

    // Extract technical specs (example patterns)
    const videoFormatMatch = text.match(/video\s+format[:\s]+([^\n]+)/i);
    if (videoFormatMatch) {
      data.technicalSpecs.videoFormat = videoFormatMatch[1].trim();
    }

    const resolutionMatch = text.match(/resolution[:\s]+([^\n]+)/i);
    if (resolutionMatch) {
      data.technicalSpecs.resolution = resolutionMatch[1].trim();
    }

    // Extract file formats
    const formatMatches = text.match(/(?:format|file\s+type)[:\s]+([^\n]+)/gi);
    if (formatMatches) {
      formatMatches.forEach((match: string) => {
        const formats = match.split(/[,\s]+/).filter((f: string) => f.length > 0);
        data.fileFormats.push(...formats);
      });
    }

    // This is a basic implementation
    // In production, you would use Document AI form parsers or custom processors
    // to extract structured data more accurately

    return data;
  }

  /**
   * Extract budget data from Document AI result
   */
  private extractBudgetDataFromResult(result: any): BudgetData {
    const text = result.document?.text || '';
    
    const data: BudgetData = {
      lineItems: [],
      total: 0,
      categories: [],
      metadata: {},
      rawText: text
    };

    // Extract line items (basic pattern matching)
    // In production, use Document AI form parser for better accuracy
    const lineItemPattern = /(\$?[\d,]+\.?\d*)\s+([^\n]+)/g;
    let match;
    const seenDescriptions = new Set<string>();

    while ((match = lineItemPattern.exec(text)) !== null) {
      const amount = parseFloat(match[1].replace(/[$,]/g, ''));
      const description = match[2].trim();

      if (!isNaN(amount) && description && !seenDescriptions.has(description)) {
        data.lineItems.push({
          description,
          amount
        });
        seenDescriptions.add(description);
      }
    }

    // Calculate total
    data.total = data.lineItems.reduce((sum, item) => sum + item.amount, 0);

    return data;
  }

  /**
   * Extract script data from Document AI result
   */
  private extractScriptData(result: any): ScriptData {
    const text = result.document?.text || '';
    
    const data: ScriptData = {
      scenes: [],
      characters: [],
      locations: [],
      props: [],
      wardrobe: [],
      rawText: text
    };

    // Extract scenes (basic pattern - would be enhanced with custom processor)
    const scenePattern = /(?:SCENE|INT\.|EXT\.)\s*(\d+)[:\s]+([^\n]+)/gi;
    let match;

    while ((match = scenePattern.exec(text)) !== null) {
      data.scenes.push({
        number: match[1],
        description: match[2].trim()
      });
    }

    // Extract characters (basic - would be enhanced)
    const characterPattern = /^([A-Z][A-Z\s]+)$/gm;
    const characterMatches = text.match(characterPattern) as string[] | null;
    if (characterMatches) {
      const uniqueCharacters = [...new Set(characterMatches)];
      data.characters = uniqueCharacters.map(name => ({
        name: name.trim(),
        appearances: (text.match(new RegExp(name, 'gi')) || []).length
      }));
    }

    // This is a basic implementation
    // In production, use custom Document AI processors trained on script formats

    return data;
  }
}

// Export singleton instance
export function getDocumentAIService(): DocumentAIService {
  return new DocumentAIService();
}

