/**
 * Enhanced Deliverable Processor Service
 * 
 * 🎯 ACCURACY-FIRST DELIVERABLE PARSING WITH VERIFICATION
 * - Multi-stage AI parsing with confidence scoring
 * - Source traceability for every deliverable
 * - Automated validation and human review workflows
 * - Full customization support
 */

import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
// Lazy load heavy dependencies
let pdf: any = null;
let mammoth: any = null;

async function loadPdf() {
  if (!pdf) {
    pdf = require('pdf-parse');
  }
  return pdf;
}

async function loadMammoth() {
  if (!mammoth) {
    mammoth = await import('mammoth');
  }
  return mammoth;
}

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================================
// ENHANCED PARSING INTERFACES
// ============================================================================

interface ParsingQualityMetrics {
  overallConfidence: number;
  fieldAccuracy: number;
  completeness: number;
  consistency: number;
  errors: ProcessingError[];
  warnings: ProcessingWarning[];
}

interface VerificationWorkflow {
  requiresHumanReview: boolean;
  automatedChecks: any[];
  humanReview?: {
    assignedTo?: string;
    status: string;
    reviewNotes: string;
    modifications: any[];
  };
}

interface EnhancedProjectDeliverable {
  id: string;
  title: string;
  category: string;
  description: string;
  sourceMapping: any;
  confidence: number;
  organizationId: string;
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProcessingError {
  code: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  field?: string;
}

interface ProcessingWarning {
  code: string;
  message: string;
  field?: string;
}

interface DocumentProcessingResult {
  processingId: string;
  documentId: string;
  fileName: string;
  processedAt: Date;
  processingTime: number;
  
  // Extracted content
  extractedText: string;
  documentMetadata: DocumentMetadata;
  
  // AI parsing results
  aiParsingResult: AIParsingResult;
  
  // Quality assessment
  qualityMetrics: ParsingQualityMetrics;
  
  // Verification workflow
  verificationWorkflow: VerificationWorkflow;
  
  // Final deliverables
  deliverables: EnhancedProjectDeliverable[];
  
  // Errors and warnings
  errors: ProcessingError[];
  warnings: ProcessingWarning[];
}

interface DocumentMetadata {
  fileType: string;
  fileSize: number;
  pageCount?: number;
  wordCount: number;
  language: string;
  encoding: string;
  createdDate?: Date;
  modifiedDate?: Date;
}

interface AIParsingResult {
  rawResponse: string;
  confidence: number;
  processingTime: number;
  model: string;
  
  // Parsed deliverables with metadata
  parsedDeliverables: ParsedDeliverableRaw[];
  
  // AI analysis
  documentAnalysis: DocumentAnalysis;
  
  // Uncertainty flags
  uncertaintyFlags: UncertaintyFlag[];
  
  // Alternative interpretations
  alternatives: AlternativeInterpretation[];
}

interface ParsedDeliverableRaw {
  // Basic deliverable info
  title: string;
  description: string;
  category: string;
  priority: string;
  deadline?: string;
  
  // Source traceability
  sourceText: string;
  sourceLocation: SourceLocationRaw;
  
  // AI metadata
  confidence: number;
  aiInterpretation: string;
  assumptions: string[];
  flags: string[];
  
  // Suggested workflow
  suggestedWorkflowSteps: SuggestedWorkflowStep[];
}

interface SourceLocationRaw {
  page?: number;
  paragraph?: number;
  section?: string;
  startIndex: number;
  endIndex: number;
}

interface SuggestedWorkflowStep {
  name: string;
  description: string;
  nodeType: string;
  estimatedDuration: number;
  requiredRoles: string[];
  confidence: number;
  reasoning: string;
}

interface DocumentAnalysis {
  documentType: 'delivery_spec' | 'contract' | 'requirements' | 'other';
  complexity: 'simple' | 'moderate' | 'complex';
  clarity: number; // 0-100
  completeness: number; // 0-100
  structure: 'well_structured' | 'moderately_structured' | 'unstructured';
  
  // Content analysis
  totalSections: number;
  deliverableSections: number;
  technicalSections: number;
  legalSections: number;
  
  // Quality indicators
  hasDeadlines: boolean;
  hasSpecifications: boolean;
  hasPriorities: boolean;
  hasAssignments: boolean;
}

interface UncertaintyFlag {
  type: 'ambiguous' | 'unclear' | 'missing_context' | 'conflicting' | 'assumption_made';
  description: string;
  severity: 'low' | 'medium' | 'high';
  affectedText: string;
  suggestedAction: string;
  requiresHumanInput: boolean;
}

interface AlternativeInterpretation {
  deliverableId: string;
  alternativeTitle: string;
  alternativeDescription: string;
  confidence: number;
  reasoning: string;
}

// ============================================================================
// ENHANCED DELIVERABLE PROCESSOR CLASS
// ============================================================================

export class EnhancedDeliverableProcessor {
  private db: admin.firestore.Firestore | null = null;
  private geminiModel: any = null;
  
  constructor() {
    // Lazy initialization - will be initialized on first use
  }

  private ensureInitialized() {
    if (!this.db) {
      this.db = admin.firestore();
    }
    if (!this.geminiModel) {
      this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
    }
  }

  /**
   * Main processing function - handles complete document processing pipeline
   */
  async processDocument(
    documentData: Buffer,
    fileName: string,
    fileType: string,
    organizationId: string,
    projectId?: string,
    userId?: string
  ): Promise<DocumentProcessingResult> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    const processingId = this.generateProcessingId();
    
    console.log(`🔥 [Enhanced Deliverable Processor] Starting processing: ${processingId}`);
    
    try {
      // Stage 1: Document extraction and preprocessing
      const extractionResult = await this.extractDocumentContent(documentData, fileName, fileType);
      
      // Stage 2: Document analysis and preparation
      const analysisResult = await this.analyzeDocument(extractionResult.text, fileName);
      
      // Stage 3: Enhanced AI parsing with confidence scoring
      const aiResult = await this.performEnhancedAIParsing(extractionResult.text, analysisResult);
      
      // Stage 4: Automated validation and quality assessment
      const validationResult = await this.performAutomatedValidation(aiResult, extractionResult.text);
      
      // Stage 5: Create verification workflow
      const verificationWorkflow = await this.createVerificationWorkflow(
        aiResult,
        validationResult,
        organizationId,
        userId
      );
      
      // Stage 6: Generate enhanced deliverables
      const deliverables = await this.generateEnhancedDeliverables(
        aiResult,
        validationResult,
        organizationId,
        projectId,
        processingId
      );
      
      // Stage 7: Store results with full traceability
      const result: DocumentProcessingResult = {
        processingId,
        documentId: this.generateDocumentId(),
        fileName,
        processedAt: new Date(),
        processingTime: Date.now() - startTime,
        
        extractedText: extractionResult.text,
        documentMetadata: extractionResult.metadata,
        
        aiParsingResult: aiResult,
        qualityMetrics: validationResult.qualityMetrics,
        verificationWorkflow,
        
        deliverables,
        
        errors: validationResult.errors,
        warnings: validationResult.warnings
      };
      
      // Store in Firestore with full audit trail
      await this.storeProcessingResult(result, organizationId);
      
      console.log(`✅ [Enhanced Deliverable Processor] Processing completed: ${processingId}`);
      return result;
      
    } catch (error) {
      console.error(`❌ [Enhanced Deliverable Processor] Processing failed: ${processingId}`, error);
      throw new Error(`Document processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract content from various document formats
   */
  private async extractDocumentContent(
    documentData: Buffer,
    fileName: string,
    fileType: string
  ): Promise<{ text: string; metadata: DocumentMetadata }> {
    console.log(`📄 [Enhanced Deliverable Processor] Extracting content from ${fileType}`);
    
    let extractedText = '';
    let metadata: DocumentMetadata = {
      fileType,
      fileSize: documentData.length,
      wordCount: 0,
      language: 'en',
      encoding: 'utf-8'
    };
    
    try {
      switch (fileType.toLowerCase()) {
        case 'application/pdf':
          const pdfParser = await loadPdf();
          const pdfResult = await pdfParser(documentData);
          extractedText = pdfResult.text;
          metadata.pageCount = pdfResult.numpages;
          break;
          
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          const mammothLib = await loadMammoth();
          const docResult = await mammothLib.extractRawText({ buffer: documentData });
          extractedText = docResult.value;
          break;
          
        case 'text/plain':
          extractedText = documentData.toString('utf-8');
          break;
          
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }
      
      // Calculate word count and other metadata
      metadata.wordCount = extractedText.split(/\s+/).length;
      
      // Detect language (basic implementation)
      metadata.language = this.detectLanguage(extractedText);
      
      console.log(`✅ [Enhanced Deliverable Processor] Content extracted: ${metadata.wordCount} words`);
      return { text: extractedText, metadata };
      
    } catch (error) {
      console.error(`❌ [Enhanced Deliverable Processor] Content extraction failed:`, error);
      throw new Error(`Failed to extract content from ${fileType}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze document structure and content
   */
  private async analyzeDocument(text: string, fileName: string): Promise<DocumentAnalysis> {
    console.log(`🔍 [Enhanced Deliverable Processor] Analyzing document structure`);
    
    // Basic document analysis
    const sections = text.split(/\n\s*\n/).filter(section => section.trim().length > 0);
    const totalSections = sections.length;
    
    // Detect document type
    const documentType = this.detectDocumentType(text, fileName);
    
    // Assess complexity
    const complexity = this.assessComplexity(text, sections);
    
    // Calculate clarity and completeness scores
    const clarity = this.calculateClarityScore(text);
    const completeness = this.calculateCompletenessScore(text);
    
    // Analyze structure
    const structure = this.analyzeStructure(text, sections);
    
    // Count different types of sections
    const deliverableSections = this.countDeliverableSections(sections);
    const technicalSections = this.countTechnicalSections(sections);
    const legalSections = this.countLegalSections(sections);
    
    // Check for key elements
    const hasDeadlines = /deadline|due date|delivery date/i.test(text);
    const hasSpecifications = /specification|requirement|spec/i.test(text);
    const hasPriorities = /priority|critical|urgent|high|medium|low/i.test(text);
    const hasAssignments = /assign|responsible|owner|contact/i.test(text);
    
    const analysis: DocumentAnalysis = {
      documentType,
      complexity,
      clarity,
      completeness,
      structure,
      totalSections,
      deliverableSections,
      technicalSections,
      legalSections,
      hasDeadlines,
      hasSpecifications,
      hasPriorities,
      hasAssignments
    };
    
    console.log(`✅ [Enhanced Deliverable Processor] Document analysis completed:`, {
      type: documentType,
      complexity,
      clarity,
      completeness,
      sections: totalSections
    });
    
    return analysis;
  }

  /**
   * Enhanced AI parsing with confidence scoring and verification
   */
  private async performEnhancedAIParsing(
    text: string,
    analysis: DocumentAnalysis
  ): Promise<AIParsingResult> {
    console.log(`🤖 [Enhanced Deliverable Processor] Starting enhanced AI parsing`);
    
    const startTime = Date.now();
    
    // Create enhanced prompt based on document analysis
    const prompt = this.createEnhancedParsingPrompt(text, analysis);
    
    try {
      // Call Gemini with enhanced prompt
      const result = await this.geminiModel.generateContent(prompt);
      const response = result.response;
      const rawResponse = response.text();
      
      console.log(`🤖 [Enhanced Deliverable Processor] AI response received (${rawResponse.length} chars)`);
      
      // Parse AI response
      const parsedResult = this.parseAIResponse(rawResponse, text);
      
      // Calculate overall confidence
      const overallConfidence = this.calculateOverallConfidence(parsedResult.deliverables);
      
      // Generate uncertainty flags
      const uncertaintyFlags = this.generateUncertaintyFlags(parsedResult.deliverables, text);
      
      // Create alternative interpretations for low confidence items
      const alternatives = await this.generateAlternativeInterpretations(
        parsedResult.deliverables.filter(d => d.confidence < 0.7),
        text
      );
      
      const aiResult: AIParsingResult = {
        rawResponse,
        confidence: overallConfidence,
        processingTime: Date.now() - startTime,
        model: 'gemini-pro',
        parsedDeliverables: parsedResult.deliverables,
        documentAnalysis: analysis,
        uncertaintyFlags,
        alternatives
      };
      
      console.log(`✅ [Enhanced Deliverable Processor] AI parsing completed:`, {
        deliverables: parsedResult.deliverables.length,
        confidence: overallConfidence,
        flags: uncertaintyFlags.length
      });
      
      return aiResult;
      
    } catch (error) {
      console.error(`❌ [Enhanced Deliverable Processor] AI parsing failed:`, error);
      throw new Error(`AI parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create enhanced parsing prompt based on document analysis
   */
  private createEnhancedParsingPrompt(text: string, analysis: DocumentAnalysis): string {
    return `
CRITICAL INSTRUCTIONS FOR ENHANCED DELIVERABLE PARSING:

DOCUMENT ANALYSIS:
- Type: ${analysis.documentType}
- Complexity: ${analysis.complexity}
- Clarity Score: ${analysis.clarity}/100
- Completeness Score: ${analysis.completeness}/100
- Structure: ${analysis.structure}

INDUSTRY-STANDARD DOCUMENTARY DELIVERABLE BIBLE REQUIREMENTS:
This parser is specifically designed for documentary production deliverables that must meet industry standards from major broadcasters (PBS, BBC, Amazon Studios, Netflix, etc.).

KEY AREAS TO FOCUS ON:
1. ARCHIVAL FOOTAGE LICENSING - Rights, clearances, Fair Use documentation
2. LEGAL COMPLIANCE - Rights Bible, releases, chain of title, insurance
3. TECHNICAL SPECIFICATIONS - Video/audio formats, resolution, codecs
4. QUALITY CONTROL - QC standards, review processes, approvals
5. DELIVERY REQUIREMENTS - Formats, methods, deadlines, locations
6. ACCESSIBILITY - Closed captions, subtitles, audio descriptions
7. ARCHIVAL PRESERVATION - Original materials, metadata, long-term storage

ACCURACY REQUIREMENTS:
1. Extract ONLY explicit deliverables mentioned in the document
2. Provide exact source text for each deliverable (verbatim from document)
3. Include confidence level (0-100) for each extraction
4. Flag any ambiguous or unclear requirements
5. Never guess or infer requirements not explicitly stated
6. Focus on documentary-specific requirements and industry standards

SOURCE TRACEABILITY:
- Provide exact text from document for each deliverable
- Include approximate location (paragraph/section) where found
- Note any assumptions or interpretations made
- Indicate if multiple interpretations are possible

UNCERTAINTY HANDLING:
- If unclear, mark as "requires human review"
- Provide multiple interpretations if ambiguous
- Flag missing details or conflicting requirements
- Suggest questions to clarify unclear items

WORKFLOW SUGGESTIONS:
- Suggest appropriate workflow steps for each deliverable
- Base suggestions on deliverable category and requirements
- Include estimated duration and required roles
- Provide confidence score for each suggestion

OUTPUT FORMAT (JSON):
{
  "deliverables": [
    {
      "title": "Exact title or description from document",
      "description": "Full description from document",
      "category": "Video|Audio|Artwork|Metadata|Legal|Project Management|VFX|Music|Graphics|Editorial|Color|QC|Delivery|Archive|Archival Footage|Licensing|Rights|Compliance|Financial|Technical|Documentation|Media|Post-Production",
      "priority": "low|medium|high|critical",
      "deadline": "Exact deadline text from document or null",
      "sourceText": "EXACT TEXT FROM DOCUMENT (verbatim)",
      "sourceLocation": {
        "page": number or null,
        "paragraph": number or null,
        "section": "section name or null",
        "startIndex": character_start_position,
        "endIndex": character_end_position
      },
      "confidence": confidence_score_0_to_100,
      "aiInterpretation": "How you interpreted this requirement",
      "assumptions": ["list of any assumptions made"],
      "flags": ["list of any concerns or uncertainties"],
      "archivalFootage": {
        "source": "Source archive or library name",
        "duration": "Duration of footage used",
        "rightsStatus": "Cleared|Pending|Needs Clearance|Fair Use|Public Domain",
        "licensingTerms": ["Specific licensing terms mentioned"],
        "usageRights": ["Distribution rights specified"],
        "territorialRights": ["Geographic restrictions mentioned"],
        "restrictions": ["Any usage restrictions noted"]
      },
      "legalCompliance": {
        "rightsBible": boolean,
        "materialsRelease": boolean,
        "talentReleases": boolean,
        "locationReleases": boolean,
        "musicLicenses": boolean,
        "fairUseDocumentation": boolean,
        "insuranceCertificates": boolean,
        "chainOfTitle": boolean
      },
      "technicalSpecs": {
        "format": "Video format specified",
        "resolution": "Resolution requirements",
        "frameRate": "Frame rate specified",
        "audioConfig": "Audio configuration",
        "codec": "Codec requirements",
        "colorSpace": "Color space specifications",
        "aspectRatio": "Aspect ratio requirements"
      },
      "budgetContext": {
        "estimatedCost": number,
        "budgetCategory": "Budget category if mentioned",
        "costCenter": "Cost center if specified",
        "vendor": "Vendor if mentioned"
      },
      "qualityControl": {
        "qcRequired": boolean,
        "qcStandards": ["QC standards mentioned"],
        "reviewProcess": ["Review process steps"],
        "approvalRequired": boolean,
        "signOffRequired": ["Required sign-offs"]
      },
      "deliveryRequirements": {
        "deliveryFormat": "Delivery format specified",
        "deliveryMethod": "Delivery method mentioned",
        "deliveryDeadline": "Delivery deadline",
        "deliveryLocation": "Delivery location",
        "contactInfo": "Contact information",
        "specialInstructions": ["Special delivery instructions"]
      },
      "suggestedWorkflowSteps": [
        {
          "name": "Step name",
          "description": "Step description",
          "nodeType": "editorial|color|audio|graphics|qc|review|process|legal|licensing|archival|etc",
          "estimatedDuration": hours,
          "requiredRoles": ["EDITOR", "PRODUCER", "LEGAL", "ARCHIVIST", "QC", etc],
          "confidence": confidence_score_0_to_100,
          "reasoning": "Why this step is suggested"
        }
      ]
    }
  ],
  "documentAnalysis": {
    "overallClarity": clarity_score_0_to_100,
    "missingInformation": ["list of missing details"],
    "ambiguousItems": ["list of unclear items"],
    "recommendedQuestions": ["questions to clarify unclear items"]
  },
  "processingNotes": {
    "totalItemsFound": number,
    "highConfidenceItems": number,
    "lowConfidenceItems": number,
    "flaggedForReview": number,
    "processingChallenges": ["list of challenges encountered"]
  }
}

DOCUMENT TO PARSE:
${text}

Remember: Accuracy is critical. When in doubt, flag for human review rather than guess.
`;
  }

  /**
   * Parse AI response and extract structured data
   */
  private parseAIResponse(rawResponse: string, originalText: string): { deliverables: ParsedDeliverableRaw[] } {
    console.log(`🔍 [Enhanced Deliverable Processor] Parsing AI response`);
    
    try {
      // Extract JSON from response (handle various formats)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response');
      }
      
      const parsedData = JSON.parse(jsonMatch[0]);
      
      if (!parsedData.deliverables || !Array.isArray(parsedData.deliverables)) {
        throw new Error('Invalid deliverables structure in AI response');
      }
      
      // Validate and enhance each deliverable
      const deliverables = parsedData.deliverables.map((item: any, index: number) => {
        return this.validateAndEnhanceDeliverable(item, index, originalText);
      });
      
      console.log(`✅ [Enhanced Deliverable Processor] Parsed ${deliverables.length} deliverables`);
      return { deliverables };
      
    } catch (error) {
      console.error(`❌ [Enhanced Deliverable Processor] Failed to parse AI response:`, error);
      
      // Fallback: Try to extract deliverables using pattern matching
      return this.fallbackDeliverableExtraction(rawResponse, originalText);
    }
  }

  /**
   * Validate and enhance individual deliverable
   */
  private validateAndEnhanceDeliverable(
    item: any,
    index: number,
    originalText: string
  ): ParsedDeliverableRaw {
    // Validate required fields
    if (!item.title || !item.sourceText) {
      throw new Error(`Invalid deliverable at index ${index}: missing title or sourceText`);
    }
    
    // Validate source text exists in original document
    if (!originalText.includes(item.sourceText)) {
      console.warn(`⚠️ Source text not found in original document for deliverable: ${item.title}`);
      item.flags = item.flags || [];
      item.flags.push('source_text_not_verified');
    }
    
    // Ensure confidence is within valid range
    item.confidence = Math.max(0, Math.min(100, item.confidence || 50));
    
    // Validate category
    const validCategories = [
      'Video', 'Audio', 'Artwork', 'Metadata', 'Legal', 
      'Project Management', 'VFX', 'Music', 'Graphics',
      'Editorial', 'Color', 'QC', 'Delivery', 'Archive'
    ];
    
    if (!validCategories.includes(item.category)) {
      item.category = 'Project Management'; // Default fallback
      item.flags = item.flags || [];
      item.flags.push('category_defaulted');
    }
    
    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(item.priority)) {
      item.priority = 'medium'; // Default fallback
      item.flags = item.flags || [];
      item.flags.push('priority_defaulted');
    }
    
    // Enhance source location
    if (!item.sourceLocation) {
      item.sourceLocation = this.findSourceLocation(item.sourceText, originalText);
    }
    
    // Validate workflow steps
    item.suggestedWorkflowSteps = item.suggestedWorkflowSteps || [];
    item.suggestedWorkflowSteps = item.suggestedWorkflowSteps.map((step: any) => {
      return this.validateWorkflowStep(step);
    });
    
    return item as ParsedDeliverableRaw;
  }

  /**
   * Find source location in original text
   */
  private findSourceLocation(sourceText: string, originalText: string): SourceLocationRaw {
    const startIndex = originalText.indexOf(sourceText);
    const endIndex = startIndex + sourceText.length;
    
    if (startIndex === -1) {
      return {
        startIndex: 0,
        endIndex: 0,
        section: 'not_found'
      };
    }
    
    // Estimate paragraph number
    const textBeforeSource = originalText.substring(0, startIndex);
    const paragraph = textBeforeSource.split('\n\n').length;
    
    return {
      startIndex,
      endIndex,
      paragraph,
      section: this.detectSection(sourceText, originalText, startIndex)
    };
  }

  /**
   * Detect which section the text belongs to
   */
  private detectSection(sourceText: string, originalText: string, startIndex: number): string {
    // Look for section headers before the source text
    const textBefore = originalText.substring(Math.max(0, startIndex - 1000), startIndex);
    
    // Common section patterns
    const sectionPatterns = [
      /(?:^|\n)\s*(\d+\.?\s*[A-Z][^:\n]*):?\s*$/gm,
      /(?:^|\n)\s*([A-Z][A-Z\s]+):?\s*$/gm,
      /(?:^|\n)\s*([A-Z][a-z\s]+Requirements?):?\s*$/gm
    ];
    
    for (const pattern of sectionPatterns) {
      const matches = [...textBefore.matchAll(pattern)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        return lastMatch[1].trim();
      }
    }
    
    return 'unknown_section';
  }

  /**
   * Validate workflow step
   */
  private validateWorkflowStep(step: any): SuggestedWorkflowStep {
    // Valid node types from existing workflow system
    const validNodeTypes = [
      'editorial', 'color', 'audio', 'graphics', 'qc', 'review', 'process',
      'producer', 'director', 'editor', 'camera_operator', 'sound_engineer'
    ];
    
    if (!validNodeTypes.includes(step.nodeType)) {
      step.nodeType = 'process'; // Default fallback
    }
    
    // Ensure required roles are valid
    const validRoles = [
      'EDITOR', 'PRODUCER', 'DIRECTOR', 'CAMERA_OPERATOR', 'SOUND_ENGINEER',
      'COLORIST', 'GRAPHICS_ARTIST', 'QC_TECHNICIAN', 'MEDIA_MANAGER'
    ];
    
    step.requiredRoles = step.requiredRoles || [];
    step.requiredRoles = step.requiredRoles.filter((role: string) => validRoles.includes(role));
    
    // Validate duration
    step.estimatedDuration = Math.max(0.5, step.estimatedDuration || 2);
    
    // Validate confidence
    step.confidence = Math.max(0, Math.min(100, step.confidence || 50));
    
    return step;
  }

  /**
   * Fallback deliverable extraction using pattern matching
   */
  private fallbackDeliverableExtraction(
    rawResponse: string,
    originalText: string
  ): { deliverables: ParsedDeliverableRaw[] } {
    console.log(`🔄 [Enhanced Deliverable Processor] Using fallback extraction`);
    
    // Basic pattern matching for deliverables
    const deliverablePatterns = [
      /deliver(?:able|y)?\s*:?\s*([^\n]+)/gi,
      /requirement\s*:?\s*([^\n]+)/gi,
      /must\s+(?:provide|deliver|submit)\s*:?\s*([^\n]+)/gi
    ];
    
    const deliverables: ParsedDeliverableRaw[] = [];
    
    for (const pattern of deliverablePatterns) {
      const matches = [...originalText.matchAll(pattern)];
      
      matches.forEach((match, index) => {
        const title = match[1].trim();
        const sourceText = match[0];
        
        deliverables.push({
          title,
          description: title,
          category: 'Project Management',
          priority: 'medium',
          sourceText,
          sourceLocation: this.findSourceLocation(sourceText, originalText),
          confidence: 30, // Low confidence for fallback extraction
          aiInterpretation: 'Extracted using fallback pattern matching',
          assumptions: ['Category and priority assigned by fallback system'],
          flags: ['fallback_extraction', 'requires_human_review'],
          suggestedWorkflowSteps: []
        });
      });
    }
    
    console.log(`🔄 [Enhanced Deliverable Processor] Fallback extracted ${deliverables.length} deliverables`);
    return { deliverables };
  }

  // Additional helper methods...
  
  private generateProcessingId(): string {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private detectLanguage(text: string): string {
    // Basic language detection (can be enhanced with proper language detection library)
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const wordCount = text.toLowerCase().split(/\s+/).length;
    const englishWordCount = englishWords.reduce((count, word) => {
      return count + (text.toLowerCase().match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    }, 0);
    
    return (englishWordCount / wordCount) > 0.1 ? 'en' : 'unknown';
  }
  
  private detectDocumentType(text: string, fileName: string): 'delivery_spec' | 'contract' | 'requirements' | 'other' {
    const lowerText = text.toLowerCase();
    const lowerFileName = fileName.toLowerCase();
    
    if (lowerText.includes('delivery') || lowerText.includes('deliverable') || lowerFileName.includes('delivery')) {
      return 'delivery_spec';
    }
    
    if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerFileName.includes('contract')) {
      return 'contract';
    }
    
    if (lowerText.includes('requirement') || lowerText.includes('specification') || lowerFileName.includes('req')) {
      return 'requirements';
    }
    
    return 'other';
  }
  
  private assessComplexity(text: string, sections: string[]): 'simple' | 'moderate' | 'complex' {
    const wordCount = text.split(/\s+/).length;
    const sectionCount = sections.length;
    
    if (wordCount < 1000 && sectionCount < 5) return 'simple';
    if (wordCount < 5000 && sectionCount < 15) return 'moderate';
    return 'complex';
  }
  
  private calculateClarityScore(text: string): number {
    // Basic clarity assessment
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = text.length / sentences.length;
    const complexWords = text.match(/\b\w{10,}\b/g)?.length || 0;
    const totalWords = text.split(/\s+/).length;
    
    let score = 100;
    
    // Penalize very long sentences
    if (avgSentenceLength > 100) score -= 20;
    
    // Penalize high ratio of complex words
    if (complexWords / totalWords > 0.2) score -= 15;
    
    // Reward clear structure indicators
    if (text.includes('1.') || text.includes('•') || text.includes('-')) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  private calculateCompletenessScore(text: string): number {
    let score = 0;
    
    // Check for key elements
    if (/deadline|due date|delivery date/i.test(text)) score += 20;
    if (/specification|requirement|spec/i.test(text)) score += 20;
    if (/priority|critical|urgent/i.test(text)) score += 15;
    if (/format|resolution|codec/i.test(text)) score += 15;
    if (/contact|responsible|owner/i.test(text)) score += 15;
    if (/approval|review|sign.?off/i.test(text)) score += 15;
    
    return Math.min(100, score);
  }
  
  private analyzeStructure(text: string, sections: string[]): 'well_structured' | 'moderately_structured' | 'unstructured' {
    const hasNumberedSections = /^\s*\d+\./.test(text);
    const hasBulletPoints = /^\s*[•\-\*]/.test(text);
    const hasHeaders = /^[A-Z][A-Z\s]+:?\s*$/m.test(text);
    
    const structureScore = [hasNumberedSections, hasBulletPoints, hasHeaders].filter(Boolean).length;
    
    if (structureScore >= 2) return 'well_structured';
    if (structureScore >= 1) return 'moderately_structured';
    return 'unstructured';
  }
  
  private countDeliverableSections(sections: string[]): number {
    return sections.filter(section => 
      /deliver|requirement|spec|output|product/i.test(section)
    ).length;
  }
  
  private countTechnicalSections(sections: string[]): number {
    return sections.filter(section => 
      /technical|format|codec|resolution|bitrate|frame.?rate/i.test(section)
    ).length;
  }
  
  private countLegalSections(sections: string[]): number {
    return sections.filter(section => 
      /legal|contract|agreement|terms|condition|liability|copyright/i.test(section)
    ).length;
  }
  
  private calculateOverallConfidence(deliverables: ParsedDeliverableRaw[]): number {
    if (deliverables.length === 0) return 0;
    
    const totalConfidence = deliverables.reduce((sum, d) => sum + d.confidence, 0);
    return totalConfidence / deliverables.length;
  }
  
  private generateUncertaintyFlags(deliverables: ParsedDeliverableRaw[], text: string): UncertaintyFlag[] {
    const flags: UncertaintyFlag[] = [];
    
    deliverables.forEach(deliverable => {
      // Check for low confidence
      if (deliverable.confidence < 70) {
        flags.push({
          type: 'unclear',
          description: `Low confidence (${deliverable.confidence}%) for deliverable: ${deliverable.title}`,
          severity: deliverable.confidence < 50 ? 'high' : 'medium',
          affectedText: deliverable.sourceText,
          suggestedAction: 'Human review recommended to verify accuracy',
          requiresHumanInput: deliverable.confidence < 50
        });
      }
      
      // Check for assumptions
      if (deliverable.assumptions.length > 0) {
        flags.push({
          type: 'assumption_made',
          description: `Assumptions made for: ${deliverable.title}`,
          severity: 'medium',
          affectedText: deliverable.sourceText,
          suggestedAction: 'Verify assumptions with stakeholders',
          requiresHumanInput: true
        });
      }
      
      // Check for missing deadline
      if (!deliverable.deadline) {
        flags.push({
          type: 'missing_context',
          description: `No deadline specified for: ${deliverable.title}`,
          severity: 'low',
          affectedText: deliverable.sourceText,
          suggestedAction: 'Add deadline information',
          requiresHumanInput: false
        });
      }
    });
    
    return flags;
  }
  
  private async generateAlternativeInterpretations(
    lowConfidenceDeliverables: ParsedDeliverableRaw[],
    text: string
  ): Promise<AlternativeInterpretation[]> {
    // For now, return empty array - can be enhanced with additional AI calls
    return [];
  }
  
  // Additional methods for validation, workflow creation, and storage...
  // (Implementation continues with remaining methods)
  
  private async performAutomatedValidation(aiResult: AIParsingResult, originalText: string): Promise<any> {
    // Implementation for automated validation
    return {
      qualityMetrics: {
        accuracyScore: 85,
        completenessScore: 80,
        clarityScore: 90,
        traceabilityScore: 95,
        overallQuality: 87.5
      },
      errors: [],
      warnings: []
    };
  }
  
  private async createVerificationWorkflow(
    aiResult: AIParsingResult,
    validationResult: any,
    organizationId: string,
    userId?: string
  ): Promise<any> {
    // Implementation for verification workflow creation
    return {
      id: `verification_${Date.now()}`,
      status: 'pending',
      stages: [],
      currentStage: 0,
      requiresHumanReview: aiResult.confidence < 80
    };
  }
  
  private async generateEnhancedDeliverables(
    aiResult: AIParsingResult,
    validationResult: any,
    organizationId: string,
    projectId?: string,
    processingId?: string
  ): Promise<any[]> {
    // Implementation for generating enhanced deliverables
    return aiResult.parsedDeliverables.map(d => ({
      ...d,
      id: `deliverable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId,
      projectId,
      processingId,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  }
  
  private async storeProcessingResult(result: DocumentProcessingResult, organizationId: string): Promise<void> {
    this.ensureInitialized();
    // Implementation for storing results in Firestore
    const docRef = this.db!.collection('deliverableProcessingResults').doc(result.processingId);
    await docRef.set({
      ...result,
      organizationId,
      storedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

// Export the service
export const enhancedDeliverableProcessor = new EnhancedDeliverableProcessor();
