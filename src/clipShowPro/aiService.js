"use strict";
/**
 * AI Service Utility
 * Handles AI integrations for Clip Show Pro
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = void 0;
const openai_1 = __importDefault(require("openai"));
class AIService {
    constructor() {
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key'
        });
    }
    async generateScript(request) {
        var _a, _b;
        try {
            const { storyData, templateId } = request;
            // Get script template if provided
            let template = null;
            if (templateId) {
                template = await this.getScriptTemplate(templateId);
            }
            // Create prompt for AI script generation
            const prompt = this.createScriptPrompt(storyData, template);
            // Generate script using OpenAI
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are a professional script writer for television clip shows. Generate engaging, professional scripts based on the provided story information."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.7
            });
            const generatedScript = ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
            // Post-process the script
            return this.postProcessScript(generatedScript, storyData);
        }
        catch (error) {
            console.error('Error generating script:', error);
            throw new Error('Failed to generate script');
        }
    }
    createScriptPrompt(storyData, template) {
        const basePrompt = `
Generate a professional television script for the following clip:

**Clip Information:**
- Title: ${storyData.clipTitle}
- Show: ${storyData.show}
- Season: ${storyData.season}
- Research Notes: ${storyData.researchNotes}
${storyData.producerNotes ? `- Producer Notes: ${storyData.producerNotes}` : ''}
${storyData.clearanceNotes ? `- Clearance Notes: ${storyData.clearanceNotes}` : ''}

**Script Requirements:**
1. Create an engaging introduction that hooks the audience
2. Provide clear context about the clip
3. Include smooth transitions
4. End with a compelling conclusion
5. Use professional television script format
6. Keep the tone appropriate for the show's style
7. Include timing cues where appropriate

${template ? `**Template Guidelines:**\n${template.content}` : ''}

Please generate a complete script that follows standard television formatting conventions.
    `;
        return basePrompt.trim();
    }
    postProcessScript(script, storyData) {
        // Add metadata header
        const header = `SCRIPT: ${storyData.clipTitle}
SHOW: ${storyData.show}
SEASON: ${storyData.season}
GENERATED: ${new Date().toISOString()}

========================================

`;
        // Clean up the script
        let processedScript = script
            .replace(/^\s*```.*$/gm, '') // Remove markdown code blocks
            .replace(/^\s*---.*$/gm, '') // Remove markdown separators
            .trim();
        return header + processedScript;
    }
    async getScriptTemplate(templateId) {
        try {
            // This would typically fetch from Firestore
            // For now, return a default template
            return {
                id: templateId,
                name: 'Standard Clip Show Template',
                content: 'Use standard clip show format with introduction, context, and conclusion.',
                variables: ['clipTitle', 'show', 'season', 'researchNotes']
            };
        }
        catch (error) {
            console.error('Error fetching script template:', error);
            return null;
        }
    }
    async generateStoryIdeas(pitchData) {
        var _a, _b;
        try {
            const prompt = `
Based on the following pitch information, generate 3 creative story ideas:

**Pitch Information:**
- Title: ${pitchData.clipTitle}
- Show: ${pitchData.show}
- Season: ${pitchData.season}
- Research Notes: ${pitchData.researchNotes}

Generate creative story angles that would work well for television production.
Each idea should be 2-3 sentences and focus on different aspects of the content.
    `;
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are a creative television producer. Generate engaging story ideas for clip shows."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.8
            });
            const response = ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
            // Parse the response into individual ideas
            const ideas = response
                .split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => line.replace(/^\d+\.\s*/, '').trim())
                .filter(idea => idea.length > 10);
            return ideas.slice(0, 3); // Return top 3 ideas
        }
        catch (error) {
            console.error('Error generating story ideas:', error);
            return [];
        }
    }
    async analyzePitchContent(pitchData) {
        var _a, _b, _c;
        try {
            const prompt = `
Analyze the following pitch content and provide insights:

**Pitch Information:**
- Title: ${pitchData.clipTitle}
- Research Notes: ${pitchData.researchNotes}
- Categories: ${((_a = pitchData.categories) === null || _a === void 0 ? void 0 : _a.join(', ')) || 'None'}

Please analyze:
1. Overall sentiment (positive, neutral, negative)
2. Key topics/keywords
3. Suggested content categories
4. Risk level for clearance (low, medium, high)

Respond in JSON format.
    `;
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are a content analyst for television production. Analyze pitches for sentiment, keywords, and clearance risk."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.3
            });
            const response = ((_c = (_b = completion.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
            try {
                return JSON.parse(response);
            }
            catch (parseError) {
                // Fallback if JSON parsing fails
                return {
                    sentiment: 'neutral',
                    keywords: pitchData.categories || [],
                    suggestedCategories: ['General'],
                    riskLevel: 'medium'
                };
            }
        }
        catch (error) {
            console.error('Error analyzing pitch content:', error);
            return {
                sentiment: 'neutral',
                keywords: [],
                suggestedCategories: ['General'],
                riskLevel: 'medium'
            };
        }
    }
}
exports.aiService = new AIService();
