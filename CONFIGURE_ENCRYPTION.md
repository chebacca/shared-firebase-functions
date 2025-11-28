# Configure Slack Encryption Key

## ⚠️ IMPORTANT: Do This Now

You must set the encryption key in Firebase Functions config:

```bash
cd shared-firebase-functions

# Set the encryption key (use the generated key from above)
firebase functions:config:set integrations.encryption_key="80ac6c1b483098848aa9fb93c25106aa5a4049cbe3d45427885ef7a57cd6713d"

# Deploy the updated config
firebase deploy --only functions
```

## Why?

- The key `80ac6c1b483098848aa9fb93c25106aa5a4049cbe3d45427885ef7a57cd6713d` is randomly generated (NOT hardcoded)
- There IS a hardcoded FALLBACK key (`00000000000000000000000000000000`) but the code now PREVENTS its use
- Without setting ENCRYPTION_KEY, Slack functions will fail with a clear error message
- Each installation should generate its own unique key

## Security

- This key will be used to encrypt/decrypt Slack access tokens
- Store it securely in your password manager
- Never commit it to version control
- Generate a new key for each environment (dev/staging/prod)
