# Firebase Functions Config Migration Guide

## ⚠️ Critical Deadline: December 31, 2025

**After December 31, 2025, new deployments using `functions.config()` will FAIL.**

The Cloud Runtime Configuration API (which powers `functions.config()`) will be shut down. Existing deployments may continue to run, but you **must migrate** before deploying any updates.

---

## 📋 Current State Analysis

### Instances Found
- **48 instances** of `functions.config()` usage across the codebase
- Some files already have fallback to `process.env` (good!)
- Some files use `defineSecret()` from `firebase-functions/params` (already migrated!)

### Files Using `functions.config()`

**High Priority (Direct Usage):**
- `src/integrations/googleDriveHttp.ts` - Lines 15-17 (Google OAuth credentials)
- `src/integrations/unified-oauth/providers/GoogleProvider.ts` - Line 297
- `src/google/config.ts` - Lines 159-164 (fallback to functions.config)
- `src/videoConferencing/googleMeet.ts` - Lines 38-39
- `src/integrations/encryption.ts` - Lines 32-42
- `src/workflow/utils/environment.ts` - Lines 61-62 (with warning)
- `modules/api-network-delivery/src/routes/networkDelivery.ts` - Lines 129, 326

**Medium Priority (Scripts/Test Files):**
- Various scripts in `scripts/` directory
- Test files

---

## 🎯 Migration Strategy

Firebase provides **two main approaches** for replacing `functions.config()`:

### 1. Parameterized Configuration (Recommended)
Use `firebase-functions/params` for:
- **Secrets** (API keys, credentials) → `defineSecret()`
- **Nested config objects** → `defineJsonSecret()`
- **Deploy-time validation** → `defineString()`, `defineInt()`, etc.

### 2. Environment Variables (.env files)
Use `.env` files for:
- **Non-sensitive configuration** (URLs, flags, tuning parameters)
- **Runtime-only values** that don't need deploy-time validation

---

## 📚 Migration Patterns

### Pattern 1: Simple String Config → Parameterized

**Before:**
```typescript
import * as functions from 'firebase-functions';

const apiKey = functions.config().api.gemini_key;
```

**After (Option A - Secret):**
```typescript
import { defineSecret } from 'firebase-functions/params';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

// In function definition:
export const myFunction = onRequest(
  { secrets: [geminiApiKey] },
  (req, res) => {
    const key = geminiApiKey.value();
    // Use key...
  }
);
```

**After (Option B - Environment Variable):**
```typescript
// In .env file:
// GEMINI_API_KEY=your-key-here

// In code:
const apiKey = process.env.GEMINI_API_KEY;
```

### Pattern 2: Nested Config → JSON Secret

**Before:**
```typescript
const config = functions.config();
const clientId = config.google.client_id;
const clientSecret = config.google.client_secret;
const redirectUri = config.google.redirect_uri;
```

**After:**
```typescript
import { defineJsonSecret } from 'firebase-functions/params';

const googleConfig = defineJsonSecret('GOOGLE_OAUTH_CONFIG');

// In function:
export const myFunction = onRequest(
  { secrets: [googleConfig] },
  (req, res) => {
    const { client_id, client_secret, redirect_uri } = googleConfig.value();
    // Use config...
  }
);
```

**Secret Manager JSON format:**
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "redirect_uri": "https://your-app.com/callback"
}
```

### Pattern 3: Environment Variable with Fallback

**Before:**
```typescript
const config = functions.config();
const apiKey = process.env.GEMINI_API_KEY || config?.api?.gemini_key;
```

**After:**
```typescript
// Remove functions.config() fallback
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}
```

---

## 🔧 Step-by-Step Migration Plan

### Phase 1: Audit & Document (Week 1)
- [x] Identify all `functions.config()` usages (48 instances found)
- [ ] Document current config structure:
  - `functions.config().google.*` (client_id, client_secret, redirect_uri)
  - `functions.config().api.*` (gemini_key, google_maps_key)
  - `functions.config().encryption.*` (key)
  - `functions.config().integrations.*` (encryption_key)
- [ ] Export current config values (securely!)

### Phase 2: Set Up Secrets & Environment Variables (Week 1-2)

#### For Secrets (use Secret Manager):
```bash
# Set up secrets in Google Cloud Secret Manager
gcloud secrets create GEMINI_API_KEY --data-file=- <<< "your-api-key"
gcloud secrets create GOOGLE_MAPS_API_KEY --data-file=- <<< "your-api-key"
gcloud secrets create INTEGRATIONS_ENCRYPTION_KEY --data-file=- <<< "your-encryption-key"
gcloud secrets create ENCRYPTION_KEY --data-file=- <<< "your-encryption-key"

# For nested Google OAuth config:
gcloud secrets create GOOGLE_OAUTH_CONFIG --data-file=google-oauth.json
```

#### For Environment Variables (use .env files):
Create `.env.backbone-logic` in `shared-firebase-functions/`:
```bash
# Non-sensitive config
GOOGLE_REDIRECT_URI=https://backbone-client.web.app/auth/google/callback
NODE_ENV=production
```

### Phase 3: Migrate High-Priority Files (Week 2-3)

#### Priority 1: Google OAuth Configuration
**Files:**
- `src/integrations/googleDriveHttp.ts`
- `src/google/config.ts`
- `src/integrations/unified-oauth/providers/GoogleProvider.ts`

**Action:**
- Create `GOOGLE_OAUTH_CONFIG` JSON secret in Secret Manager
- Update code to use `defineJsonSecret('GOOGLE_OAUTH_CONFIG')`
- Remove `functions.config().google.*` usage

#### Priority 2: Encryption Keys
**Files:**
- `src/integrations/encryption.ts`
- `src/google/secrets.ts` (already using `defineSecret` - good!)

**Action:**
- Ensure `INTEGRATIONS_ENCRYPTION_KEY` and `ENCRYPTION_KEY` are in Secret Manager
- Update `encryption.ts` to remove `functions.config()` fallback
- Use existing `defineSecret` pattern from `secrets.ts`

#### Priority 3: API Keys
**Files:**
- `modules/api-network-delivery/src/routes/networkDelivery.ts`
- `src/workflow/utils/environment.ts`

**Action:**
- Migrate `GEMINI_API_KEY` to use `defineSecret()` (already done in some files!)
- Migrate `GOOGLE_MAPS_API_KEY` to use `defineSecret()` (already done in `src/iwm/index.ts`!)
- Update `environment.ts` to remove `functions.config()` fallback

### Phase 4: Migrate Remaining Files (Week 3-4)
- [ ] Update all remaining files with `functions.config()` usage
- [ ] Update test files and scripts
- [ ] Remove deprecated imports

### Phase 5: Testing & Validation (Week 4)
- [ ] Test locally with Firebase emulator
- [ ] Verify secrets are accessible
- [ ] Test deployment to staging
- [ ] Validate all integrations work correctly

### Phase 6: Cleanup (Week 5)
- [ ] Remove all `functions.config()` calls
- [ ] Remove unused imports
- [ ] Update documentation
- [ ] Deploy to production

---

## 📝 File-Specific Migration Examples

### Example 1: `src/integrations/googleDriveHttp.ts`

**Current:**
```typescript
const GOOGLE_CLIENT_ID = functions.config().google?.client_id;
const GOOGLE_CLIENT_SECRET = functions.config().google?.client_secret;
const REDIRECT_URI = functions.config().google?.redirect_uri || 'https://backbone-client.web.app/auth/google/callback';
```

**Migrated:**
```typescript
import { defineJsonSecret } from 'firebase-functions/params';

const googleOAuthConfig = defineJsonSecret('GOOGLE_OAUTH_CONFIG');

// In function:
export const initiateGoogleOAuthHttp = onRequest(
  { secrets: [googleOAuthConfig] },
  async (req, res) => {
    const config = googleOAuthConfig.value();
    const GOOGLE_CLIENT_ID = config.client_id;
    const GOOGLE_CLIENT_SECRET = config.client_secret;
    const REDIRECT_URI = config.redirect_uri || 'https://backbone-client.web.app/auth/google/callback';
    
    // Rest of function...
  }
);
```

### Example 2: `src/integrations/encryption.ts`

**Current:**
```typescript
function getEncryptionKey(): string {
  const envKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey;
  }

  try {
    const config = functions.config();
    const key = config?.integrations?.encryption_key;
    if (key && key.trim().length > 0) {
      return key;
    }
  } catch (error) {
    console.warn('⚠️ [encryption] functions.config() not available, trying environment variables');
  }

  throw new Error('Encryption key not configured...');
}
```

**Migrated:**
```typescript
import { defineSecret } from 'firebase-functions/params';

const encryptionKeySecret = defineSecret('INTEGRATIONS_ENCRYPTION_KEY');

// Note: This function needs to be called within a function context that has the secret bound
function getEncryptionKey(): string {
  // Try environment variable first (for backward compatibility)
  const envKey = process.env.INTEGRATIONS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey;
  }

  // Use secret parameter (must be in function with secret bound)
  try {
    return encryptionKeySecret.value();
  } catch (error) {
    throw new Error('Encryption key not configured. Set INTEGRATIONS_ENCRYPTION_KEY in Secret Manager or environment variable.');
  }
}

// Functions using encryption must bind the secret:
export const myFunction = onRequest(
  { secrets: [encryptionKeySecret] },
  async (req, res) => {
    const key = getEncryptionKey(); // Will use secret
    // Use key...
  }
);
```

### Example 3: `src/workflow/utils/environment.ts`

**Current:**
```typescript
export function getEnvironmentConfig(): EnvironmentConfig {
  let config: any = {};
  
  try {
    config = functions.config();
    console.warn('⚠️  Using deprecated functions.config() - migrate to .env files before March 2026');
  } catch (error) {
    console.log('✅ Using .env files for configuration');
  }
  
  return {
    geminiApiKey: 
      process.env.GEMINI_API_KEY || 
      process.env.REACT_APP_GEMINI_API_KEY || 
      config.api?.gemini_key || 
      '',
    // ... rest
  };
}
```

**Migrated:**
```typescript
// Remove functions.config() entirely
export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    geminiApiKey: 
      process.env.GEMINI_API_KEY || 
      process.env.REACT_APP_GEMINI_API_KEY || 
      '',
    // ... rest (remove all config.api.* references)
  };
}
```

---

## 🔐 Secret Manager Setup

### Creating Secrets via CLI

```bash
# Single value secrets
echo -n "your-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "your-encryption-key" | gcloud secrets create INTEGRATIONS_ENCRYPTION_KEY --data-file=-

# JSON secret for nested config
cat > google-oauth.json << EOF
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "redirect_uri": "https://backbone-client.web.app/auth/google/callback"
}
EOF
gcloud secrets create GOOGLE_OAUTH_CONFIG --data-file=google-oauth.json
rm google-oauth.json

# Grant Firebase Functions service account access
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:backbone-logic@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Updating Secrets

```bash
# Update existing secret
echo -n "new-api-key" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

---

## 📁 .env File Structure

Create `.env.backbone-logic` in `shared-firebase-functions/`:

```bash
# API Keys (non-sensitive or already in Secret Manager)
# Note: Sensitive keys should use Secret Manager, not .env files

# Application Config
NODE_ENV=production
FIREBASE_PROJECT_ID=backbone-logic

# URLs
GOOGLE_REDIRECT_URI=https://backbone-client.web.app/auth/google/callback

# Feature Flags
DEBUG=false
VERBOSE_LOGGING=false

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# WebSocket Config
MAX_WEBSOCKET_CONNECTIONS=1000
CONNECTION_TIMEOUT_MS=300000
```

**Important:** 
- Never commit `.env.*` files with secrets to git
- Add `.env*` to `.gitignore` (except `.env.example`)
- Use Secret Manager for all sensitive values

---

## ✅ Migration Checklist

### Pre-Migration
- [ ] Export current `functions.config()` values securely
- [ ] Document all config keys and their purposes
- [ ] Identify which values are secrets vs. non-sensitive

### Secret Manager Setup
- [ ] Create `GEMINI_API_KEY` secret
- [ ] Create `GOOGLE_MAPS_API_KEY` secret
- [ ] Create `INTEGRATIONS_ENCRYPTION_KEY` secret
- [ ] Create `ENCRYPTION_KEY` secret
- [ ] Create `GOOGLE_OAUTH_CONFIG` JSON secret
- [ ] Grant Firebase service account access to all secrets

### Code Migration
- [ ] Migrate `src/integrations/googleDriveHttp.ts`
- [ ] Migrate `src/google/config.ts`
- [ ] Migrate `src/integrations/unified-oauth/providers/GoogleProvider.ts`
- [ ] Migrate `src/integrations/encryption.ts`
- [ ] Migrate `src/workflow/utils/environment.ts`
- [ ] Migrate `modules/api-network-delivery/src/routes/networkDelivery.ts`
- [ ] Migrate `src/videoConferencing/googleMeet.ts`
- [ ] Migrate all scripts in `scripts/` directory
- [ ] Update test files

### Testing
- [ ] Test locally with Firebase emulator
- [ ] Verify all secrets are accessible
- [ ] Test Google OAuth flow
- [ ] Test encryption/decryption
- [ ] Test API integrations (Gemini, Google Maps)
- [ ] Deploy to staging and validate

### Cleanup
- [ ] Remove all `functions.config()` calls
- [ ] Remove unused `firebase-functions` v1 imports
- [ ] Update documentation
- [ ] Deploy to production

---

## 🚨 Important Notes

1. **Deadline:** December 31, 2025 - After this date, deployments using `functions.config()` will fail
2. **Existing Deployments:** May continue to run, but you cannot deploy updates without migrating
3. **Secrets vs. Environment Variables:**
   - Use **Secret Manager** (`defineSecret`) for sensitive data (API keys, credentials)
   - Use **.env files** (`process.env`) for non-sensitive config (URLs, flags)
4. **Binding Secrets:** Functions using `defineSecret()` must bind secrets in function options: `{ secrets: [mySecret] }`
5. **Testing:** Always test locally with Firebase emulator before deploying

---

## 📚 References

- [Firebase Config & Environment Variables Docs](https://firebase.google.com/docs/functions/config-env)
- [Parameterized Configuration API](https://firebase.google.com/docs/reference/functions/firebase-functions.params)
- [Secret Manager Integration](https://firebase.google.com/docs/functions/config-env#secret-manager)
- [Migration from functions.config()](https://firebase.google.com/docs/functions/config-env#migrating_from_functionsconfig)

---

## 🆘 Need Help?

If you encounter issues during migration:
1. Check Firebase Functions logs: `firebase functions:log`
2. Verify secrets are accessible: `gcloud secrets versions access latest --secret=SECRET_NAME`
3. Test locally with emulator: `firebase emulators:start --only functions`
4. Review function deployment status in Firebase Console

---

**Last Updated:** December 2024  
**Target Completion:** Before December 31, 2025
