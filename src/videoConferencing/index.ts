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
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../shared/utils';
import * as admin from 'firebase-admin';

// CORS helper function
function setCorsHeaders(res: any, origin?: string): void {
  const allowedOrigins = [
    'https://backbone-logic.web.app',
    'https://backbone-client.web.app',
    'https://backbone-callsheet-standalone.web.app',
    'https://clipshowpro.web.app',
    'http://localhost:4002',
    'http://localhost:4003',
    'http://localhost:4006',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4010',
    'http://localhost:5173',
  ];

  // Always allow localhost origins
  if (origin && origin.includes('localhost')) {
    res.set('Access-Control-Allow-Origin', origin);
  } else if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');
}

export const getVideoConferencingProviders = onCall(
  {
    region: 'us-central1',
    cors: [
      'https://backbone-logic.web.app',
      'https://backbone-client.web.app',
      'https://backbone-callsheet-standalone.web.app',
      'https://clipshowpro.web.app',
      'http://localhost:4001',
      'http://localhost:4002',
      'http://localhost:4003',
      'http://localhost:4006',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4010',
      'http://localhost:5173',
      /localhost:\d+$/,  // Allow any localhost port
    ],
    invoker: 'public',
    memory: '512MiB',
    cpu: 0.5,
  },
  async (request) => {
    try {
      // Log request details for debugging
      console.log(`🔍 [VideoConferencing] getVideoConferencingProviders called`, {
        hasAuth: !!request.auth,
        authUid: request.auth?.uid,
        data: request.data,
      });

      const { organizationId } = request.data as {
        organizationId: string;
      };

      if (!organizationId) {
        console.error('❌ [VideoConferencing] Missing organizationId in request');
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

/**
 * HTTP version of getVideoConferencingProviders with explicit CORS handling
 * This is a fallback for when the callable function has CORS issues
 */
export const getVideoConferencingProvidersHttp = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    cpu: 0.5,
  },
  async (req, res) => {
    // Set CORS headers first so they are present on all responses (including errors)
    setCorsHeaders(res, req.headers.origin);
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }    // Only allow POST requests
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }    try {
      // Verify authentication via Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('❌ [VideoConferencing HTTP] No authentication token provided');
        res.status(401).json({
          success: false,
          error: 'Authentication required. Please provide a valid Firebase ID token.',
        });
        return;
      }

      // Verify Firebase ID token
      const token = authHeader.split('Bearer ')[1];
      if (!token || token.length < 10) {
        console.error('❌ [VideoConferencing HTTP] Invalid token format');
        res.status(401).json({
          success: false,
          error: 'Invalid authentication token format',
        });
        return;
      }

      // Verify the token with Firebase Admin
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(token);
        console.log(`✅ [VideoConferencing HTTP] Token verified for user: ${decodedToken.uid}`);
      } catch (tokenError: any) {
        console.error('❌ [VideoConferencing HTTP] Token verification failed:', tokenError.message);
        res.status(401).json({
          success: false,
          error: 'Invalid or expired authentication token',
        });
        return;
      }

      const { organizationId } = req.body as {
        organizationId: string;
      };      if (!organizationId) {
        console.error('❌ [VideoConferencing HTTP] Missing organizationId');
        res.status(400).json({
          success: false,
          error: 'Organization ID is required',
        });
        return;
      }

      // Verify user has access to this organization
      const userOrgId = decodedToken.organizationId;
      if (userOrgId && userOrgId !== organizationId) {
        console.error('❌ [VideoConferencing HTTP] Organization access denied', { userOrgId, requestedOrgId: organizationId });
        res.status(403).json({
          success: false,
          error: 'Access denied to this organization',
        });
        return;
      }

      console.log(`🔍 [VideoConferencing HTTP] Checking providers for org: ${organizationId}`);      // Check Google Meet connection
      const googleConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('googleConnections')
        .where('type', '==', 'organization')
        .where('isActive', '==', true)
        .limit(1)
        .get();      // Fallback: allow Firestore OAuth stored in cloudIntegrations/google
      let hasGoogleConnection = !googleConnections.empty;
      if (!hasGoogleConnection) {
        const cloudIntegrationDoc = await db
          .collection('organizations')
          .doc(organizationId)
          .collection('cloudIntegrations')
          .doc('google')
          .get();        if (cloudIntegrationDoc.exists) {
          const data = cloudIntegrationDoc.data() || {};
          hasGoogleConnection = data.isActive !== false && !!((data as any).tokens || (data as any).encryptedTokens);
        }
      }      // Additional fallback: Check integrationConfigs collection
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
          hasGoogleConnection = config.connectionStatus === 'connected' ||
            !!(config.accountEmail || config.accountName || config.credentials?.clientId);
        }
      }      // Additional fallback: Check integrationSettings collection
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
        }
      }      // Check Webex connection
      const webexConnections = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('webexConnections')
        .where('type', '==', 'organization')
        .where('isActive', '==', true)
        .limit(1)
        .get();

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

      console.log(`✅ [VideoConferencing HTTP] Returning ${providers.length} provider(s) for org: ${organizationId}`);      res.status(200).json({
        success: true,
        providers,
        defaultProvider: providers.find(p => p.isDefault)?.type || null,
      });

    } catch (error: any) {
      console.error('❌ [VideoConferencing HTTP] Error getting providers:', error);
      setCorsHeaders(res, req.headers.origin);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get providers',
      });
    }
  }
);