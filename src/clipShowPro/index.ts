/**
 * 🔥 CLIP SHOW PRO FIREBASE FUNCTIONS
 * Backend operations for Clip Show Pro workflow
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { emailService } from './emailService';
import { aiService } from './aiService';
import { executeAutomation } from './automationExecutor';
import { onPitchStatusChange, onStoryStatusChange } from './automationTriggers';
import { onPitchCreated, onPitchUpdated, onStoryUpdated, onClearanceCreated, onClearanceUpdated } from './calendarTriggers';

// Initialize Firebase Admin (only if not already initialized)
try {
  initializeApp();
} catch (error) {
  // Firebase already initialized, continue
}
const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

// ============================================================================
// EMAIL NOTIFICATIONS
// ============================================================================

/**
 * Send email notification when pitch status changes
 */
export const notifyPitchStatusChange = onCall(async (request) => {
  try {
    const { pitchId, newStatus, reason, userId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get pitch data
    const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
    if (!pitchDoc.exists) {
      throw new HttpsError('not-found', 'Pitch not found');
    }

    const pitch = pitchDoc.data();
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    const user = userDoc.data();

    // Send email notification
    if (user?.email) {
      try {
        const emailData = emailService.generatePitchStatusChangeEmail(
          pitch, 
          user, 
          newStatus, 
          reason
        );
        await emailService.sendEmail(emailData);
        console.log('Pitch status change email sent successfully');
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't throw error - email failure shouldn't break the function
      }
    }

    return { success: true, message: 'Notification sent' };
  } catch (error) {
    console.error('Error sending pitch status notification:', error);
    throw new HttpsError('internal', 'Failed to send notification');
  }
});

/**
 * Send email notification when pitch is assigned to producer
 */
export const notifyPitchAssignment = onCall(async (request) => {
  try {
    const { pitchId, producerId, message } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get pitch data
    const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
    if (!pitchDoc.exists) {
      throw new HttpsError('not-found', 'Pitch not found');
    }

    const pitch = pitchDoc.data();
    
    // Get producer data
    const producerDoc = await db.collection('users').doc(producerId).get();
    const producer = producerDoc.data();

    // Send email notification
    if (producer?.email) {
      try {
        const emailData = emailService.generatePitchAssignmentEmail(
          pitch, 
          producer, 
          producer?.name || producer?.email
        );
        await emailService.sendEmail(emailData);
        console.log('Pitch assignment email sent successfully');
      } catch (emailError) {
        console.error('Failed to send assignment email:', emailError);
        // Don't throw error - email failure shouldn't break the function
      }
    }

    return { success: true, message: 'Assignment notification sent' };
  } catch (error) {
    console.error('Error sending assignment notification:', error);
    throw new HttpsError('internal', 'Failed to send assignment notification');
  }
});

/**
 * Send email notification when licensing specialist is selected
 */
export const notifyLicensingSpecialist = onCall(async (request) => {
  try {
    const { pitchId, specialistId, message } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get pitch data
    const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
    if (!pitchDoc.exists) {
      throw new HttpsError('not-found', 'Pitch not found');
    }

    const pitch = pitchDoc.data();
    
    // Get specialist data
    const specialistDoc = await db.collection('users').doc(specialistId).get();
    const specialist = specialistDoc.data();

    // Send email notification
    if (specialist?.email) {
      try {
        const emailData = emailService.generateLicensingSpecialistEmail(
          pitch, 
          specialist, 
          specialist?.name || specialist?.email
        );
        await emailService.sendEmail(emailData);
        console.log('Licensing specialist email sent successfully');
      } catch (emailError) {
        console.error('Failed to send licensing email:', emailError);
        // Don't throw error - email failure shouldn't break the function
      }
    }

    return { success: true, message: 'Licensing notification sent' };
  } catch (error) {
    console.error('Error sending licensing notification:', error);
    throw new HttpsError('internal', 'Failed to send licensing notification');
  }
});

// ============================================================================
// INTEGRATION OPERATIONS
// ============================================================================

/**
 * Generate script from story using AI
 */
export const generateScript = onCall(async (request) => {
  try {
    const { storyId, templateId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get story data
    const storyDoc = await db.collection('clipShowStories').doc(storyId).get();
    if (!storyDoc.exists) {
      throw new HttpsError('not-found', 'Story not found');
    }

    const story = storyDoc.data();
    
    // Get template data
    const templateDoc = await db.collection('clipShowScriptTemplates').doc(templateId).get();
    if (!templateDoc.exists) {
      throw new HttpsError('not-found', 'Template not found');
    }

    const template = templateDoc.data();

    // Generate script using AI
    const scriptRequest = {
      storyId,
      templateId,
      storyData: {
        clipTitle: story?.clipTitle,
        show: story?.show,
        season: story?.season,
        researchNotes: story?.researchNotes,
        producerNotes: story?.producerNotes,
        clearanceNotes: story?.clearanceNotes
      }
    };

    const generatedScriptContent = await aiService.generateScript(scriptRequest);
    
    const generatedScript = {
      content: generatedScriptContent,
      template: template?.name,
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
      organizationId: story?.organizationId,
      createdBy: request.auth.uid,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { 
      success: true, 
      scriptId: scriptDoc.id,
      script: generatedScript
    };
  } catch (error) {
    console.error('Error generating script:', error);
    throw new HttpsError('internal', 'Failed to generate script');
  }
});

/**
 * Upload file to Box storage for Clip Show Pro workflow
 */
export const uploadToBoxForClipShow = onCall(async (request) => {
  try {
    const { fileData, fileName, pitchId, fileType } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
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
  } catch (error) {
    console.error('Error uploading to Box:', error);
    throw new HttpsError('internal', 'Failed to upload to Box');
  }
});

// ============================================================================
// WORKFLOW AUTOMATION
// ============================================================================

/**
 * Auto-create story when pitch status changes to "Ready for Script"
 */
export const autoCreateStory = onDocumentUpdated('clipShowPitches/{pitchId}', async (event) => {
  try {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    
    // Check if status changed to "Ready for Script"
    if (before?.status !== 'Ready for Script' && after?.status === 'Ready for Script') {
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
  } catch (error) {
    console.error('Error auto-creating story:', error);
  }
});

/**
 * Auto-update pitch when story status changes
 */
export const syncPitchFromStory = onDocumentUpdated('clipShowStories/{storyId}', async (event) => {
  try {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    
    // Check if story status changed
    if (before?.status !== after?.status) {
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
  } catch (error) {
    console.error('Error syncing pitch from story:', error);
  }
});

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

/**
 * Get pitch analytics for organization
 */
export const getPitchAnalytics = onCall(async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const organizationId = request.auth.token.organizationId;
    if (!organizationId) {
      throw new HttpsError('permission-denied', 'Organization ID required');
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
  } catch (error) {
    console.error('Error getting pitch analytics:', error);
    throw new HttpsError('internal', 'Failed to get analytics');
  }
});

// Helper functions
function calculateAverageProcessingTime(pitches: any[]): number {
  // TODO: Implement processing time calculation
  return 0;
}

function calculateSuccessRate(pitches: any[]): number {
  const clearedPitches = pitches.filter(p => p.status === 'Cleared').length;
  return pitches.length > 0 ? (clearedPitches / pitches.length) * 100 : 0;
}

// ============================================================================
// AI-POWERED ANALYTICS
// ============================================================================

/**
 * Analyze pitch content using AI for insights and recommendations
 */
export const analyzePitchContent = onCall(async (request) => {
  try {
    const { pitchId } = request.data;
    
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    // Get pitch data
    const pitchDoc = await db.collection('clipShowPitches').doc(pitchId).get();
    if (!pitchDoc.exists) {
      throw new HttpsError('not-found', 'Pitch not found');
    }

    const pitch = pitchDoc.data();
    
    // Analyze pitch content using AI
    const analysis = await aiService.analyzePitchContent(pitch);
    
    // Generate story ideas
    const storyIdeas = await aiService.generateStoryIdeas(pitch);
    
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
  } catch (error) {
    console.error('Error analyzing pitch content:', error);
    throw new HttpsError('internal', 'Failed to analyze pitch content');
  }
});

// ============================================================================
// SUBSCRIPTION ADD-ONS MANAGEMENT
// ============================================================================

// Export subscription add-ons sync functions
export * from './syncSubscriptionAddOns';

// Export contact creation with auth
export * from './createContactWithAuth';

// Export automation executor
export { executeAutomation } from './automationExecutor';

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Health check for Clip Show Pro functions
 */
export const clipShowProHealthCheck = onCall(async (request) => {
  try {
    return {
      success: true,
      timestamp: new Date().toISOString(),
      service: 'Clip Show Pro Functions',
      version: '1.0.0',
      status: 'healthy'
    };
  } catch (error) {
    console.error('Health check error:', error);
    throw new HttpsError('internal', 'Health check failed');
  }
});

// ============================================================================
// CALENDAR TRIGGERS
// ============================================================================

// Export calendar trigger functions
export { onPitchCreated, onPitchUpdated, onStoryUpdated, onClearanceCreated, onClearanceUpdated };

// Export license email function
export { sendLicenseEmail } from './sendLicenseEmail';

// Export transcript extraction function
export { extractTranscript } from './extractTranscript';

// Export comprehensive contact search function
export { searchContacts } from './searchContacts';

// Export trashcan cleanup functions
export { cleanupTrashcan, cleanupTrashcanManual } from './cleanupTrashcan';

// Export permissions matrix trigger
export { onPermissionsMatrixUpdate } from './permissionsMatrixTrigger';
