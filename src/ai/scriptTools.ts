import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { CoreGeminiService } from './CoreGeminiService';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

interface CreateScriptPackageRequest {
    title: string;
    concept: string;
    showId?: string;
    seasonId?: string;
    episodeId?: string;
    duration?: number;
    format?: '3-column-table' | 'screenplay';
    organizationId: string;
}

export const createScriptPackage = onCall(
    {
        secrets: [geminiApiKey],
        cors: true,
        region: 'us-central1',
        invoker: 'public',
        timeoutSeconds: 300,
        memory: '512MiB'
    },
    async (request) => {
        // 1. Authentication Check
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'User must be authenticated');
        }

        const userId = request.auth.uid;
        const data = request.data as CreateScriptPackageRequest;

        // Validation
        if (!data.title || !data.organizationId) {
            throw new HttpsError('invalid-argument', 'Title and Organization ID are required');
        }

        console.log(`🎬 [createScriptPackage] Creating package for "${data.title}" by user ${userId}`);

        const db = admin.firestore();

        try {
            // 2. Create Story Record
            const storyRef = await db.collection('stories').add({
                clipTitle: data.title,
                organizationId: data.organizationId,
                concept: data.concept,
                show: data.showId || null,
                season: data.seasonId || null,
                episode: data.episodeId || null,
                scriptContent: '', // Placeholder
                status: 'Draft',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                createdBy: userId,
                // Metadata for tracking origin
                createdVia: 'master-agent-mcp',
                format: data.format || '3-column-table',
                targetDuration: data.duration || 360
            });

            const storyId = storyRef.id;
            console.log(`✅ [createScriptPackage] Story created with ID: ${storyId}`);

            // 3. Generate Script Content (AI)
            const apiKey = geminiApiKey.value();
            const gemini = new CoreGeminiService(apiKey);

            const formatNote = data.format === '3-column-table'
                ? 'Use 3-column table format (TIME | SCENE/ACTION, CHARACTER/DIALOGUE, NOTES/MUSIC/GRAPHICS)'
                : 'Use traditional screenplay format';

            const durationSecs = data.duration || 360;
            const durationNote = `${durationSecs} seconds (${Math.floor(durationSecs / 60)} minutes)`;

            const conceptDescription = data.concept || `A ${data.title}`;

            // Enhanced prompt with more structure and guidance
            const systemPrompt = `You are an expert scriptwriter for TV production with deep knowledge of broadcast television formats, pacing, and production requirements. You create engaging, production-ready scripts that balance entertainment value with practical production constraints.`;

            const prompt = `Generate a complete ${durationNote} script for broadcast television.

**Title:** ${data.title}

**Concept:** ${conceptDescription}

**Format Requirements:**
${formatNote}

**Script Structure Guidelines:**
1. **Opening Hook (0-30 seconds)**: Grab viewer attention immediately
2. **Main Content (30 seconds - ${Math.floor(durationSecs - 30)} seconds)**: Develop the concept with clear scenes
3. **Closing (Last 30 seconds)**: Strong conclusion or call-to-action

**Production Considerations:**
- Each scene should be clearly defined with visual and audio elements
- Dialogue should be natural and conversational
- Include specific production notes for graphics, music cues, and transitions
- Ensure content fits exactly within ${durationNote} runtime
- Use timestamps every 15-30 seconds for pacing

**Output Format:**
${data.format === '3-column-table' 
  ? 'Use a 3-column table format:\n| TIME | VIDEO/SCENE | AUDIO/DIALOGUE | NOTES/MUSIC/GRAPHICS |\n\nEach row should represent a distinct moment in the script.'
  : 'Use traditional screenplay format with proper scene headings, action lines, and dialogue blocks.'}

Generate the complete script content. Return ONLY the script content, no additional commentary.`;

            console.log(`🧠 [createScriptPackage] Generating content via Gemini with enhanced prompt...`);

            let scriptContent = '';
            try {
                scriptContent = await gemini.generateText(prompt, systemPrompt);
            } catch (aiError: any) {
                console.error(`❌ [createScriptPackage] AI Generation failed: ${aiError.message}`);
                // Continue without content, user can retry generation separately or edit manually
                scriptContent = `(AI Generation Failed: ${aiError.message})\n\n[Please use AI Assistant to generate script content]`;
            }

            // 4. Update Story with Content
            await storyRef.update({
                scriptContent: scriptContent,
                status: scriptContent.length > 100 ? 'Generated' : 'Draft', // Only mark generated if we got content
                updatedAt: FieldValue.serverTimestamp()
            });

            console.log(`✅ [createScriptPackage] Script content updated for: ${storyId}`);

            return {
                success: true,
                storyId: storyId,
                title: data.title,
                scriptContent: scriptContent,
                message: "Script package created successfully."
            };

        } catch (error: any) {
            console.error("❌ [createScriptPackage] Fatal error:", error);
            throw new HttpsError('internal', `Failed to create script package: ${error.message}`);
        }
    }
);
