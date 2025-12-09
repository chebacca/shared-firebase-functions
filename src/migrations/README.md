# Cloud Integrations Migration Guide

## Overview

This migration moves Box and Dropbox connections from the old `cloudIntegrations` collection to the new `{provider}Connections` collections, following the Slack integration pattern.

## What Gets Migrated

### Box Connections
- **From**: `organizations/{orgId}/cloudIntegrations/box` (or `box_org`, `box_{userId}`)
- **To**: `organizations/{orgId}/boxConnections/{connectionId}`

### Dropbox Connections
- **From**: `organizations/{orgId}/cloudIntegrations/dropbox` (or `dropbox_{userId}`)
- **To**: `organizations/{orgId}/dropboxConnections/{connectionId}`

### Google Drive Connections
- **From**: `organizations/{orgId}/cloudIntegrations/google` (or `google_{userId}`)
- **To**: `organizations/{orgId}/googleConnections/{connectionId}`

## Migration Process

### 1. Run Migration Function

#### Option A: Callable Function (Recommended)
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const migrateConnections = httpsCallable(getFunctions(), 'migrateCloudIntegrations');

// Migrate all providers for your organization
const result = await migrateConnections({
  provider: 'all' // or 'box', 'dropbox', or 'google'
});

console.log('Migration result:', result.data);
```

#### Option B: HTTP Endpoint
```bash
curl -X POST https://us-central1-<project-id>.cloudfunctions.net/migrateCloudIntegrationsHttp \
  -H "Authorization: Bearer <firebase-id-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "your-org-id",
    "provider": "all" // or "box", "dropbox", "google"
  }'
```

### 2. Verify Migration

Check the migration results:
- `results.box.migrated` - Number of Box connections migrated
- `results.dropbox.migrated` - Number of Dropbox connections migrated
- `results.google.migrated` - Number of Google Drive connections migrated
- `results.box.errors` - Any errors during Box migration
- `results.dropbox.errors` - Any errors during Dropbox migration
- `results.google.errors` - Any errors during Google Drive migration

### 3. Test Connections

After migration, test that:
- Box connections still work (list folders, files, etc.)
- Dropbox connections still work (list folders, files, etc.)
- Google Drive connections still work (list folders, files, etc.)
- OAuth flows work with new structure
- **Note**: Google Drive tokens may need to be refreshed after migration if encryption keys weren't available during migration

### 4. Cleanup (After Verification)

Once you've verified everything works:

1. **Mark old documents for deletion** (they're already marked with `_migrated: true`)
2. **Remove fallback logic** from:
   - `shared-firebase-functions/src/box.ts` (lines ~1175-1200)
   - `shared-firebase-functions/src/dropbox.ts` (similar locations)
   - Context files that check `cloudIntegrations`

3. **Delete old documents** (optional, after sufficient time):
   ```typescript
   // Run this after confirming all connections work
   const oldDocs = await db
     .collection('organizations')
     .doc(orgId)
     .collection('cloudIntegrations')
     .where('_migrated', '==', true)
     .get();
   
   for (const doc of oldDocs.docs) {
     await doc.ref.delete();
   }
   ```

## Safety Features

- **Idempotent**: Running migration multiple times is safe - it skips already-migrated connections
- **Non-destructive**: Old documents are marked but not deleted
- **Error handling**: Errors are logged but don't stop the migration
- **Verification**: Checks for existing connections before creating new ones

## Rollback

If you need to rollback:
1. The old documents still exist (marked with `_migrated: true`)
2. You can restore them by removing the `_migrated` flag
3. The old API functions still work with `cloudIntegrations` (backward compatibility)

## Timeline

1. **Week 1**: Deploy migration function, run for all organizations
2. **Week 2**: Monitor and verify all connections work
3. **Week 3**: Remove fallback logic from code
4. **Week 4+**: Delete old `cloudIntegrations` documents (optional)

