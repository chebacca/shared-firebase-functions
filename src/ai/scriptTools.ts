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

            const durationSecs = data.duration || 360;
            const durationNote = `${durationSecs} seconds (${Math.floor(durationSecs / 60)} minutes)`;

            const conceptDescription = data.concept || `A ${data.title}`;

            // Enhanced prompt with more structure and guidance
            const systemPrompt = `You are an expert scriptwriter for TV production. You MUST output your response in raw HTML format. 
Do NOT use markdown (no \`\`\`), no conversational filler, no headers outside the script.
ONLY return the script content itself as HTML.`;

            const prompt = `Generate a complete ${durationNote} script for:
Title: ${data.title}
Concept: ${conceptDescription}

**CRITICAL FORMAT REQUIREMENT:**
${data.format === '3-column-table'
                    ? `Produce a 3-column script using a standard HTML <table> structure.
The table MUST HAVE:
1. A <thead> row with 3 <th> columns: "TIME | SCENE / ACTION", "CHARACTER | DIALOGUE", "NOTES / MUSIC / GRAPHICS".
2. Multiple <tr> rows in <tbody>, each with 3 <td> columns.
3. INLINE STYLES: Add style="border: 1px solid #ccc; padding: 8px; vertical-align: top;" to all <td> and <th> elements.
4. TIMING: The first column of each row MUST start with the timestamp (e.g., 0:00, 0:15).

Return ONLY the <table> block.`
                    : `Produce a standard screenplay. Use <p> tags for all lines. 
- Use <strong> for Scene Headings (e.g. <strong>EXT. LOCATION - DAY</strong>).
- Use <p style="text-align: center;"> for Character Names.
- Use <p> for Dialogue and Action.

Return ONLY the HTML content.`}

Return ONLY the raw HTML. No explanation, no markdown tags.`;

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
