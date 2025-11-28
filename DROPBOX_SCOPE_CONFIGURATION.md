# Dropbox OAuth Scope Configuration

## Issue
"Dropbox API error (400)" occurs when the scopes requested don't match what's enabled in your Dropbox app, or when using a manually generated token that doesn't have the required permissions.

## Solution

### Step 1: Check Your Dropbox App Configuration

1. Go to your Dropbox Developer Console: https://www.dropbox.com/developers/apps
2. Select your app (or create a new one)
3. Go to **"Permissions"** tab
4. Ensure the following scopes are **enabled**:
   - ✅ **files.content.read** - Read file contents
   - ✅ **files.content.write** - Write/modify files  
   - ✅ **files.metadata.read** - Read file/folder metadata
   - ✅ **files.metadata.write** - Modify file/folder metadata
   - ✅ **sharing.read** - Read sharing information
   - ✅ **sharing.write** - Manage sharing

### Step 2: Verify Redirect URI

1. In your Dropbox app settings, go to **"Settings"** tab
2. Under **"OAuth 2"** → **"Redirect URIs"**, ensure you have:
   - For production: `https://clipshowpro.web.app/integration-settings`
   - For development: `http://localhost:4010/integration-settings`
   - Or your actual deployment URL

### Step 3: Important Notes About Manual Tokens

⚠️ **If you're using a manually generated token from Dropbox Console:**

- Manually generated tokens from the Dropbox console may **NOT have all required scopes**
- These tokens are typically for testing and may only have basic permissions
- **Recommended**: Use the OAuth flow instead of manual tokens to ensure all scopes are granted

### Step 4: Using OAuth Flow (Recommended)

Instead of manually setting a token, use the OAuth flow:

1. In Integration Settings, click **"Connect"** for Dropbox
2. This will initiate the OAuth flow which requests all required scopes
3. The user will be prompted to authorize the app with the correct permissions
4. The token will automatically have all required scopes

### Step 5: Verify Token Has Required Scopes

After connecting via OAuth, you can verify the token has the right scopes by checking the Firebase logs. The token validation should show:
- ✅ Token validated successfully
- ✅ Account information retrieved
- ✅ Files/folders can be listed

## Common Issues

### Issue 1: "Dropbox API error (400): Response failed with a 400 code"
**Cause**: Token doesn't have required scopes or app doesn't have permissions enabled
**Solution**: 
- Enable all required scopes in Dropbox app settings
- Reconnect using OAuth flow (don't use manual token)

### Issue 2: "Invalid Dropbox access token"
**Cause**: Token is invalid, expired, or doesn't have required permissions
**Solution**:
- Disconnect and reconnect Dropbox using OAuth flow
- Ensure all scopes are enabled in Dropbox app

### Issue 3: Manual token works for account info but not file operations
**Cause**: Manual token doesn't have `files.content.read` or `files.metadata.read` scopes
**Solution**: Use OAuth flow instead of manual token

## Required Scopes Summary

The following scopes are **required** for full Dropbox integration functionality:

```
files.content.read      - Required for reading file contents
files.content.write     - Required for uploading/modifying files
files.metadata.read     - Required for listing folders and files
files.metadata.write    - Required for creating folders
sharing.read            - Required for reading sharing information
sharing.write           - Required for managing sharing
```

## Testing

After configuring scopes:

1. Go to Integration Settings
2. Click "Connect" for Dropbox (or reconnect if already connected)
3. Complete the OAuth flow
4. Try browsing Dropbox folders in "Browse Cloud Folders for Indexing"
5. You should see your Dropbox folders listed without errors

## Troubleshooting

If you still get errors after enabling scopes:

1. **Disconnect and reconnect**: Remove the Dropbox integration and reconnect using OAuth
2. **Check app status**: Ensure your Dropbox app is not in "Development" mode if you need production access
3. **Verify redirect URI**: Make sure the redirect URI in Dropbox app matches exactly (including http/https, port numbers, etc.)
4. **Check Firebase logs**: Look for detailed error messages in Firebase Function logs

