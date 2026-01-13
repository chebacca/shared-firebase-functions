
import { DropboxProvider } from './src/integrations/unified-oauth/providers/DropboxProvider';

async function testUrlGeneration() {
    console.log('🧪 [Test] Starting Dropbox URL Generation Test...');

    const provider = new DropboxProvider();

    // Mock config to avoid Firestore call
    provider.getConfig = async () => ({
        clientId: 'MOCK_DROPBOX_APP_KEY',
        clientSecret: 'MOCK_DROPBOX_APP_SECRET',
        additionalParams: {
            redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
        }
    });

    const params = {
        organizationId: 'test-org',
        state: 'test-state-abc-123',
        redirectUri: 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback'
    };

    try {
        const authUrl = await provider.getAuthUrl(params);
        console.log('\n✅ [Test] Generated Dropbox Auth URL:');
        console.log(authUrl);

        const url = new URL(authUrl);
        console.log('\n📋 [Test] Parameter Verification:');
        console.log(`   - client_id:     ${url.searchParams.get('client_id')}`);
        console.log(`   - redirect_uri:  ${url.searchParams.get('redirect_uri')}`);
        console.log(`   - response_type: ${url.searchParams.get('response_type')}`);
        console.log(`   - state:         ${url.searchParams.get('state')}`);
        console.log(`   - token_access_type: ${url.searchParams.get('token_access_type')}`);

        if (url.searchParams.get('redirect_uri') === 'https://us-central1-backbone-logic.cloudfunctions.net/handleOAuthCallback') {
            console.log('\n🎯 [SUCCESS] The redirect_uri is CORRECTly configured for current whitelisted URL.');
        } else {
            console.log('\n❌ [FAILURE] The redirect_uri is INCORRECT.');
        }

    } catch (error) {
        console.error('❌ [Test] Error:', error);
    }
}

testUrlGeneration();
