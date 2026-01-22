# Next Steps - Secret Manager Setup

## ✅ Code Migration: COMPLETE

All `functions.config()` usage has been removed from active code. The codebase is ready for Secret Manager setup.

## 🎯 Immediate Next Steps

### 1. Set Up Secret Manager (15-30 minutes)

**Option A: Interactive Script (Recommended)**
```bash
cd shared-firebase-functions
./scripts/setup-secrets.sh
```

**Option B: Manual Setup**
Follow [`SECRET_MANAGER_SETUP.md`](SECRET_MANAGER_SETUP.md)

### 2. Verify Setup (2 minutes)
```bash
./scripts/verify-secrets.sh
```

### 3. Local Development (Optional)
```bash
# Copy example file
cp env.backbone-logic.example .env.backbone-logic

# Edit with your values
nano .env.backbone-logic
```

**⚠️ IMPORTANT:** Never commit `.env.backbone-logic` to git!

### 4. Test Locally (Optional)
```bash
# Start Firebase emulator
firebase emulators:start --only functions

# Test your functions
# Verify no config errors in logs
```

### 5. Deploy to Staging
```bash
# Deploy functions
firebase deploy --only functions --project backbone-logic

# Monitor logs
firebase functions:log --project backbone-logic --limit 50
```

### 6. Test All Integrations
- [ ] Google OAuth flow
- [ ] Gemini API calls
- [ ] Google Maps API
- [ ] Encryption/decryption
- [ ] All other integrations

### 7. Deploy to Production
```bash
firebase deploy --only functions --project backbone-logic
```

### 8. Monitor (48 hours)
- [ ] Check error rates
- [ ] Verify all integrations working
- [ ] No `functions.config()` warnings
- [ ] Performance metrics normal

## 📊 Progress Tracking

### Completed ✅
- [x] Code migration (9 files)
- [x] Documentation created
- [x] Helper scripts created
- [x] Environment template created

### Pending ⏳
- [ ] Secret Manager setup
- [ ] Local testing
- [ ] Staging deployment
- [ ] Production deployment
- [ ] 48-hour monitoring

## 🛠️ Helper Scripts

All scripts are in `scripts/` directory:

1. **`setup-secrets.sh`** - Interactive Secret Manager setup
2. **`verify-secrets.sh`** - Verify all secrets exist and are accessible
3. **`export-functions-config.sh`** - Export current `functions.config()` values

## 📚 Documentation

- **Quick Start:** [`QUICK_START.md`](QUICK_START.md) - Fast track setup
- **Secret Manager Setup:** [`SECRET_MANAGER_SETUP.md`](SECRET_MANAGER_SETUP.md) - Detailed guide
- **Migration Guide:** [`FUNCTIONS_CONFIG_MIGRATION_GUIDE.md`](FUNCTIONS_CONFIG_MIGRATION_GUIDE.md) - Complete reference
- **Migration Summary:** [`MIGRATION_COMPLETED.md`](MIGRATION_COMPLETED.md) - What was changed

## 🆘 Need Help?

### Common Issues

**"Secret not found" error**
```bash
./scripts/verify-secrets.sh
# Check if secret exists and service account has access
```

**"Permission denied" error**
```bash
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --project=backbone-logic \
  --member="serviceAccount:backbone-logic@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Functions not accessing secrets**
- Verify secrets are created
- Check service account permissions
- Ensure functions are deployed after secret creation
- Check Firebase Functions logs

### Getting Support

1. Check [`SECRET_MANAGER_SETUP.md`](SECRET_MANAGER_SETUP.md) troubleshooting section
2. Review Firebase Functions logs: `firebase functions:log`
3. Verify secrets: `gcloud secrets list --project=backbone-logic`

## ⏰ Timeline

- **Code Migration:** ✅ Complete (January 2025)
- **Secret Manager Setup:** ⏳ 15-30 minutes
- **Testing:** ⏳ 1-2 days
- **Production Deployment:** ⏳ 1 day
- **Monitoring:** ⏳ 48 hours
- **Deadline:** December 31, 2025 (11 months remaining)

## 🎉 Success Criteria

You're done when:
- ✅ All secrets created in Secret Manager
- ✅ Service account has access
- ✅ Functions deployed successfully
- ✅ All integrations tested and working
- ✅ No errors in logs
- ✅ 48-hour monitoring period complete

---

**Ready to start?** Run: `./scripts/setup-secrets.sh`
