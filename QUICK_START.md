# Quick Start: Secret Manager Setup

## 🚀 Fast Track (5 minutes)

### Step 1: Export Current Config (Optional)
If you have existing `functions.config()` values:

```bash
cd shared-firebase-functions
./scripts/export-functions-config.sh
# Review the exported file, then delete it after migration
```

### Step 2: Create Secrets
Run the interactive setup script:

```bash
cd shared-firebase-functions
./scripts/setup-secrets.sh
```

This will:
- ✅ Prompt for API keys (Gemini, Google Maps)
- ✅ Auto-generate encryption keys
- ✅ Create Google OAuth config
- ✅ Grant service account access

### Step 3: Verify Setup
```bash
./scripts/verify-secrets.sh
```

### Step 4: Deploy & Test
```bash
# Deploy functions
firebase deploy --only functions --project backbone-logic

# Monitor logs
firebase functions:log --project backbone-logic
```

## 📋 Manual Setup (Alternative)

If you prefer manual setup, see [`SECRET_MANAGER_SETUP.md`](SECRET_MANAGER_SETUP.md)

## ✅ Checklist

- [ ] Secrets created in Secret Manager
- [ ] Service account has access
- [ ] Verified with `verify-secrets.sh`
- [ ] Functions deployed
- [ ] Tested in staging
- [ ] All integrations working
- [ ] No errors in logs

## 🆘 Troubleshooting

**Secret not found?**
```bash
./scripts/verify-secrets.sh
```

**Permission denied?**
```bash
# Grant access manually
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --project=backbone-logic \
  --member="serviceAccount:backbone-logic@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Need to update a secret?**
```bash
echo -n "new-value" | gcloud secrets versions add SECRET_NAME \
  --project=backbone-logic \
  --data-file=-
```

## 📚 Full Documentation

- **Setup Guide:** [`SECRET_MANAGER_SETUP.md`](SECRET_MANAGER_SETUP.md)
- **Migration Guide:** [`FUNCTIONS_CONFIG_MIGRATION_GUIDE.md`](FUNCTIONS_CONFIG_MIGRATION_GUIDE.md)
- **Migration Summary:** [`MIGRATION_COMPLETED.md`](MIGRATION_COMPLETED.md)
