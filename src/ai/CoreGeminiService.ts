/**
 * Core Gemini AI Service
 * 
 * Base functionality for Gemini API interactions:
 * - Basic content generation
 * - Transcription
 * - Document parsing
 * - Embeddings
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import axios from 'axios';

export interface TranscriptionResult {
    text: string;
    timestamps?: Array<{ start: number; end: number; text: string }>;
}

export interface NetworkBibleResult {
    deliverables: Array<{
        deliverableName: string;
        category: string;
        deadline: string;
        specifications: string[];
        priority: string;
        notes: string;
        sourceText: string;
    }>;
}

export class CoreGeminiService {
    protected genAI: GoogleGenerativeAI;
    protected model: GenerativeModel;
    protected apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    /**
     * Basic text generation
     */
    async generateText(prompt: string, systemInstruction?: string): Promise<string> {
        let modelToUse = this.model;
        if (systemInstruction) {
            modelToUse = this.genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: systemInstruction
            });
        }
        const result = await modelToUse.generateContent(prompt);
        return result.response.text();
    }

    /**
     * Transcribe media using Gemini
     */
    async transcribeMedia(
        audioData: string, // Base64
        mimeType: string,
        fileName: string = 'media',
        modelName: string = 'gemini-2.5-flash'
    ): Promise<TranscriptionResult> {
        console.log(`🎙️ [Gemini Service] Transcribing ${mimeType} (${fileName})...`);

        const buffer = Buffer.from(audioData, 'base64');
        const useFileUpload = buffer.length > 1 * 1024 * 1024; // 1MB

        const geminiModel = this.genAI.getGenerativeModel({ model: modelName });

        if (useFileUpload) {
            const fileUri = await this.uploadFileToGemini(buffer, mimeType, fileName);

            const result = await geminiModel.generateContent([
                {
                    fileData: { mimeType, fileUri },
                },
                {
                    text: 'Please transcribe this audio/video and provide a detailed transcript. Format the response as a clear transcript.',
                },
            ]);

            // Cleanup
            try {
                await axios.delete(`https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${this.apiKey}`);
            } catch (e) {
                console.warn('⚠️ [Gemini Service] Cleanup failed:', e);
            }

            const response = await result.response;
            return { text: response.text() };
        } else {
            const result = await geminiModel.generateContent([
                {
                    inlineData: { data: audioData, mimeType },
                },
                {
                    text: 'Please transcribe this audio/video and provide a detailed transcript. Format the response as a clear transcript.',
                },
            ]);
            const response = await result.response;
            return { text: response.text() };
        }
    }

    /**
     * Parse Network Delivery Bible
     */
    async parseNetworkBible(rawText: string): Promise<NetworkBibleResult> {
        console.log('📄 [Gemini Service] Parsing Network Delivery Bible...');

        const prompt = `
You are an expert document analyzer. Parse this delivery specification document and extract EVERY deliverable requirement.
Return ONLY a JSON object with this structure:
{
  "deliverables": [
    {
      "deliverableName": "Descriptive title",
      "category": "Category",
      "deadline": "Timing context",
      "specifications": ["List of requirements"],
      "priority": "high/medium/low",
      "notes": "Extra context",
      "sourceText": "Original text snippet"
    }
  ]
}

Document:
---
${rawText}
---
`;

        const result = await this.model.generateContent(prompt);
        const responseText = result.response.text();

        let cleanedResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const startIndex = cleanedResponse.indexOf('{');
        return JSON.parse(cleanedResponse.substring(startIndex)) as NetworkBibleResult;
    }

    /**
     * Generate Embedding
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const embeddingModel = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    }

    /**
     * Internal helper for Gemini File API
     */
    private async uploadFileToGemini(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
        const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${this.apiKey}`;

        const boundary = '-------' + Math.random().toString(36).substring(2);
        const header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ file: { displayName: fileName } })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
        const footer = `\r\n--${boundary}--`;

        const body = Buffer.concat([
            Buffer.from(header),
            buffer,
            Buffer.from(footer)
        ]);

        const response = await axios.post(uploadUrl, body, {
            headers: {
                'X-Goog-Upload-Protocol': 'multipart',
                'Content-Type': `multipart/related; boundary=${boundary}`
            }
        });

        const file = response.data.file;
        const fileUri = `files/${file.name}`;

        let attempts = 0;
        while (attempts < 60) {
            const statusResponse = await axios.get(`https://generativelanguage.googleapis.com/v1beta/${fileUri}?key=${this.apiKey}`);
            if (statusResponse.data.state === 'ACTIVE') return fileUri;
            if (statusResponse.data.state === 'FAILED') throw new Error('File processing failed');
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
        throw new Error('File processing timeout');
    }
}
