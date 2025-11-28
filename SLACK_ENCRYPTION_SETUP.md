# Slack Integration Encryption Setup

## Overview

The Slack integration requires secure encryption of access tokens to protect workspace data. All Slack OAuth tokens are encrypted using AES-256-GCM before being stored in Firestore.

## Current Status

⚠️ **Encryption key needs to be configured for Slack functions to work**

## Setup Instructions

### Step 1: Generate Encryption Key

Generate a secure 32-byte encryption key:

```bash
# Generate a secure 32-byte hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save the output - you'll need it in the next step.

### Step 2: Set Encryption Key in Firebase

#### Option A: Using Firebase Secrets Manager (Recommended)

```bash
# Store the key as a secret
firebase functions:secrets:set ENCRYPTION_KEY

# Then in code, access it via:
import { getSecret } from 'firebase-functions/params';

const ENCRYPTION_KEY = getSecret('ENCRYPTION_KEY');
```

#### Option B: Using Legacy Firebase Config

```bash
# Set the encryption key in Firebase config
firebase functions:config:set integrations.encryption_key="YOUR_HEX_KEY_HERE"

# Deploy the updated config
firebase deploy --only functions
```

### Step 3: Redeploy Functions

After setting the encryption key, redeploy the Slack functions:

```bash
cd shared-firebase-functions
npm run build
firebase deploy --only functions:slackListChannels,functions:slackGetChannelHistory,functions:slackGetWorkspaceInfo
```

### Step 4: Verify Setup

Check Firebase Function logs to verify:

```bash
firebase functions:log --only slackListChannels
```

You should see no encryption key errors in the logs.

## Error Messages

If you see this error:
```
❌ [SlackAPI] ENCRYPTION_KEY is not configured! Using default key is insecure.
```

This means the encryption key is not set. Follow the setup instructions above.

## Security Notes

1. **Never commit the encryption key to version control**
2. **Never log the encryption key in production**
3. **Use Firebase Secrets Manager for production deployments**
4. **Rotate the key periodically for enhanced security**

## How Encryption Works

1. **OAuth Flow**: When a user connects Slack, the access token is received
2. **Encryption**: Token is encrypted using AES-256-GCM with a random IV
3. **Storage**: Encrypted token is stored in Firestore as: `iv:authTag:encryptedData`
4. **Decryption**: When needed, the token is decrypted using the encryption key
5. **Usage**: Decrypted token is used to make Slack API calls

## Files Involved

- `src/slack/api.ts` - Slack API functions with encryption/decryption
- `src/slack/oauth.ts` - OAuth flow with token encryption
- `src/slack/config.ts` - Configuration management

## Troubleshooting

### "Failed to decrypt token" Error

1. Verify encryption key is set: `firebase functions:config:get`
2. Check that the key hasn't changed (new key won't decrypt old tokens)
3. Re-connect Slack workspace if key has changed

### "Connection not found" Error

1. Verify the connection exists in Firestore
2. Check that the organization ID is correct
3. Ensure the connection is marked as `isActive: true`

### 500 Internal Server Error

1. Check Firebase Functions logs for detailed error messages
2. Verify the encryption key is correctly configured
3. Ensure `@slack/web-api` package is installed
4. Check that Slack credentials are valid

## Testing

Test the Slack integration:

```bash
# From the Clip Show Pro app, navigate to:
# Integration Settings > Slack

# Click "Connect Slack"
# Complete OAuth flow
# Verify channels sync without errors
```

## Need Help?

If you continue to have issues:
1. Check Firebase Function logs
2. Verify encryption key is set correctly
3. Check Slack connection data in Firestore
4. Review error messages for specific guidance


