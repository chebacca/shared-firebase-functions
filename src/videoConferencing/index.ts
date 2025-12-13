/**
 * Video Conferencing Functions
 * 
 * Unified interface for Google Meet and Webex video conferencing
 */

export * from './googleMeet';
export * from './webex';

/**
 * Get available video conferencing providers for an organization
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import { encryptionKey } from '../google/secrets';

export const getVideoConferencingProviders = onCall(
  {
    region: 'us-central1',
    cors: true,
    secrets: [encryptionKey],
  },
  async (request) => {
    try {
      const { organizationId } = request.data as {
        organizationId: string;
      };

      if (!organizationId) {
        throw new HttpsError('invalid-argument', 'Organization ID is required');
      }

      // Check Google Meet connection
      const googleConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .where('type', '==', 'organization')
        .where('isActive', '==', true)
        .limit(1)
        .get();

      // Fallback: allow Firestore OAuth stored in cloudIntegrations/google to activate video conferencing without a new OAuth
      let hasGoogleConnection = !googleConnections.empty;
      if (!hasGoogleConnection) {
        const cloudIntegrationDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc('google')
          .get();

        if (cloudIntegrationDoc.exists) {
          const data = cloudIntegrationDoc.data() || {};
          hasGoogleConnection = data.isActive !== false && !!((data as any).tokens || (data as any).encryptedTokens);
        }
      }

      // Check Webex connection
      const webexConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('webexConnections')
        .where('type', '==', 'organization')
        .where('isActive', '==', true)
        .limit(1)
        .get();

      // Check default provider preference
      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      const orgData = orgDoc.data();
      const defaultProvider = orgData?.videoConferencing?.defaultProvider || null;

      const providers = [];

      if (hasGoogleConnection) {
        providers.push({
          type: 'google-meet',
          name: 'Google Meet',
          isConfigured: true,
          isDefault: defaultProvider === 'google-meet' || (defaultProvider === null && providers.length === 0),
        });
      }

      if (!webexConnections.empty) {
        providers.push({
          type: 'webex',
          name: 'Webex',
          isConfigured: true,
          isDefault: defaultProvider === 'webex' || (defaultProvider === null && providers.length === 0),
        });
      }

      return {
        success: true,
        providers,
        defaultProvider: providers.find(p => p.isDefault)?.type || null,
      };

    } catch (error: any) {
      console.error('❌ [VideoConferencing] Error getting providers:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to get providers: ${error.message || 'Unknown error'}`);
    }
  }
);

