# 🔧 Fix Google Drive OAuth Configuration Error

## Current Configuration

Your Firebase Functions currently has these Google OAuth credentials configured:
- **Client ID**: `YOUR_CLIENT_ID_HERE`
- **Client Secret**: `YOUR_CLIENT_SECRET_HERE`
- **Redirect URI**: `https://backbone-client.web.app/auth/google/callback`

## Error

The error "Invalid OAuth client configuration" occurs during token refresh, which means:
1. The OAuth client credentials might be incorrect or the client was deleted/disabled
2. The redirect URI might not be authorized in Google Cloud Console
3. The refresh token might be invalid or revoked

## Solution Steps

### Option 1: Verify and Update OAuth Client in Google Cloud Console

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project (likely `backbone-logic` or the project associated with client ID `749245129278`)

2. **Navigate to OAuth Credentials**
   - Go to: **APIs & Services** → **Credentials**
   - Find the OAuth 2.0 Client ID: `check Firebase Functions config`

3. **Verify Configuration**
   - Check that the client is **Enabled**
   - Verify **Authorized redirect URIs** includes:
     - `https://backbone-client.web.app/auth/google/callback`
     - `http://localhost:4010/auth/google/callback` (for development)
     - `http://localhost:4010/integration-settings` (for OAuth callback)

4. **If Client is Missing or Disabled**
   - Create a new OAuth 2.0 Client ID
   - Application type: **Web application**
   - Add authorized redirect URIs (see above)
   - Copy the new Client ID and Client Secret

5. **Update Firebase Functions Config**
   ```bash
   cd "/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master"
   
   # Update with new credentials
   firebase functions:config:set \
     google.client_id="YOUR_NEW_CLIENT_ID" \
     google.client_secret="YOUR_NEW_CLIENT_SECRET" \
     google.redirect_uri="https://backbone-client.web.app/auth/google/callback"
   
   # Redeploy functions to apply changes
   cd shared-firebase-functions
   pnpm install
   npm run build
   cd ..
   firebase deploy --only functions
   ```

### Option 2: Use Environment Variables (Firebase Functions v2)

If you're using Firebase Functions v2, set environment variables instead:

```bash
# Set environment variables
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_REDIRECT_URI

# Or set via Firebase Console:
# 1. Go to Firebase Console → Functions → Configuration
# 2. Add environment variables:
#    - GOOGLE_CLIENT_ID = your_client_id
#    - GOOGLE_CLIENT_SECRET = your_client_secret
#    - GOOGLE_REDIRECT_URI = https://backbone-client.web.app/auth/google/callback
```

### Option 3: Reconnect Google Drive Integration

If the OAuth client is correct but refresh tokens are invalid:

1. **Disconnect Google Drive** in Integration Settings
2. **Reconnect** to generate new refresh tokens
3. This will create a fresh OAuth flow with valid tokens

## Verification

After updating credentials:

1. **Check Functions Logs**
   ```bash
   firebase functions:log --only refreshGoogleAccessTokenCallable
   ```

2. **Test Token Refresh**
   - Go to Integration Settings
   - The Google Drive connection should refresh automatically
   - Check console for errors

3. **Verify Connection**
   - The connection should show as "Connected" with no refresh errors
   - Token refresh should work automatically

## Common Issues

### Issue: "invalid_client" error
**Solution**: The Client ID or Client Secret is incorrect. Verify in Google Cloud Console and update Firebase config.

### Issue: "redirect_uri_mismatch" error
**Solution**: The redirect URI in Firebase config doesn't match what's authorized in Google Cloud Console. Add the exact redirect URI to authorized URIs.

### Issue: "invalid_grant" error
**Solution**: The refresh token is invalid or revoked. User needs to reconnect Google Drive to get a new refresh token.

### Issue: OAuth client not found
**Solution**: The OAuth client was deleted in Google Cloud Console. Create a new one and update Firebase config.

## Current Status

✅ **Credentials are configured** in Firebase Functions
❌ **Token refresh is failing** - likely due to:
   - OAuth client configuration mismatch
   - Invalid/revoked refresh tokens
   - Redirect URI not authorized

**Next Step**: Verify the OAuth client in Google Cloud Console matches the configured credentials, then reconnect Google Drive if needed.

