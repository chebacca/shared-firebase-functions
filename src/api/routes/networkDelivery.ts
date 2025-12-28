import express from 'express';
import { db, getUserOrganizationId } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';
import { GeminiService } from '../../ai/GeminiService';
import { FieldValue } from 'firebase-admin/firestore';
import { getAIApiKey } from '../../ai/utils/aiHelpers';
// Lazy load heavy dependencies
let pdf: any = null;
let mammoth: any = null;

async function loadPdf() {
    if (!pdf) {
        // pdf-parse is a CommonJS module that exports a function directly
        const pdfModule = require('pdf-parse');
        
        console.log('🔍 [ND BOT] pdf-parse module:', {
            type: typeof pdfModule,
            keys: pdfModule ? Object.keys(pdfModule) : 'null',
            hasDefault: !!pdfModule?.default,
            defaultType: pdfModule?.default ? typeof pdfModule.default : 'none'
        });
        
        // Handle common export patterns: direct function or default export
        if (typeof pdfModule === 'function') {
            pdf = pdfModule;
        } else if (pdfModule?.default && typeof pdfModule.default === 'function') {
            pdf = pdfModule.default;
        } 
        // pdf-parse v2.x exports an object with the function as a property
        else if (pdfModule && typeof pdfModule === 'object') {
            // Try to find the actual function - it might be the module itself if it's callable
            const possibleFunction = pdfModule.default || pdfModule.pdfParse || pdfModule;
            if (typeof possibleFunction === 'function') {
                pdf = possibleFunction;
            } else {
                // Last resort: if the object has a call method, use it
                console.error('❌ [ND BOT] pdf-parse export structure:', {
                    type: typeof pdfModule,
                    keys: Object.keys(pdfModule),
                    hasDefault: !!pdfModule.default,
                    defaultType: pdfModule.default ? typeof pdfModule.default : 'none',
                    moduleValue: pdfModule
                });
                throw new Error(`pdf-parse did not export a function. Got type: ${typeof pdfModule}, keys: ${Object.keys(pdfModule || {}).join(', ')}`);
            }
        } else {
            throw new Error(`pdf-parse did not export a function or object. Got type: ${typeof pdfModule}`);
        }
        
        console.log('✅ [ND BOT] pdf-parse loaded successfully, type:', typeof pdf);
    }
    return pdf;
}

async function loadMammoth() {
    if (!mammoth) {
        mammoth = await import('mammoth');
    }
    return mammoth;
}
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const router = express.Router();

// Helper function to extract text from files
async function extractTextFromFile(fileBuffer: Buffer, contentType: string): Promise<string> {
    try {
        console.log(`📄 [ND BOT] Extracting text from file type: ${contentType}`);

        if (contentType === 'application/pdf') {
            const pdfParser = await loadPdf();
            const result = await pdfParser(fileBuffer);
            return result.text;
        } else if (contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || contentType === 'application/msword') {
            const mammothLib = await loadMammoth();
            const { value } = await mammothLib.extractRawText({ buffer: fileBuffer });
            return value;
        } else if (contentType.startsWith('text/')) {
            return fileBuffer.toString('utf8');
        } else {
            throw new Error(`Unsupported file type: ${contentType}`);
        }
    } catch (error) {
        console.error('❌ [ND BOT] Text extraction error:', error);
        throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}



// Upload endpoint
router.post('/upload-bible', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.uid;
        const { fileName, fileContent, fileType, projectId } = req.body;
        let organizationId = req.user?.organizationId;

        if (!organizationId) {
            organizationId = await getUserOrganizationId(userId!, req.user?.email || '') || undefined;
        }

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'User not associated with an organization' });
        }

        const bibleId = `bible_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const bibleData = {
            id: bibleId,
            fileName,
            fileType,
            status: 'processing',
            organizationId,
            projectId: projectId || null,
            uploadedBy: userId,
            uploadedAt: FieldValue.serverTimestamp(),
            rawText: null,
            deliverableCount: 0
        };

        await db.collection('networkDeliveryBibles').doc(bibleId).set(bibleData);
        const fileBuffer = Buffer.from(fileContent, 'base64');
        
        // Get Gemini API key from Firestore (encrypted storage) - same pattern as transcription service
        let keyData;
        try {
            keyData = await getAIApiKey(organizationId, 'gemini', userId);
            console.log('🔍 [ND BOT] getAIApiKey returned:', {
                hasKeyData: !!keyData,
                hasApiKey: !!keyData?.apiKey,
                apiKeyLength: keyData?.apiKey?.length || 0,
                model: keyData?.model || 'none',
            });

            if (!keyData) {
                throw new Error('getAIApiKey returned null - API key not found in Firestore');
            }

            if (!keyData.apiKey) {
                throw new Error('API key data exists but apiKey field is missing or empty');
            }

            if (typeof keyData.apiKey !== 'string' || keyData.apiKey.trim().length === 0) {
                throw new Error(`Invalid API key format: expected non-empty string, got ${typeof keyData.apiKey}`);
            }

            console.log(`✅ [ND BOT] API key retrieved successfully (length: ${keyData.apiKey.length}, model: ${keyData.model || 'default'})`);
        } catch (keyError: any) {
            console.error('❌ [ND BOT] Failed to get API key:', {
                error: keyError.message,
                stack: keyError.stack,
                name: keyError.name,
                organizationId,
                userId,
            });
            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'error',
                errorMessage: `Failed to retrieve Gemini API key: ${keyError.message || 'Unknown error'}`
            });
            return res.status(500).json({ 
                success: false, 
                error: 'Gemini API key not configured',
                errorDetails: keyError.message || 'Please configure the Gemini API key in Settings > Integrations > AI API Keys'
            });
        }

        const apiKey = keyData.apiKey;
        let geminiModel = keyData.model || 'gemini-2.5-flash';

        // Validate and normalize model name (same as transcription service)
        const validModels = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp-001'];
        if (!validModels.includes(geminiModel)) {
            console.warn(`⚠️ [ND BOT] Invalid model name "${geminiModel}", defaulting to gemini-2.5-flash`);
            geminiModel = 'gemini-2.5-flash';
        }

        // Validate API key format (Gemini keys typically start with AIza) - warning only, not error
        if (!apiKey.startsWith('AIza') && apiKey.length < 20) {
            console.warn(`⚠️ [ND BOT] API key format looks unusual (length: ${apiKey.length}, starts with: ${apiKey.substring(0, 4)})`);
        }

        console.log(`✅ [ND BOT] Using Gemini model: ${geminiModel}`);
        const geminiSvc = new GeminiService(apiKey);

        let structuredData: any;
        let rawText: string | null = null;

        try {
            // For PDFs, use Gemini Vision API directly (bypasses pdf-parse issues)
            if (fileType === 'application/pdf') {
                console.log('📄 [ND BOT] Using Gemini Vision API to parse PDF directly...');
                await db.collection('networkDeliveryBibles').doc(bibleId).update({
                    status: 'text_extracted',
                    rawText: 'PDF parsed via Gemini Vision API'
                });
                structuredData = await geminiSvc.parseNetworkBibleFromFile(fileBuffer, fileType, fileName);
                rawText = 'PDF parsed via Gemini Vision API';
            } else {
                // For DOCX and text files, extract text first, then parse
                try {
                    rawText = await extractTextFromFile(fileBuffer, fileType);
                } catch (extractError) {
                    console.error('❌ [ND BOT] Text extraction failed:', extractError);
                    await db.collection('networkDeliveryBibles').doc(bibleId).update({
                        status: 'error',
                        errorMessage: extractError instanceof Error ? extractError.message : 'Text extraction failed'
                    });
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to extract text from file',
                        errorDetails: extractError instanceof Error ? extractError.message : 'Unknown error'
                    });
                }
                await db.collection('networkDeliveryBibles').doc(bibleId).update({
                    rawText,
                    status: 'text_extracted'
                });
                structuredData = await geminiSvc.parseNetworkBible(rawText);
            }

            // Firestore batches are limited to 500 operations, so split into chunks if needed
            const BATCH_LIMIT = 500;
            const deliverables = structuredData.deliverables;
            const totalDeliverables = deliverables.length;

            console.log(`📦 [ND BOT] Storing ${totalDeliverables} deliverables (will split into batches if > ${BATCH_LIMIT})`);

            // Process in batches of 500
            for (let i = 0; i < deliverables.length; i += BATCH_LIMIT) {
                const batch = db.batch();
                const chunk = deliverables.slice(i, i + BATCH_LIMIT);
                
                chunk.forEach((deliverable: any, chunkIndex: number) => {
                    const globalIndex = i + chunkIndex;
                    const deliverableId = `${bibleId}_deliverable_${globalIndex}`;
                    const docRef = db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables').doc(deliverableId);
                    batch.set(docRef, {
                        ...deliverable,
                        id: deliverableId,
                        bibleId,
                        organizationId,
                        projectId: projectId || null,
                        status: 'not_started',
                        createdAt: FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                console.log(`✅ [ND BOT] Committed batch ${Math.floor(i / BATCH_LIMIT) + 1} (${chunk.length} deliverables)`);
            }

            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'parsed_successfully',
                deliverableCount: totalDeliverables,
                parsedAt: FieldValue.serverTimestamp()
            });

            return res.json({ success: true, data: { bibleId, fileName, status: 'parsed_successfully', deliverableCount: structuredData.deliverables.length } });
        } catch (parseError: any) {
            console.error('❌ [ND BOT] Parse error:', parseError);
            
            // Check if it's an API key error
            const errorMessage = parseError.message || String(parseError);
            const isApiKeyError = errorMessage.includes('API key not valid') || 
                                 errorMessage.includes('API_KEY_INVALID') ||
                                 errorMessage.includes('API key') && errorMessage.includes('invalid');
            
            if (isApiKeyError) {
                await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                    status: 'parse_failed', 
                    errorMessage: 'Invalid Gemini API key. Please reconfigure it in Settings > Integrations > AI API Keys'
                });
                return res.status(500).json({ 
                    success: false, 
                    error: 'Invalid Gemini API key',
                    errorDetails: 'The Gemini API key is invalid or expired. Please go to Settings > Integrations > AI API Keys and update your Gemini API key with a valid key from https://makersuite.google.com/app/apikey'
                });
            }
            
            await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                status: 'parse_failed', 
                errorMessage: parseError.message || 'Unknown parsing error'
            });
            return res.status(500).json({ 
                success: false, 
                error: 'AI Parsing failed', 
                errorDetails: parseError.message || 'Unknown error'
            });
        }
    } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Upload failed', errorDetails: error.message });
    }
});

// Get deliverables
router.get('/bibles/:bibleId/deliverables', authenticateToken, async (req, res) => {
    try {
        const { bibleId } = req.params;
        const userId = req.user?.uid;
        let organizationId = req.user?.organizationId;

        if (!organizationId) {
            organizationId = await getUserOrganizationId(userId!, req.user?.email || '') || undefined;
        }

        const bibleDoc = await db.collection('networkDeliveryBibles').doc(bibleId).get();
        if (!bibleDoc.exists || bibleDoc.data()?.organizationId !== organizationId) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const deliverablesSnapshot = await db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables').orderBy('createdAt', 'asc').get();
        const deliverables = deliverablesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.json({ success: true, data: deliverables, bibleInfo: bibleDoc.data() });
    } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Failed to fetch deliverables', errorDetails: error.message });
    }
});

// Delete bible
router.delete('/bibles/:bibleId', authenticateToken, async (req, res) => {
    try {
        console.log('🗑️ [ND BOT] Deleting bible...');
        const { bibleId } = req.params;
        const userId = req.user?.uid;
        const userEmail = req.user?.email || '';
        let organizationId = req.user?.organizationId;

        if (!organizationId) {
            organizationId = await getUserOrganizationId(userId!, userEmail) || undefined;
        }

        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'User not associated with an organization' });
        }

        // Verify bible belongs to user's organization
        const bibleDoc = await db.collection('networkDeliveryBibles').doc(bibleId).get();
        if (!bibleDoc.exists || bibleDoc.data()?.organizationId !== organizationId) {
            return res.status(404).json({ success: false, error: 'Bible not found or access denied' });
        }

        // Delete all deliverables in the bible (handle large batches)
        const deliverablesSnapshot = await db.collection('networkDeliveryBibles')
            .doc(bibleId)
            .collection('deliverables')
            .get();

        const BATCH_LIMIT = 500;
        const deliverables = deliverablesSnapshot.docs;
        
        // Delete deliverables in batches if needed
        for (let i = 0; i < deliverables.length; i += BATCH_LIMIT) {
            const batch = db.batch();
            const chunk = deliverables.slice(i, i + BATCH_LIMIT);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        // Delete the bible document
        await db.collection('networkDeliveryBibles').doc(bibleId).delete();

        console.log(`✅ [ND BOT] Successfully deleted bible: ${bibleId} and ${deliverables.length} deliverables`);

        return res.json({ success: true, message: 'Bible deleted successfully' });
    } catch (error: any) {
        console.error('❌ [ND BOT] Error deleting bible:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete bible', errorDetails: error.message });
    }
});

// Re-process bible endpoint (for stuck bibles)
router.post('/bibles/:bibleId/reprocess', authenticateToken, async (req, res) => {
    try {
        console.log('🔄 [ND BOT] Re-processing bible...');
        const { bibleId } = req.params;
        const userId = req.user?.uid;
        const userEmail = req.user?.email || '';
        let organizationId = req.user?.organizationId;
        if (!organizationId && userId) {
            organizationId = await getUserOrganizationId(userId, userEmail) ?? undefined;
        }
        if (!organizationId) {
            return res.status(400).json({ success: false, error: 'User not associated with an organization' });
        }

        // Get the bible document
        const bibleDoc = await db.collection('networkDeliveryBibles').doc(bibleId).get();
        if (!bibleDoc.exists) {
            return res.status(404).json({ success: false, error: 'Bible not found' });
        }

        const bibleData = bibleDoc.data();
        if (bibleData?.organizationId !== organizationId) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        // Check if bible has rawText
        if (!bibleData?.rawText) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot re-process: Bible has no extracted text. Please re-upload the file.' 
            });
        }

        const rawText = bibleData.rawText;
        const projectId = bibleData.projectId || null;

        // Update status to processing
        await db.collection('networkDeliveryBibles').doc(bibleId).update({
            status: 'processing'
        });

        // Delete existing deliverables
        const deliverablesRef = db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables');
        const existingDeliverables = await deliverablesRef.get();
        const deleteBatch = db.batch();
        existingDeliverables.docs.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
        console.log(`🗑️ [ND BOT] Deleted ${existingDeliverables.size} existing deliverables`);

        // Re-run Gemini parsing - get API key from Firestore (same pattern as transcription service)
        let keyData;
        try {
            keyData = await getAIApiKey(organizationId, 'gemini', userId);
            if (!keyData || !keyData.apiKey) {
                throw new Error('getAIApiKey returned null or empty - API key not found in Firestore');
            }
            console.log(`✅ [ND BOT] API key retrieved for re-process (length: ${keyData.apiKey.length}, model: ${keyData.model || 'default'})`);
        } catch (keyError: any) {
            console.error('❌ [ND BOT] Failed to get API key for re-process:', keyError.message);
            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'error',
                errorMessage: `Failed to retrieve Gemini API key: ${keyError.message || 'Unknown error'}`
            });
            return res.status(500).json({ 
                success: false, 
                error: 'Gemini API key not configured',
                errorDetails: keyError.message || 'Please configure the Gemini API key in Settings > Integrations > AI API Keys'
            });
        }

        const apiKey = keyData.apiKey;
        let geminiModel = keyData.model || 'gemini-2.5-flash';
        const validModels = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp-001'];
        if (!validModels.includes(geminiModel)) {
            console.warn(`⚠️ [ND BOT] Invalid model name "${geminiModel}", defaulting to gemini-2.5-flash`);
            geminiModel = 'gemini-2.5-flash';
        }
        console.log(`✅ [ND BOT] Using Gemini model for re-process: ${geminiModel}`);
        const geminiSvc = new GeminiService(apiKey);

        try {
            const structuredData = await geminiSvc.parseNetworkBible(rawText);

            // Firestore batches are limited to 500 operations
            const BATCH_LIMIT = 500;
            const deliverables = structuredData.deliverables;
            const totalDeliverables = deliverables.length;

            console.log(`📦 [ND BOT] Storing ${totalDeliverables} deliverables (will split into batches if > ${BATCH_LIMIT})`);

            // Process in batches of 500
            for (let i = 0; i < deliverables.length; i += BATCH_LIMIT) {
                const batch = db.batch();
                const chunk = deliverables.slice(i, i + BATCH_LIMIT);
                
                chunk.forEach((deliverable: any, chunkIndex: number) => {
                    const globalIndex = i + chunkIndex;
                    const deliverableId = `${bibleId}_deliverable_${globalIndex}`;
                    const docRef = db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables').doc(deliverableId);
                    batch.set(docRef, {
                        ...deliverable,
                        id: deliverableId,
                        bibleId,
                        organizationId,
                        projectId: projectId || null,
                        status: 'not_started',
                        createdAt: FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                console.log(`✅ [ND BOT] Committed batch ${Math.floor(i / BATCH_LIMIT) + 1} (${chunk.length} deliverables)`);
            }

            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'parsed_successfully',
                deliverableCount: totalDeliverables,
                parsedAt: FieldValue.serverTimestamp()
            });

            return res.json({ 
                success: true, 
                message: 'Bible re-processed successfully',
                data: { bibleId, deliverableCount: totalDeliverables } 
            });
        } catch (parseError: any) {
            console.error('❌ [ND BOT] Parse error:', parseError);
            
            // Check if it's an API key error
            const errorMessage = parseError.message || String(parseError);
            const isApiKeyError = errorMessage.includes('API key not valid') || 
                                 errorMessage.includes('API_KEY_INVALID') ||
                                 (errorMessage.includes('API key') && errorMessage.includes('invalid'));
            
            if (isApiKeyError) {
                await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                    status: 'parse_failed', 
                    errorMessage: 'Invalid Gemini API key. Please reconfigure it in Settings > Integrations > AI API Keys'
                });
                return res.status(500).json({ 
                    success: false, 
                    error: 'Invalid Gemini API key',
                    errorDetails: 'The Gemini API key is invalid or expired. Please go to Settings > Integrations > AI API Keys and update your Gemini API key with a valid key from https://makersuite.google.com/app/apikey'
                });
            }
            
            await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                status: 'parse_failed', 
                errorMessage: parseError.message || 'Unknown parsing error'
            });
            return res.status(500).json({ 
                success: false, 
                error: 'AI Parsing failed', 
                errorDetails: parseError.message || 'Unknown error'
            });
        }
    } catch (error: any) {
        console.error('❌ [ND BOT] Error re-processing bible:', error);
        return res.status(500).json({ success: false, error: 'Failed to re-process bible', errorDetails: error.message });
    }
});

// Get deliverables - Callable Function
export const getNetworkDeliveryDeliverables = onCall(async (request) => {
    try {
        const { bibleId } = request.data;
        if (!bibleId) throw new HttpsError('invalid-argument', 'Bible ID is required');

        const userId = request.auth?.uid;
        const userEmail = (request.auth?.token.email || '').toLowerCase().trim();
        if (!userId) throw new HttpsError('unauthenticated', 'User must be authenticated');

        let organizationId = (request.auth?.token as any)?.organizationId;
        if (!organizationId) organizationId = await getUserOrganizationId(userId, userEmail);

        if (!organizationId) throw new HttpsError('failed-precondition', 'User not associated with an organization');

        const bibleDoc = await db.collection('networkDeliveryBibles').doc(bibleId).get();
        if (!bibleDoc.exists) throw new HttpsError('not-found', 'Bible not found');
        if (bibleDoc.data()?.organizationId !== organizationId) throw new HttpsError('permission-denied', 'Access denied');

        const deliverablesSnapshot = await db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables').orderBy('createdAt', 'asc').get();
        const deliverables = deliverablesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return { success: true, data: deliverables, bibleInfo: bibleDoc.data() };
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

// Upload bible - Callable Function
export const uploadNetworkDeliveryBible = onCall(async (request) => {
    try {
        const { fileName, fileContent, fileType, projectId } = request.data;
        if (!fileName || !fileContent || !fileType) throw new HttpsError('invalid-argument', 'Missing required fields');

        const userId = request.auth?.uid;
        if (!userId) throw new HttpsError('unauthenticated', 'User must be authenticated');

        const userEmail = request.auth?.token.email || '';
        let organizationId = (request.auth?.token as any)?.organizationId;
        if (!organizationId) organizationId = await getUserOrganizationId(userId, userEmail);

        if (!organizationId) throw new HttpsError('failed-precondition', 'User not associated with an organization');

        const bibleId = `bible_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const bibleData = {
            id: bibleId,
            fileName,
            fileType,
            status: 'processing',
            organizationId,
            projectId: projectId || null,
            uploadedBy: userId,
            uploadedAt: FieldValue.serverTimestamp(),
            rawText: null,
            deliverableCount: 0
        };

        await db.collection('networkDeliveryBibles').doc(bibleId).set(bibleData);
        const fileBuffer = Buffer.from(fileContent, 'base64');
        
        // Get Gemini API key from Firestore (encrypted storage) - same pattern as transcription service
        let keyData;
        try {
            keyData = await getAIApiKey(organizationId, 'gemini', userId);
            if (!keyData || !keyData.apiKey) {
                throw new Error('getAIApiKey returned null or empty - API key not found in Firestore');
            }
            console.log(`✅ [ND BOT] API key retrieved (length: ${keyData.apiKey.length}, model: ${keyData.model || 'default'})`);
        } catch (keyError: any) {
            console.error('❌ [ND BOT] Failed to get API key:', keyError.message);
            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'error',
                errorMessage: `Failed to retrieve Gemini API key: ${keyError.message || 'Unknown error'}`
            });
            throw new HttpsError('failed-precondition', keyError.message || 'Gemini API key not configured. Please configure it in Settings > Integrations > AI API Keys');
        }

        const apiKey = keyData.apiKey;
        let geminiModel = keyData.model || 'gemini-2.5-flash';
        const validModels = ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-thinking-exp-001'];
        if (!validModels.includes(geminiModel)) {
            console.warn(`⚠️ [ND BOT] Invalid model name "${geminiModel}", defaulting to gemini-2.5-flash`);
            geminiModel = 'gemini-2.5-flash';
        }
        console.log(`✅ [ND BOT] Using Gemini model: ${geminiModel}`);
        const geminiSvc = new GeminiService(apiKey);

        let structuredData: any;
        let rawText: string | null = null;

        try {
            // For PDFs, use Gemini Vision API directly (bypasses pdf-parse issues)
            if (fileType === 'application/pdf') {
                console.log('📄 [ND BOT] Using Gemini Vision API to parse PDF directly...');
                await db.collection('networkDeliveryBibles').doc(bibleId).update({
                    status: 'text_extracted',
                    rawText: 'PDF parsed via Gemini Vision API'
                });
                structuredData = await geminiSvc.parseNetworkBibleFromFile(fileBuffer, fileType, fileName);
                rawText = 'PDF parsed via Gemini Vision API';
            } else {
                // For DOCX and text files, extract text first, then parse
                try {
                    rawText = await extractTextFromFile(fileBuffer, fileType);
                } catch (extractError) {
                    console.error('❌ [ND BOT] Text extraction failed:', extractError);
                    await db.collection('networkDeliveryBibles').doc(bibleId).update({
                        status: 'error',
                        errorMessage: extractError instanceof Error ? extractError.message : 'Text extraction failed'
                    });
                    throw new HttpsError('internal', `Failed to extract text from file: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
                }
                await db.collection('networkDeliveryBibles').doc(bibleId).update({ rawText, status: 'text_extracted' });
                structuredData = await geminiSvc.parseNetworkBible(rawText);
            }

            // Firestore batches are limited to 500 operations, so split into chunks if needed
            const BATCH_LIMIT = 500;
            const deliverables = structuredData.deliverables;
            const totalDeliverables = deliverables.length;

            console.log(`📦 [ND BOT] Storing ${totalDeliverables} deliverables (will split into batches if > ${BATCH_LIMIT})`);

            // Process in batches of 500
            for (let i = 0; i < deliverables.length; i += BATCH_LIMIT) {
                const batch = db.batch();
                const chunk = deliverables.slice(i, i + BATCH_LIMIT);
                
                chunk.forEach((deliverable: any, chunkIndex: number) => {
                    const globalIndex = i + chunkIndex;
                    const deliverableId = `${bibleId}_deliverable_${globalIndex}`;
                    const docRef = db.collection('networkDeliveryBibles').doc(bibleId).collection('deliverables').doc(deliverableId);
                    batch.set(docRef, {
                        ...deliverable,
                        id: deliverableId,
                        bibleId,
                        organizationId,
                        projectId: projectId || null,
                        status: 'not_started',
                        createdAt: FieldValue.serverTimestamp()
                    });
                });

                await batch.commit();
                console.log(`✅ [ND BOT] Committed batch ${Math.floor(i / BATCH_LIMIT) + 1} (${chunk.length} deliverables)`);
            }

            await db.collection('networkDeliveryBibles').doc(bibleId).update({
                status: 'parsed_successfully',
                deliverableCount: totalDeliverables,
                parsedAt: FieldValue.serverTimestamp()
            });

            return { success: true, data: { bibleId, fileName, status: 'parsed_successfully', deliverableCount: structuredData.deliverables.length } };
        } catch (parseError: any) {
            console.error('❌ [ND BOT] Parse error:', parseError);
            
            // Check if it's an API key error
            const errorMessage = parseError.message || String(parseError);
            const isApiKeyError = errorMessage.includes('API key not valid') || 
                                 errorMessage.includes('API_KEY_INVALID') ||
                                 errorMessage.includes('API key') && errorMessage.includes('invalid');
            
            if (isApiKeyError) {
                await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                    status: 'parse_failed', 
                    errorMessage: 'Invalid Gemini API key. Please reconfigure it in Settings > Integrations > AI API Keys'
                });
                throw new HttpsError('failed-precondition', 'The Gemini API key is invalid or expired. Please go to Settings > Integrations > AI API Keys and update your Gemini API key with a valid key from https://makersuite.google.com/app/apikey');
            }
            
            await db.collection('networkDeliveryBibles').doc(bibleId).update({ 
                status: 'parse_failed', 
                errorMessage: parseError.message || 'Unknown parsing error'
            });
            throw new HttpsError('internal', `AI Parsing failed: ${parseError.message || 'Unknown error'}`);
        }
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export default router;
