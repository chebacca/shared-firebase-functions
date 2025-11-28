"use strict";
/**
 * 🔥 CLIP SHOW PRO FIREBASE FUNCTIONS
 * Backend operations for Clip Show Pro workflow
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipShowProHealthCheck = exports.analyzePitchContent = exports.getPitchAnalytics = exports.syncPitchFromStory = exports.autoCreateStory = exports.uploadToBoxForClipShow = exports.generateScript = exports.notifyLicensingSpecialist = exports.notifyPitchAssignment = exports.notifyPitchStatusChange = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const emailService_1 = require("./emailService");
const aiService_1 = require("./aiService");
// Initialize Firebase Admin (only if not already initialized)
try {
    (0, app_1.initializeApp)();
}
catch (error) {
    // Firebase already initialized, continue
}
const db = (0, firestore_2.getFirestore)();
const auth = (0, auth_1.getAuth)();
const storage = (0, storage_1.getStorage)();
// ============================================================================
// EMAIL NOTIFICATIONS
// ============================================================================
/**
 * Send email notification when pitch status changes
 */
exports.notifyPitchStatusChange = (0, https_1.onCall)(async (request) => {
    try {
        const { pitchId, newStatus, reason, userId } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get pitch data
        const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
        if (!pitchDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Pitch not found');
        }
        const pitch = pitchDoc.data();
        // Get user data
        const userDoc = await db.collection('users').doc(userId).get();
        const user = userDoc.data();
        // Send email notification
        if (user === null || user === void 0 ? void 0 : user.email) {
            try {
                const emailData = emailService_1.emailService.generatePitchStatusChangeEmail(pitch, user, newStatus, reason);
                await emailService_1.emailService.sendEmail(emailData);
                console.log('Pitch status change email sent successfully');
            }
            catch (emailError) {
                console.error('Failed to send email notification:', emailError);
                // Don't throw error - email failure shouldn't break the function
            }
        }
        return { success: true, message: 'Notification sent' };
    }
    catch (error) {
        console.error('Error sending pitch status notification:', error);
        throw new https_1.HttpsError('internal', 'Failed to send notification');
    }
});
/**
 * Send email notification when pitch is assigned to producer
 */
exports.notifyPitchAssignment = (0, https_1.onCall)(async (request) => {
    try {
        const { pitchId, producerId, message } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get pitch data
        const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
        if (!pitchDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Pitch not found');
        }
        const pitch = pitchDoc.data();
        // Get producer data
        const producerDoc = await db.collection('users').doc(producerId).get();
        const producer = producerDoc.data();
        // Send email notification
        if (producer === null || producer === void 0 ? void 0 : producer.email) {
            try {
                const emailData = emailService_1.emailService.generatePitchAssignmentEmail(pitch, producer, (producer === null || producer === void 0 ? void 0 : producer.name) || (producer === null || producer === void 0 ? void 0 : producer.email));
                await emailService_1.emailService.sendEmail(emailData);
                console.log('Pitch assignment email sent successfully');
            }
            catch (emailError) {
                console.error('Failed to send assignment email:', emailError);
                // Don't throw error - email failure shouldn't break the function
            }
        }
        return { success: true, message: 'Assignment notification sent' };
    }
    catch (error) {
        console.error('Error sending assignment notification:', error);
        throw new https_1.HttpsError('internal', 'Failed to send assignment notification');
    }
});
/**
 * Send email notification when licensing specialist is selected
 */
exports.notifyLicensingSpecialist = (0, https_1.onCall)(async (request) => {
    try {
        const { pitchId, specialistId, message } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get pitch data
        const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
        if (!pitchDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Pitch not found');
        }
        const pitch = pitchDoc.data();
        // Get specialist data
        const specialistDoc = await db.collection('users').doc(specialistId).get();
        const specialist = specialistDoc.data();
        // Send email notification
        if (specialist === null || specialist === void 0 ? void 0 : specialist.email) {
            try {
                const emailData = emailService_1.emailService.generateLicensingSpecialistEmail(pitch, specialist, (specialist === null || specialist === void 0 ? void 0 : specialist.name) || (specialist === null || specialist === void 0 ? void 0 : specialist.email));
                await emailService_1.emailService.sendEmail(emailData);
                console.log('Licensing specialist email sent successfully');
            }
            catch (emailError) {
                console.error('Failed to send licensing email:', emailError);
                // Don't throw error - email failure shouldn't break the function
            }
        }
        return { success: true, message: 'Licensing notification sent' };
    }
    catch (error) {
        console.error('Error sending licensing notification:', error);
        throw new https_1.HttpsError('internal', 'Failed to send licensing notification');
    }
});
// ============================================================================
// INTEGRATION OPERATIONS
// ============================================================================
/**
 * Generate script from story using AI
 */
exports.generateScript = (0, https_1.onCall)(async (request) => {
    try {
        const { storyId, templateId } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get story data
        const storyDoc = await db.collection('clipShowStories').doc(storyId).get();
        if (!storyDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Story not found');
        }
        const story = storyDoc.data();
        // Get template data
        const templateDoc = await db.collection('clipShowScriptTemplates').doc(templateId).get();
        if (!templateDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Template not found');
        }
        const template = templateDoc.data();
        // Generate script using AI
        const scriptRequest = {
            storyId,
            templateId,
            storyData: {
                clipTitle: story === null || story === void 0 ? void 0 : story.clipTitle,
                show: story === null || story === void 0 ? void 0 : story.show,
                season: story === null || story === void 0 ? void 0 : story.season,
                researchNotes: story === null || story === void 0 ? void 0 : story.researchNotes,
                producerNotes: story === null || story === void 0 ? void 0 : story.producerNotes,
                clearanceNotes: story === null || story === void 0 ? void 0 : story.clearanceNotes
            }
        };
        const generatedScriptContent = await aiService_1.aiService.generateScript(scriptRequest);
        const generatedScript = {
            content: generatedScriptContent,
            template: template === null || template === void 0 ? void 0 : template.name,
            generatedAt: new Date(),
            version: 1
        };
        // Save generated script
        const scriptDoc = await db.collection('clipShowDocuments').add({
            type: 'script',
            storyId,
            templateId,
            content: generatedScript.content,
            version: generatedScript.version,
            generatedAt: generatedScript.generatedAt,
            organizationId: story === null || story === void 0 ? void 0 : story.organizationId,
            createdBy: request.auth.uid,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return {
            success: true,
            scriptId: scriptDoc.id,
            script: generatedScript
        };
    }
    catch (error) {
        console.error('Error generating script:', error);
        throw new https_1.HttpsError('internal', 'Failed to generate script');
    }
});
/**
 * Upload file to Box storage for Clip Show Pro workflow
 */
exports.uploadToBoxForClipShow = (0, https_1.onCall)(async (request) => {
    try {
        const { fileData, fileName, pitchId, fileType } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // TODO: Implement Box API integration
        const boxFileId = `box_${Date.now()}_${fileName}`;
        const boxUrl = `https://box.com/files/${boxFileId}`;
        // Save document reference
        const docRef = await db.collection('clipShowDocuments').add({
            type: fileType || 'document',
            pitchId,
            fileName,
            boxFileId,
            boxUrl,
            organizationId: request.auth.token.organizationId,
            uploadedBy: request.auth.uid,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        return {
            success: true,
            documentId: docRef.id,
            boxFileId,
            boxUrl
        };
    }
    catch (error) {
        console.error('Error uploading to Box:', error);
        throw new https_1.HttpsError('internal', 'Failed to upload to Box');
    }
});
// ============================================================================
// WORKFLOW AUTOMATION
// ============================================================================
/**
 * Auto-create story when pitch status changes to "Ready for Script"
 */
exports.autoCreateStory = (0, firestore_1.onDocumentUpdated)('clipShowPitches/{pitchId}', async (event) => {
    var _a, _b, _c, _d;
    try {
        const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
        const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
        // Check if status changed to "Ready for Script"
        if ((before === null || before === void 0 ? void 0 : before.status) !== 'Ready for Script' && (after === null || after === void 0 ? void 0 : after.status) === 'Ready for Script') {
            const pitchId = event.params.pitchId;
            // Create story from pitch
            const storyData = {
                clipPitchId: pitchId,
                clipTitle: after.clipTitle,
                sourceLink: after.sourceLink,
                show: after.show,
                season: after.season,
                episode: after.episode || '',
                clipType: after.clipType,
                categories: after.categories,
                writerId: after.assignedWriterId || '',
                writerRole: 'writer',
                associateProducerId: after.assignedAPId || '',
                associateProducerRole: 'associate_producer',
                producerId: after.assignedProducerId || '',
                producerRole: 'producer',
                status: 'Ready for Script',
                revisions: [],
                organizationId: after.organizationId,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            await db.collection('clipShowStories').add(storyData);
            console.log(`Auto-created story for pitch ${pitchId}`);
        }
    }
    catch (error) {
        console.error('Error auto-creating story:', error);
    }
});
/**
 * Auto-update pitch when story status changes
 */
exports.syncPitchFromStory = (0, firestore_1.onDocumentUpdated)('clipShowStories/{storyId}', async (event) => {
    var _a, _b, _c, _d;
    try {
        const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
        const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
        // Check if story status changed
        if ((before === null || before === void 0 ? void 0 : before.status) !== (after === null || after === void 0 ? void 0 : after.status)) {
            const storyId = event.params.storyId;
            // Update corresponding pitch
            const pitchQuery = await db.collection('clipShowPitches')
                .where('storyId', '==', storyId)
                .limit(1)
                .get();
            if (!pitchQuery.empty) {
                const pitchDoc = pitchQuery.docs[0];
                await pitchDoc.ref.update({
                    status: after.status,
                    updatedAt: new Date()
                });
                console.log(`Synced pitch ${pitchDoc.id} status to ${after.status}`);
            }
        }
    }
    catch (error) {
        console.error('Error syncing pitch from story:', error);
    }
});
// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================
/**
 * Get pitch analytics for organization
 */
exports.getPitchAnalytics = (0, https_1.onCall)(async (request) => {
    try {
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const organizationId = request.auth.token.organizationId;
        if (!organizationId) {
            throw new https_1.HttpsError('permission-denied', 'Organization ID required');
        }
        // Get all pitches for organization
        const pitchesSnapshot = await db.collection('clipShowPitches')
            .where('organizationId', '==', organizationId)
            .get();
        const pitches = pitchesSnapshot.docs.map(doc => doc.data());
        // Calculate analytics
        const analytics = {
            totalPitches: pitches.length,
            statusBreakdown: pitches.reduce((acc, pitch) => {
                acc[pitch.status] = (acc[pitch.status] || 0) + 1;
                return acc;
            }, {}),
            showBreakdown: pitches.reduce((acc, pitch) => {
                acc[pitch.show] = (acc[pitch.show] || 0) + 1;
                return acc;
            }, {}),
            averageProcessingTime: calculateAverageProcessingTime(pitches),
            successRate: calculateSuccessRate(pitches)
        };
        return { success: true, analytics };
    }
    catch (error) {
        console.error('Error getting pitch analytics:', error);
        throw new https_1.HttpsError('internal', 'Failed to get analytics');
    }
});
// Helper functions
function calculateAverageProcessingTime(pitches) {
    // TODO: Implement processing time calculation
    return 0;
}
function calculateSuccessRate(pitches) {
    const clearedPitches = pitches.filter(p => p.status === 'Cleared').length;
    return pitches.length > 0 ? (clearedPitches / pitches.length) * 100 : 0;
}
// ============================================================================
// AI-POWERED ANALYTICS
// ============================================================================
/**
 * Analyze pitch content using AI for insights and recommendations
 */
exports.analyzePitchContent = (0, https_1.onCall)(async (request) => {
    try {
        const { pitchId } = request.data;
        if (!request.auth) {
            throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
        }
        // Get pitch data
        const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
        if (!pitchDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Pitch not found');
        }
        const pitch = pitchDoc.data();
        // Analyze pitch content using AI
        const analysis = await aiService_1.aiService.analyzePitchContent(pitch);
        // Generate story ideas
        const storyIdeas = await aiService_1.aiService.generateStoryIdeas(pitch);
        // Save analysis results
        await db.collection('clipShowDocuments').add({
            type: 'analysis',
            pitchId,
            analysis,
            storyIdeas,
            analyzedAt: new Date(),
            version: 1
        });
        return {
            success: true,
            analysis,
            storyIdeas,
            message: 'Pitch analysis completed'
        };
    }
    catch (error) {
        console.error('Error analyzing pitch content:', error);
        throw new https_1.HttpsError('internal', 'Failed to analyze pitch content');
    }
});
// ============================================================================
// SUBSCRIPTION ADD-ONS MANAGEMENT
// ============================================================================
// Export subscription add-ons sync functions
__exportStar(require("./syncSubscriptionAddOns"), exports);
// ============================================================================
// HEALTH CHECK
// ============================================================================
/**
 * Health check for Clip Show Pro functions
 */
exports.clipShowProHealthCheck = (0, https_1.onCall)(async (request) => {
    try {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            service: 'Clip Show Pro Functions',
            version: '1.0.0',
            status: 'healthy'
        };
    }
    catch (error) {
        console.error('Health check error:', error);
        throw new https_1.HttpsError('internal', 'Health check failed');
    }
});
