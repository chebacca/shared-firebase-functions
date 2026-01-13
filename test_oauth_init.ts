
import * as admin from 'firebase-admin';
import { oauthService } from './src/integrations/unified-oauth/OAuthService';
import { providerRegistry } from './src/integrations/unified-oauth/ProviderRegistry';

// Initialize Firebase Admin for local testing
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'backbone-logic'
    });
}

async function testInitiate() {
    console.log('🧪 [Test] Starting OAuth Initiation Test...');

    const provider = 'dropbox';
    const organizationId = 'backbone'; // Use a known org ID or placeholder
    const userId = 'test-user-id';
    const returnUrl = 'http://localhost:4001/dashboard/integrations';

    try {
        console.log(`🧪 [Test] Calling oauthService.initiateOAuth for ${provider}...`);
        const result = await oauthService.initiateOAuth(provider, organizationId, userId, returnUrl);

        console.log('✅ [Test] Success!');
        console.log('🔗 [Test] Generated Auth URL:', result.authUrl);
        console.log('🆔 [Test] State:', result.state);

        // Verify URL parameters
        const url = new URL(result.authUrl);
        console.log('📋 [Test] URL Parameters:');
        url.searchParams.forEach((value, key) => {
            console.log(`   - ${key}: ${key === 'state' ? value.substring(0, 10) + '...' : value}`);
        });

        if (url.searchParams.get('redirect_uri') === 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback') {
            console.log('🎯 [Test] Redirect URI matches whitelisted production URL!');
        } else {
            console.error('❌ [Test] Redirect URI MISMATCH!');
        }

    } catch (error) {
        console.error('❌ [Test] Failed:', error);
    }
}

testInitiate();
