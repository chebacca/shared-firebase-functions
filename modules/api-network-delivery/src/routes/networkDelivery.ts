import express from 'express';
import { db, getUserOrganizationId } from '../shared/utils';
import { authenticateToken } from '../shared/middleware';
import { CoreGeminiService } from '../shared/CoreGeminiService';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
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
            organizationId = await getUserOrganizationId(userId!, req.user?.email || '');
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
        const rawText = await extractTextFromFile(fileBuffer, fileType);

        await db.collection('networkDeliveryBibles').doc(bibleId).update({
            rawText,
            status: 'text_extracted'
        });

        const geminiKey = process.env.GEMINI_API_KEY || (functions.config()?.api && functions.config().api.gemini_key);
        if (!geminiKey) {
            throw new Error('Gemini API key not configured');
        }

        const geminiSvc = new CoreGeminiService(geminiKey);
        try {
            const structuredData = await geminiSvc.parseNetworkBible(rawText);

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
            await db.collection('networkDeliveryBibles').doc(bibleId).update({ status: 'parse_failed', error: parseError.message });
            return res.status(500).json({ success: false, error: 'AI Parsing failed', errorDetails: parseError.message });
        }
    } catch (error: any) {
        return res.status(500).json({ success: false, error: 'Upload failed', errorDetails: error.message });
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
            organizationId = await getUserOrganizationId(userId!, userEmail);
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

// Get deliverables
router.get('/bibles/:bibleId/deliverables', authenticateToken, async (req, res) => {
    try {
        const { bibleId } = req.params;
        const userId = req.user?.uid;
        let organizationId = req.user?.organizationId;

        if (!organizationId) {
            organizationId = await getUserOrganizationId(userId!, req.user?.email || '');
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
        const rawText = await extractTextFromFile(fileBuffer, fileType);

        await db.collection('networkDeliveryBibles').doc(bibleId).update({ rawText, status: 'text_extracted' });

        const geminiKey = process.env.GEMINI_API_KEY || (functions.config()?.api && functions.config().api.gemini_key);
        if (!geminiKey) throw new Error('Gemini API key not configured');
        const geminiSvc = new CoreGeminiService(geminiKey);

        try {
            const structuredData = await geminiSvc.parseNetworkBible(rawText);

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
            await db.collection('networkDeliveryBibles').doc(bibleId).update({ status: 'parse_failed', error: parseError.message });
            return { success: false, error: 'AI Parsing failed', details: parseError.message };
        }
    } catch (error: any) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', error.message);
    }
});

export default router;
