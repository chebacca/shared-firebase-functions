# AI API Key Security Documentation

## 🔒 Security Overview

API keys are now encrypted using **AES-256-GCM** encryption before being stored in Firestore. This ensures maximum security and privacy for user credentials.

## 🔐 Encryption Process

### Server-Side Encryption (Recommended - Production)

1. **Frontend sends plaintext key** to Firebase Function `storeAIApiKey` over HTTPS
2. **Firebase Function encrypts** the key using AES-256-GCM with:
   - Master encryption key from Firebase Config (`integrations.encryption_key`)
   - PBKDF2 key derivation (100,000 iterations)
   - Random salt (64 bytes)
   - Random IV (16 bytes)
   - Authentication tag for integrity
3. **Encrypted key is stored** in Firestore
4. **Encryption key never leaves the server**

### Storage Locations

- **Organization-level keys**: `organizations/{orgId}/aiApiKeys/{service}`
- **User-level overrides**: `users/{userId}/aiApiKeys/{service}`

## 🔑 Encryption Key Configuration

The encryption key must be configured in Firebase Config:

```bash
firebase functions:config:set integrations.encryption_key="your-32-byte-hex-key"
```

**IMPORTANT**: 
- Generate a secure random 32-byte key: `openssl rand -hex 32`
- Store this key securely (never commit to git)
- Rotate the key periodically for enhanced security

## 📋 Usage

### Storing API Keys

**Frontend:**
```typescript
import { AIApiKeysSecurityService } from '@/services/integrations/AIApiKeysSecurityService';

const securityService = new AIApiKeysSecurityService();

// Organization-level key (admin only)
await securityService.storeApiKey(
  organizationId,
  'openai',
  'sk-...', // Plaintext key
  'gpt-4'
);

// User-level override
await securityService.storeUserApiKey(
  userId,
  organizationId,
  'openai',
  'sk-...', // Plaintext key
  'gpt-4'
);
```

**Backend (Firebase Function):**
```typescript
const { storeAIApiKey } = require('./ai');
// Called automatically by frontend service
```

### Retrieving API Keys

**Backend (Firebase Functions only):**
```typescript
import { getAIApiKey } from './utils/aiHelpers';

const keyData = await getAIApiKey(organizationId, 'openai', userId);
// Returns: { apiKey: 'decrypted-key', model: 'gpt-4', source: 'org' | 'user' }
```

**Frontend:**
- Frontend should NOT decrypt keys directly
- Use Firebase Functions that handle decryption server-side
- Example: `aiChatAssistant` Firebase Function decrypts keys internally

## ⚠️ Legacy Support

For backward compatibility, the frontend service still supports base64-encoded keys (legacy). However:
- **New keys MUST use the secure Firebase Function**
- Legacy base64 keys will show deprecation warnings
- All new keys are encrypted with AES-256-GCM

## 🛡️ Security Best Practices

1. **Never expose encryption keys** to the frontend
2. **Always use HTTPS** when transmitting API keys
3. **Rotate encryption keys** periodically (every 90 days recommended)
4. **Use organization-level keys** for shared resources
5. **Use user-level keys** only when personal overrides are needed
6. **Monitor API key usage** and revoke compromised keys immediately
7. **Implement rate limiting** on API key storage functions
8. **Audit key access** through Firestore security rules

## 🔍 Decryption Process (Server-Side Only)

1. Retrieve encrypted key from Firestore
2. Extract salt, IV, and auth tag from encrypted data
3. Derive key using PBKDF2 with stored salt
4. Decrypt using AES-256-GCM with derived key and IV
5. Verify authentication tag
6. Return decrypted key (never store decrypted key)

## 📝 Implementation Details

### Encryption Algorithm
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Size**: 256 bits (32 bytes)
- **IV Size**: 16 bytes
- **Salt Size**: 64 bytes
- **Auth Tag Size**: 16 bytes
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations

### File Locations
- **Encryption Utility**: `shared-firebase-functions/src/integrations/encryption.ts`
- **Store Function**: `shared-firebase-functions/src/ai/storeAIApiKey.ts`
- **Helper Functions**: `shared-firebase-functions/src/ai/utils/aiHelpers.ts`
- **Frontend Service**: `_clip_show_pro_-v1.0/packages/web-browser/src/services/integrations/AIApiKeysSecurityService.ts`

## ✅ Security Checklist

- [x] API keys encrypted with AES-256-GCM
- [x] Encryption happens server-side only
- [x] Encryption key stored in Firebase Config (not in code)
- [x] HTTPS used for all API key transmission
- [x] Firestore security rules restrict access
- [x] Organization-level keys require admin permissions
- [x] User-level keys isolated per user
- [x] Audit logging for key access
- [x] Key rotation support
- [x] Legacy base64 support with deprecation warnings

## 🚨 Incident Response

If an API key is compromised:
1. **Immediately revoke** the key in Integration Settings
2. **Generate new API key** from the provider
3. **Store new key** using the secure function
4. **Notify affected users** if organization-level key
5. **Review audit logs** for unauthorized access
6. **Rotate encryption key** if master key was compromised













