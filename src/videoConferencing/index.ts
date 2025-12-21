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

      console.log(`🔍 [VideoConferencing] Checking providers for org: ${organizationId}`);

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

      // Additional fallback: Check integrationConfigs collection
      if (!hasGoogleConnection) {
        const integrationConfigsQuery = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('integrationConfigs')
          .where('type', 'in', ['google_meet', 'googleMeet', 'google_drive', 'google_docs'])
          .where('enabled', '==', true)
          .limit(1)
          .get();

        if (!integrationConfigsQuery.empty) {
          const config = integrationConfigsQuery.docs[0].data();
          // Check if it has connection status or credentials
          hasGoogleConnection = config.connectionStatus === 'connected' || 
                                !!(config.accountEmail || config.accountName || config.credentials?.clientId);
        }
      }

      // Additional fallback: Check integrationSettings collection
      if (!hasGoogleConnection) {
        const integrationSettingsDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('integrationSettings')
          .doc('google')
          .get();

        if (integrationSettingsDoc.exists) {
          const data = integrationSettingsDoc.data() || {};
          hasGoogleConnection = data.isConfigured === true || 
                                !!(data.clientId && (data.tokens || data.encryptedTokens));
          if (hasGoogleConnection) {
            console.log(`✅ [VideoConferencing] Found Google connection in integrationSettings/google`);
          }
        }
      }

      console.log(`📊 [VideoConferencing] Google Meet connection status: ${hasGoogleConnection}`);

      // Check Webex connection
      const webexConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('webexConnections')
        .where('type', '==', 'organization')
        .where('isActive', '==', true)
        .limit(1)
        .get();

      // Additional fallback: Check integrationConfigs for Webex
      let hasWebexConnection = !webexConnections.empty;
      if (!hasWebexConnection) {
        const webexConfigsQuery = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('integrationConfigs')
          .where('type', '==', 'webex')
          .where('enabled', '==', true)
          .limit(1)
          .get();

        if (!webexConfigsQuery.empty) {
          const config = webexConfigsQuery.docs[0].data();
          hasWebexConnection = config.connectionStatus === 'connected' || 
                               !!(config.accountEmail || config.accountName || config.credentials?.clientId);
        }
      }

      // Additional fallback: Check integrationSettings for Webex
      if (!hasWebexConnection) {
        const webexSettingsDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('integrationSettings')
          .doc('webex')
          .get();

        if (webexSettingsDoc.exists) {
          const data = webexSettingsDoc.data() || {};
          hasWebexConnection = data.isConfigured === true || 
                               !!(data.clientId && (data.tokens || data.encryptedTokens));
          if (hasWebexConnection) {
            console.log(`✅ [VideoConferencing] Found Webex connection in integrationSettings/webex`);
          }
        }
      }

      console.log(`📊 [VideoConferencing] Webex connection status: ${hasWebexConnection}`);

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

      if (hasWebexConnection) {
        providers.push({
          type: 'webex',
          name: 'Webex',
          isConfigured: true,
          isDefault: defaultProvider === 'webex' || (defaultProvider === null && providers.length === 0),
        });
      }

      console.log(`✅ [VideoConferencing] Returning ${providers.length} provider(s) for org: ${organizationId}`, providers);

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

