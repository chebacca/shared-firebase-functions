# 🔍 Debug: Google OAuth redirect_uri_mismatch for Port 4001

## Current Error
```
Error 400: redirect_uri_mismatch
redirect_uri: http://localhost:4001/integration-settings
client_id: 749245129278-vnepq570jrh5ji94c9olshc282bj1l86.apps.googleusercontent.com
```

## Step 1: Verify Firebase Function Logs

The function has extensive logging. Check Firebase Console:

**Direct Link**: https://console.firebase.google.com/project/backbone-logic/functions/logs

**Filter by**: `initiateGoogleOAuthHttp`

**Look for these log entries**:
1. `[googleDrive] ✅ Using Firestore config for OAuth` - Shows client ID and redirect URI
2. `[googleDrive] 📋 OAuth initiation request details` - Shows full client ID and redirect URI
3. `[googleDrive] ⚠️ CRITICAL DEBUG - Authorization URL generated` - Shows the EXACT redirect URI sent to Google

**Critical fields to check**:
- `clientId`: Should be `749245129278-vnepq570jrh5ji94c9olshc282bj1l86.apps.googleusercontent.com`
- `redirectUriInAuthUrl`: The EXACT URI sent to Google (should be `http://localhost:4001/integration-settings`)
- `storedRedirectUri`: The URI from the request (should match)
- `matches`: Should be `true`

## Step 2: Verify Google Cloud Console Configuration

**Direct Link**: https://console.cloud.google.com/apis/credentials?project=backbone-logic

1. Find OAuth 2.0 Client ID: `749245129278-vnepq570jrh5ji94c9olshc282bj1l86`
2. Click **Edit** (pencil icon)
3. Scroll to **Authorized redirect URIs**
4. Verify this EXACT URI exists (character-by-character):
   ```
   http://localhost:4001/integration-settings
   ```

**Common Issues**:
- ❌ Trailing slash: `http://localhost:4001/integration-settings/`
- ❌ Wrong protocol: `https://localhost:4001/integration-settings`
- ❌ Trailing space: `http://localhost:4001/integration-settings `
- ❌ Wrong port: `http://localhost:4010/integration-settings`
- ❌ Typo in path: `http://localhost:4001/integration_settings` (underscore)

## Step 3: Verify Firestore Configuration

Check what's stored in Firestore:

**Collection Path**: `organizations/clip-show-pro-productions/integrationSettings/google`

**Fields to verify**:
- `clientId`: Should match the OAuth client ID above
- `redirectUri`: This is just for reference - the function uses the request redirect URI
- `isConfigured`: Should be `true`

## Step 4: Test the Function Directly

When you click "Connect to Google Drive" in the app, the function should log:

```
[googleDrive] ⚠️ CRITICAL DEBUG - Authorization URL generated: {
  redirectUriInAuthUrl: "http://localhost:4001/integration-settings",
  storedRedirectUri: "http://localhost:4001/integration-settings",
  matches: true,
  clientId: "749245129278-vnepq570jrh5ji94c9olshc282bj1l86.apps.googleusercontent.com",
  ...
}
```

**If `matches: false`**, there's a mismatch in the function itself.

**If `matches: true` but still getting error**, the redirect URI is not authorized in Google Cloud Console.

## Step 5: Double-Check OAuth Client

**Possible Issues**:
1. **Multiple OAuth Clients**: You might have multiple OAuth clients. Verify you're editing the correct one.
2. **Client ID Mismatch**: The client ID in Firestore might not match the one in Google Cloud Console.
3. **Project Mismatch**: The OAuth client might be in a different Google Cloud project.

## Step 6: Verify After Changes

After making changes in Google Cloud Console:
1. Click **SAVE** (don't just close the dialog)
2. Wait **1-2 minutes** for changes to propagate
3. Clear browser cache (Cmd+Shift+R or Ctrl+Shift+R)
4. Try the OAuth flow again

## Quick Verification Checklist

- [ ] Checked Firebase function logs for `redirectUriInAuthUrl`
- [ ] Verified `redirectUriInAuthUrl` is exactly `http://localhost:4001/integration-settings`
- [ ] Verified `clientId` in logs matches `749245129278-vnepq570jrh5ji94c9olshc282bj1l86`
- [ ] Opened Google Cloud Console credentials page
- [ ] Found OAuth client with matching client ID
- [ ] Verified `http://localhost:4001/integration-settings` is in Authorized redirect URIs (character-by-character)
- [ ] Clicked SAVE in Google Cloud Console
- [ ] Waited 1-2 minutes
- [ ] Cleared browser cache
- [ ] Tried OAuth flow again

## If Still Not Working

1. **Check for URL encoding issues**: The redirect URI should NOT be URL-encoded when added to Google Cloud Console
2. **Check for multiple OAuth clients**: List all OAuth clients and verify which one is being used
3. **Check project**: Verify you're in the correct Google Cloud project (`backbone-logic`)
4. **Check OAuth consent screen**: Verify the OAuth consent screen is configured correctly

