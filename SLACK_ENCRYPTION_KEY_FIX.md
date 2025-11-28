# Slack Encryption Key "Invalid Key Length" Error Fix

## Issue

You're seeing the error:
```
Failed to authenticate with Slack: Invalid key length. Please re-connect your Slack workspace.
```

This error occurs when the `ENCRYPTION_KEY` secret is not properly configured in Firebase Secrets Manager, or the key is invalid.

## Root Cause

The Slack integration uses AES-256-GCM encryption to securely store Slack access tokens. The encryption key must be:
1. Set as a Firebase Secret named `ENCRYPTION_KEY`
2. At least 32 characters long (recommended: 64 hex characters)
3. Declared in the function's `secrets` array

## Solution

### Step 1: Generate an Encryption Key

Generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

This will output a 64-character hex string. Save this value securely.

### Step 2: Set the Secret in Firebase

```bash
cd shared-firebase-functions

# Set the secret (you'll be prompted to enter the key)
firebase functions:secrets:set ENCRYPTION_KEY

# When prompted, paste the hex key you generated
```

### Step 3: Verify Functions Are Using the Secret

All Slack functions should already declare the secret in their configuration. Verify that these functions include `secrets: [encryptionKey]`:

- `slackOAuthInitiate`
- `slackOAuthCallback`
- `slackOAuthRefresh`
- `slackRevokeAccess`
- `slackListChannels`
- `slackGetChannelHistory`
- `slackGetWorkspaceInfo`
- `slackSendMessage`
- `slackAddReaction`
- `slackGetThreadReplies`
- `slackUploadFile`

### Step 4: Redeploy Functions

After setting the secret, redeploy the Slack functions:

```bash
cd shared-firebase-functions
npm run build
firebase deploy --only functions:slackOAuthInitiate,functions:slackOAuthCallback,functions:slackOAuthRefresh,functions:slackRevokeAccess,functions:slackListChannels,functions:slackGetChannelHistory,functions:slackGetWorkspaceInfo,functions:slackSendMessage,functions:slackAddReaction,functions:slackGetThreadReplies,functions:slackUploadFile
```

Or deploy all functions:

```bash
firebase deploy --only functions
```

### Step 5: Verify Fix

1. Try syncing Slack channels again
2. Check Firebase Function logs for any encryption key errors
3. The error should now be resolved

## What We Fixed

1. ✅ Enhanced error handling in `decryptToken()` to catch "Invalid key length" errors
2. ✅ Added validation for encryption key format and length
3. ✅ Improved error messages to clearly indicate the encryption key issue
4. ✅ Added better logging to help diagnose encryption key problems
5. ✅ Updated both `api.ts` and `oauth.ts` with consistent error handling

## Troubleshooting

### Check if Secret is Set

```bash
firebase functions:secrets:access ENCRYPTION_KEY
```

If this fails, the secret is not set.

### Check Function Logs

```bash
firebase functions:log --only slackListChannels
```

Look for errors mentioning "Invalid key length" or "Encryption key".

### If Secret Was Changed

If you changed the encryption key, **existing Slack connections will need to be reconnected** because their tokens were encrypted with the old key. Users will need to:

1. Disconnect their Slack workspace
2. Reconnect it (which will encrypt the new token with the new key)

## Security Notes

- ⚠️ **Never commit the encryption key to version control**
- ⚠️ **Never log the encryption key in production**
- ⚠️ **Use Firebase Secrets Manager for production deployments**
- ⚠️ **Generate a unique key for each environment (dev/staging/prod)**

## Additional Resources

- [Firebase Secrets Manager Documentation](https://firebase.google.com/docs/functions/config-env#secret-manager)
- [Slack Encryption Setup Guide](./SLACK_ENCRYPTION_SETUP.md)

