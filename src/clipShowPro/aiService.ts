import { GeminiService } from '../ai/GeminiService';
import { getAIApiKey } from '../ai/utils/aiHelpers';

interface ScriptGenerationRequest {
  storyId: string;
  templateId?: string;
  organizationId: string;
  userId?: string;
  storyData: {
    clipTitle: string;
    show: string;
    season: string;
    researchNotes: string;
    producerNotes?: string;
    clearanceNotes?: string;
  };
}

interface ScriptTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

class AIService {
  private async getGemini(organizationId: string, userId?: string): Promise<GeminiService> {
    const keyData = await getAIApiKey(organizationId, 'gemini', userId);
    if (!keyData || !keyData.apiKey) {
      throw new Error('Gemini API key not configured for this organization');
    }
    return new GeminiService(keyData.apiKey);
  }

  async generateScript(request: ScriptGenerationRequest): Promise<string> {
    try {
      const { storyData, templateId, organizationId, userId } = request;
      const geminiSvc = await this.getGemini(organizationId, userId);

      let template: ScriptTemplate | null = null;
      if (templateId) {
        template = await this.getScriptTemplate(templateId);
      }

      const prompt = this.createScriptPrompt(storyData, template);
      const systemPrompt = "You are a professional script writer for television clip shows. Generate engaging, professional scripts based on the provided story information.";

      const generatedScript = await geminiSvc.generateText(prompt, systemPrompt);
      return this.postProcessScript(generatedScript, storyData);
    } catch (error) {
      console.error('Error generating script:', error);
      throw new Error('Failed to generate script');
    }
  }

  private createScriptPrompt(storyData: any, template: ScriptTemplate | null): string {
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

  private postProcessScript(script: string, storyData: any): string {
    const header = `SCRIPT: ${storyData.clipTitle}
SHOW: ${storyData.show}
SEASON: ${storyData.season}
GENERATED: ${new Date().toISOString()}

========================================

`;

    let processedScript = script
      .replace(/^\s*```.*$/gm, '')
      .replace(/^\s*---.*$/gm, '')
      .trim();

    return header + processedScript;
  }

  private async getScriptTemplate(templateId: string): Promise<ScriptTemplate | null> {
    try {
      return {
        id: templateId,
        name: 'Standard Clip Show Template',
        content: 'Use standard clip show format with introduction, context, and conclusion.',
        variables: ['clipTitle', 'show', 'season', 'researchNotes']
      };
    } catch (error) {
      console.error('Error fetching script template:', error);
      return null;
    }
  }

  async generateStoryIdeas(pitchData: any, organizationId: string, userId?: string): Promise<string[]> {
    try {
      const geminiSvc = await this.getGemini(organizationId, userId);
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

      const response = await geminiSvc.generateText(prompt, "You are a creative television producer. Generate engaging story ideas for clip shows.");

      const ideas = response
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(idea => idea.length > 10);

      return ideas.slice(0, 3);
    } catch (error) {
      console.error('Error generating story ideas:', error);
      return [];
    }
  }

  async analyzePitchContent(pitchData: any, organizationId: string, userId?: string): Promise<{
    sentiment: 'positive' | 'neutral' | 'negative';
    keywords: string[];
    suggestedCategories: string[];
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    try {
      const geminiSvc = await this.getGemini(organizationId, userId);
      const prompt = `
Analyze the following pitch content and provide insights:

**Pitch Information:**
- Title: ${pitchData.clipTitle}
- Research Notes: ${pitchData.researchNotes}
- Categories: ${pitchData.categories?.join(', ') || 'None'}

Please analyze:
1. Overall sentiment (positive, neutral, negative)
2. Key topics/keywords
3. Suggested content categories
4. Risk level for clearance (low, medium, high)

Respond in JSON format.
    `;

      const responseText = await geminiSvc.generateText(prompt, "You are a content analyst for television production. Analyze pitches for sentiment, keywords, and clearance risk. RETURN ONLY JSON.");

      try {
        let cleanedResponse = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const startIndex = cleanedResponse.indexOf('{');
        return JSON.parse(cleanedResponse.substring(startIndex));
      } catch (parseError) {
        return {
          sentiment: 'neutral',
          keywords: pitchData.categories || [],
          suggestedCategories: ['General'],
          riskLevel: 'medium'
        };
      }
    } catch (error) {
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

export const aiService = new AIService();
