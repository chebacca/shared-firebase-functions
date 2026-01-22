# Secret Manager Setup Guide

## Overview

This guide explains how to set up Google Cloud Secret Manager for Firebase Functions after migrating from the deprecated `functions.config()` API.

**Deadline:** December 31, 2025 - Deployments using `functions.config()` will fail after this date.

## Prerequisites

- Google Cloud SDK (`gcloud`) installed and authenticated
- Firebase project: `backbone-logic`
- Appropriate permissions to create secrets

## Required Secrets

### 1. GEMINI_API_KEY
```bash
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY \
  --project=backbone-logic \
  --replication-policy="automatic" \
  --data-file=-
```

### 2. GOOGLE_MAPS_API_KEY
```bash
echo -n "your-google-maps-api-key" | gcloud secrets create GOOGLE_MAPS_API_KEY \
  --project=backbone-logic \
  --replication-policy="automatic" \
  --data-file=-
```

### 3. ENCRYPTION_KEY
```bash
# Generate a secure 32-character encryption key
ENCRYPTION_KEY=$(openssl rand -hex 16)
echo -n "$ENCRYPTION_KEY" | gcloud secrets create ENCRYPTION_KEY \
  --project=backbone-logic \
  --replication-policy="automatic" \
  --data-file=-
```

### 4. INTEGRATIONS_ENCRYPTION_KEY
```bash
# Generate a secure 32-character encryption key
INTEGRATIONS_KEY=$(openssl rand -hex 16)
echo -n "$INTEGRATIONS_KEY" | gcloud secrets create INTEGRATIONS_ENCRYPTION_KEY \
  --project=backbone-logic \
  --replication-policy="automatic" \
  --data-file=-
```

### 5. GOOGLE_OAUTH_CONFIG (JSON Secret)
```bash
# Create a JSON file with Google OAuth credentials
cat > google-oauth-config.json << EOF
{
  "client_id": "your-client-id.apps.googleusercontent.com",
  "client_secret": "your-client-secret",
  "redirect_uri": "https://backbone-client.web.app/auth/google/callback"
}
EOF

# Create the secret
gcloud secrets create GOOGLE_OAUTH_CONFIG \
  --project=backbone-logic \
  --replication-policy="automatic" \
  --data-file=google-oauth-config.json

# Clean up the local file
rm google-oauth-config.json
```

## Grant Access to Firebase Service Account

After creating all secrets, grant the Firebase Functions service account access:

```bash
# Get your Firebase service account email
FIREBASE_SA="backbone-logic@appspot.gserviceaccount.com"

# Grant access to all secrets
for SECRET in GEMINI_API_KEY GOOGLE_MAPS_API_KEY ENCRYPTION_KEY INTEGRATIONS_ENCRYPTION_KEY GOOGLE_OAUTH_CONFIG; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --project=backbone-logic \
    --member="serviceAccount:$FIREBASE_SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

## Verify Secrets

```bash
# List all secrets
gcloud secrets list --project=backbone-logic

# View secret metadata
gcloud secrets describe GEMINI_API_KEY --project=backbone-logic

# Test access (will show the secret value)
gcloud secrets versions access latest --secret=GEMINI_API_KEY --project=backbone-logic
```

## Update Existing Secrets

If you need to update a secret value:

```bash
# Add a new version to an existing secret
echo -n "new-api-key-value" | gcloud secrets versions add GEMINI_API_KEY \
  --project=backbone-logic \
  --data-file=-

# The new version becomes active immediately
```

## Environment Variables for Local Development

For local development, create a `.env.backbone-logic` file:

```bash
# Copy the example file
cp .env.backbone-logic.example .env.backbone-logic

# Edit with your local development values
# IMPORTANT: Never commit this file to git!
```

## Migration from functions.config()

If you have existing values in `functions.config()`, export them first:

```bash
# Export current config
firebase functions:config:get > current-config.json

# Review the values
cat current-config.json

# Manually migrate to Secret Manager using the commands above
# IMPORTANT: Delete current-config.json after migration (contains secrets!)
rm current-config.json
```

## Troubleshooting

### Secret Not Found Error
```
Error: Secret not found or access denied
```
**Solution:** Verify the secret exists and the service account has access:
```bash
gcloud secrets describe SECRET_NAME --project=backbone-logic
gcloud secrets get-iam-policy SECRET_NAME --project=backbone-logic
```

### Permission Denied
```
Error: Permission denied accessing secret
```
**Solution:** Grant the service account access:
```bash
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --project=backbone-logic \
  --member="serviceAccount:backbone-logic@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Secret Value Not Updating
**Solution:** Secrets are versioned. Add a new version:
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --project=backbone-logic \
  --data-file=-
```

## Security Best Practices

1. **Never commit secrets to git** - Always use `.gitignore` for `.env.*` files
2. **Rotate secrets regularly** - Update secret versions periodically
3. **Use least privilege** - Only grant access to secrets that functions need
4. **Audit access** - Review IAM policies regularly
5. **Use Secret Manager in production** - Environment variables are for local development only

## Next Steps

After setting up secrets:

1. Deploy functions: `firebase deploy --only functions`
2. Test in staging environment
3. Monitor logs for any configuration errors
4. Deploy to production
5. Remove old `functions.config()` values (optional, they'll be ignored)

## References

- [Firebase Functions Config & Environment](https://firebase.google.com/docs/functions/config-env)
- [Google Cloud Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Migration Guide](./FUNCTIONS_CONFIG_MIGRATION_GUIDE.md)
