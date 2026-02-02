# Firebase Functions v5 → v6 Migration Plan

This document outlines a phased plan to upgrade `shared-firebase-functions` from **firebase-functions v5.1.1** to **v6+** so deploy warnings are resolved and the codebase uses the current SDK.

---

## Current status (in progress)

- **Phase 0**: Prep done (v2 options helper + config audit already completed).
- **Phase 1**: Main API migrated to v2 `onRequest` — **DONE**.
- **Phase 2**: **DONE** — All v1 callables/HTTP migrated. Remaining index/config/logger-only files updated: logger switched to `firebase-functions/v2` in qc, integrations (airtable, airtableSyncQueue), auth/generateAuthTransferToken, clipShowPro (scriptVersionSync, syncSubscriptionAddOns); unused v1 imports removed from index-minimal, index-google-http, googleDriveOnly, google/config, apple/config, videoConferencing/googleMeet, workflow/utils/environment; ml/DocumentAIService uses env-only (no config()). **Only** `auth/unifiedAuth.ts` still imports `firebase-functions/v1` for the (optional) v1 auth trigger — intentional.
- **Phase 3**: Firestore triggers migrated — **DONE**.
- **Phase 4**: v2 callable signatures (request/auth/data) — **DONE** (done as part of Phase 2).
- **Phase 5**: **DONE** — No default `firebase-functions` or `functions.config()` in src; logger from `firebase-functions/v2`; only v1 import left is `firebase-functions/v1` in unifiedAuth for auth trigger.
- **Phase 6**: **DONE** — Catalog bumped to `firebase-functions: ^7.0.0` in pnpm-workspace.yaml (was ^6.0.0; v7 clears the emulator “outdated firebase-functions” warning); `pnpm install` and `pnpm run build` in shared-firebase-functions both pass.

**Build**: `pnpm run build` in shared-firebase-functions passes with firebase-functions v7. **Emulator**: `firebase emulators:start --only functions` loads all functions; the “package.json indicates an outdated version” warning is resolved with v7. **Note**: If you see “Your requested node version 22 doesn’t match your global version 20”, use Node 22 (e.g. `nvm use 22`) or accept the emulator using host Node 20.

---

## 1. Why migrate?

- **Deploy warning**: “package.json indicates an outdated version of firebase-functions”
- **Node 20 deprecation**: Already addressed by `firebase.json` runtime `nodejs22`; v6 works with Node 22
- **Long-term**: v5 will age out; v6 is the supported path (params, v2-first APIs)

---

## 2. What breaks in v6?

| Area | v5 (current) | v6 (target) |
|------|----------------|-------------|
| **Default import** | `import * as functions from 'firebase-functions'` exposes both v1 and v2 | Default export is **v2-only**; no `functions.runWith`, `functions.https`, `functions.firestore` |
| **V1 HTTP** | `functions.runWith({ memory, timeout, secrets }).https.onRequest(app)` | Use v2: `onRequest({ memory, timeoutSeconds, secrets }, app)` from `firebase-functions/v2/https` |
| **V1 callable** | `functions.runWith({ memory }).https.onCall((data, context) => ...)` | Use v2: `onCall({ memory }, (request) => ...)`; auth via `request.auth` |
| **Callable handler signature** | `(data: T, context: CallableContext)` with `context.auth` | `(request: CallableRequest<T>)` with `request.auth` and `request.data` |
| **CallableContext type** | From `firebase-functions/v2/https` | Replaced by `CallableRequest` / `CallableResponse`; no `CallableContext` export |
| **Firestore triggers (v1)** | `functions.firestore.document('col/{id}').onUpdate((change, context) => ...)` | Use v2: `onDocumentUpdated('col/{id}', (event) => ...)`; event has `event.data`, `event.params` |
| **functions.config()** | Supported | Deprecated; use `defineString()` / `defineSecret()` from `firebase-functions/params` |

---

## 3. Scope (rough counts)

- **~52 files** still use `import * as functions from 'firebase-functions'` (v1 API or config).
- **~240+ files** touch callable/HTTP/triggers; many already use v2 imports but may use `context.auth` or `CallableContext` and need type/signature updates.
- **V1-only areas**: main `api` (Express), auth (exchangeHubToken, unifiedAuth, syncUserClaimsOnLogin), workflow (proxyFileDownload, sendDeliveryPackageEmail, onWorkflowStepUpdate), callSheets (publish, disable, syncDailyRecordToPublished), box/files, dropbox/files, googleDrive, licensing/sessions/datasets/projects/payments CRUD, callsheet personnel, pageInfo, etc.

---

## 4. Phased plan

### Phase 0: Prep and config (no SDK bump yet)

- [x] **0.1** Create a shared v2 options helper (**DONE** — `src/lib/functionOptions.ts`) (e.g. `lib/functionOptions.ts`) for common `memory`, `timeoutSeconds`, `secrets` so every function doesn’t repeat them.
- [x] **0.2** Audit `functions.config()` usage (see FUNCTIONS_CONFIG_MIGRATION_COMPLETE.md): list all keys and replace with `firebase-functions/params` (`defineString`, `defineSecret`) and env. Document in this repo; Firebase Console migration can follow [Firebase config migration](https://firebase.google.com/docs/functions/config-env#migrate-config).
- [ ] **0.3** Snapshot current tests/emulator flows that hit auth, callable, and HTTP endpoints so you can validate after each phase.

**Deliverable**: List of config keys to migrate; optional helper module; test checklist.

---

### Phase 1: Migrate v1 HTTP (Express `api` and other v1 HTTP)

**Goal**: Replace the single v1 HTTP entrypoint (`api`) and any other v1 HTTP with v2 `onRequest`.

- [x] **api** — `src/api/index.ts` migrated to `onRequest(apiHttpOptions, app)` from `firebase-functions/v2/https`.

**Files** (primary):

- `src/api/index.ts` — main Express API ~~(currently `functions.runWith({...}).https.onRequest(app)`)~~ **DONE**.

**Steps**:

1. In `api/index.ts`:
   - Remove `import * as functions from 'firebase-functions'`.
   - Add `import { onRequest } from 'firebase-functions/v2/https';` and, if needed, `import { defineSecret } from 'firebase-functions/params';`.
   - Replace  
     `functions.runWith({ timeoutSeconds: 300, memory: '2GB', secrets: [...] }).https.onRequest(app)`  
     with  
     `onRequest({ timeoutSeconds: 300, memory: '2GiB', secrets: ['INTEGRATIONS_ENCRYPTION_KEY', 'GOOGLE_MAPS_API_KEY', 'GEMINI_API_KEY'] }, app)`.
   - Note: v2 often uses `memory: '2GiB'` (GiB). Confirm Firebase docs for exact string.
2. Search for any other `functions.https.onRequest` or `functions.runWith(...).https.onRequest` and convert similarly.
3. Run build and smoke-test the main API URL (e.g. `/health`, a protected route).

**Deliverable**: All v1 HTTP endpoints moved to v2 `onRequest`; build green; API smoke tests pass.

---

### Phase 2: Migrate v1 callables (runWith + onCall)

**Goal**: Replace every v1 callable (`functions.runWith(...).https.onCall` or `functions.https.onCall`) with v2 `onCall` and update handler signatures.

**Files** (v1 callable / v1 import, non-exhaustive):

- `src/auth/exchangeHubToken.ts`
- `src/auth/unifiedAuth.ts` (syncUserClaimsOnLogin and others)
- `src/workflow/delivery/sendDeliveryPackageEmail.ts`
- `src/workflow/delivery/proxyFileDownload.ts`
- `src/callSheets/publishCallSheet.ts`, `disablePublishedCallSheet.ts`
- `src/callSheets/syncDailyRecordToPublished.ts` (if it exposes callable; else Phase 3)
- `src/box/files.ts`, `src/dropbox/files.ts`
- `src/integrations/googleDrive.ts`, `src/integrations/googleDriveHttp.ts`, `src/integrations/archived/googleDriveMinimal.ts`, `src/integrations/encryption.ts`
- `src/google/config.ts`, `src/apple/config.ts`, `src/dropbox/oauth.ts`, `src/videoConferencing/googleMeet.ts` (if they use v1 callables)
- `src/budgeting/matchTemplates.ts`
- `src/auth/migrateLastActive.ts`, `src/auth/register.ts`, `src/auth/verify.ts`, `src/auth/login.ts`, `src/auth/updateEDLConverterClaims.ts`
- `src/functions/pageInfo.ts`
- `src/licensing/*.ts`, `src/sessions/*.ts`, `src/datasets/*.ts`, `src/projects/*.ts`, `src/payments/*.ts`
- `src/callsheet/personnel.ts`
- `src/updateUserActivity.ts`
- `src/index-minimal.ts`, `src/index-google-http.ts`, `src/googleDriveOnly.ts` (if they export v1 callables)

**Steps** (per file):

1. Remove `import * as functions from 'firebase-functions'` (and any v1-only import).
2. Add `import { onCall, HttpsError } from 'firebase-functions/v2/https';`.
3. Replace:
   - `functions.runWith({ memory: '1GB' }).https.onCall(async (data, context) => { ... })`  
   - with:  
   - `onCall({ memory: '1GiB' }, async (request) => { const data = request.data; const auth = request.auth; ... })`.
4. Inside handler: use `request.auth` instead of `context.auth`, and `request.data` instead of `data`. Guard `request.auth` (e.g. `if (!request.auth) throw new HttpsError('unauthenticated', '...')`).
5. If the file only had v1 callables, delete the `functions` import entirely.

**Deliverable**: No remaining v1 callables; all use v2 `onCall` with `(request)`; build green.

---

### Phase 3: Migrate v1 Firestore (and other v1) triggers

**Goal**: Replace `functions.firestore.document(...).onUpdate/onCreate/onDelete` and `functions.document` with v2 Firestore triggers.

- [x] **workflowTriggers.ts** — migrated to `onDocumentUpdated('workflowSteps/{stepId}', ...)` from `firebase-functions/v2/firestore`.
- [x] **syncDailyRecordToPublished.ts** — migrated to `onDocumentUpdated('dailyCallSheetRecords/{recordId}', ...)`.

**Files** (v1 firestore):

- `src/workflow/triggers/workflowTriggers.ts` — ~~v1~~ **DONE**.
- `src/callSheets/syncDailyRecordToPublished.ts` — ~~v1~~ **DONE**.

**Steps**:

1. **workflowTriggers.ts**
   - Replace with:  
     `import { onDocumentUpdated } from 'firebase-functions/v2/firestore';`  
     `export const onWorkflowStepUpdate = onDocumentUpdated('workflowSteps/{stepId}', (event) => { ... });`
   - In handler: `event.data` is a change object (e.g. `event.data?.after.data()`, `event.data?.before.data()`); `event.params` holds `stepId`. Map old `change`/`context` logic to `event`.
2. **syncDailyRecordToPublished.ts**
   - If it uses v1 `functions.document(...).onCreate/onUpdate/onDelete`, switch to `onDocumentCreated` / `onDocumentUpdated` / `onDocumentDeleted` from `firebase-functions/v2/firestore` and adapt handler to `event`.
3. Search repo for any remaining `functions.firestore`, `functions.document`, or `from 'firebase-functions/v1'` and convert similarly.

**Deliverable**: All Firestore triggers on v2; no v1 trigger imports; build green.

---

### Phase 4: Fix v2 callable types and handler signatures

**Goal**: Many files already use v2 `onCall` but still use `(data, context)` and `context.auth`. In v6, the second argument is not `CallableContext`; use `CallableRequest` and optional chaining.

**Pattern**:

- **Old (v5 style, still common)**:  
  `onCall(async (data, context) => { if (!context.auth) ...; const uid = context.auth.uid; ... })`
- **New (v6)**:  
  `onCall(async (request) => { if (!request.auth) ...; const uid = request.auth.uid; const data = request.data; ... })`

**Steps**:

1. Grep for `context\.auth`, `context\.app`, and `CallableContext` in `shared-firebase-functions/src`.
2. For each callable handler:
   - Change signature from `(data, context)` to `(request)`.
   - Use `request.data` for the first argument and `request.auth` (and optional chaining) instead of `context.auth`.
   - Replace `CallableContext` types with `CallableRequest<YourData>` (and remove `CallableContext` imports).
3. Fix `request.data` typing where handlers expect a specific shape (e.g. `request.data as { folderId: string }` or a proper generic `CallableRequest<{ folderId: string }>`).

**High-impact files** (from earlier build errors): `auth/unifiedAuth.ts`, `box/files.ts`, `dropbox/files.ts`, `integrations/archived/googleDriveMinimal.ts`, `integrations/googleDrive.ts`, `callsheet/personnel.ts`, plus any other file that uses `context.auth` or `CallableContext`.

**Deliverable**: No `context.auth` or `CallableContext`; all callables use `(request)` and `request.auth`/`request.data`; build green.

---

### Phase 5: Remove remaining v1 imports and config()

**Goal**: No file should import from `'firebase-functions'` (default) or `'firebase-functions/v1'` for trigger/HTTP/callable logic. Any `functions.config()` must be replaced by params/env.

**Steps**:

1. Grep for `from 'firebase-functions'` and `from 'firebase-functions/v1'` (excluding comments). Convert any remaining usage to v2 imports (or delete if unused).
2. Grep for `functions.config()`; replace with `defineString()`/`defineSecret()` and env vars. If config is read in many places, consider one small `config.ts` that uses params and re-exports values.
3. Ensure `logger` usage: if any code uses `functions.logger`, switch to `import { logger } from 'firebase-functions/v2';` (or the path your v6 docs specify).

**Deliverable**: No v1 imports for runtime behavior; no `functions.config()`; build green.

---

### Phase 6: Bump SDK and lockfile

**Goal**: Upgrade to firebase-functions v6 and fix any remaining type or runtime issues.

**Steps**:

1. In `pnpm-workspace.yaml` (catalog), set `firebase-functions: ^6.0.0` (or `^6.1.0`).
2. In `shared-firebase-functions/package.json`, keep `"firebase-functions": "catalog:default"`.
3. Run `pnpm install --no-frozen-lockfile` at repo root.
4. Run `pnpm run build` in `shared-firebase-functions`. Fix any new TypeScript or lint errors (often in edge cases or less-used modules).
5. Run emulator and your Phase 0 test checklist (auth, callable, HTTP, Firestore triggers).
6. Deploy to a dev/project first; then production.

**Deliverable**: Build and tests pass; deploy succeeds; no “outdated firebase-functions” warning.

---

### Phase 7 (optional): v7 and Node 22

- After v6 is stable, consider moving to firebase-functions v7 if you need latest features.
- Runtime is already `nodejs22` in `firebase.json`; no change needed for Node.

---

## 5. Suggested order of execution

1. **Phase 0** — Prep, config audit, test checklist.  
2. **Phase 1** — api (single high-impact HTTP).  
3. **Phase 2** — v1 callables (auth, workflow, callSheets, box, dropbox, google, etc.).  
4. **Phase 3** — v1 Firestore triggers (workflowTriggers, syncDailyRecordToPublished).  
5. **Phase 4** — v2 callable signatures and types across the repo.  
6. **Phase 5** — Remove remaining v1 and config().  
7. **Phase 6** — Bump to v6, install, build, test, deploy.

Do **not** bump to v6 before Phases 1–5 are done; otherwise the build will fail (as seen with `runWith` and `CallableContext`).

---

## 6. Risk and rollback

- **Risk**: Large surface area (240+ files); regressions in auth or callable behavior.
- **Mitigation**: Migrate in phases; run tests and smoke checks after each phase; deploy to dev first.
- **Rollback**: Keep `firebase-functions` at `5.1.1` and `runtime: nodejs22` until migration is fully validated; revert catalog and lockfile if needed.

---

## 7. Quick reference: v1 → v2 patterns

| v1 | v2 |
|----|-----|
| `functions.runWith({ memory: '256MB' }).https.onRequest(app)` | `onRequest({ memory: '256MiB' }, app)` |
| `functions.runWith({ memory: '1GB' }).https.onCall((data, context) => ...)` | `onCall({ memory: '1GiB' }, (request) => { const data = request.data; const auth = request.auth; ... })` |
| `functions.firestore.document('c/{id}').onUpdate((change, context) => ...)` | `onDocumentUpdated('c/{id}', (event) => { const after = event.data?.after.data(); const params = event.params; ... })` |
| `context.auth.uid` | `request.auth?.uid` |
| `functions.config().key.value` | `defineString('KEY').value()` or env var |

---

## 8. File list: v1 import (52 files) — migrate in Phase 2–5

- api/index.ts  
- auth/exchangeHubToken.ts, unifiedAuth.ts, migrateLastActive.ts, register.ts, verify.ts, login.ts, updateEDLConverterClaims.ts  
- workflow/delivery/proxyFileDownload.ts, sendDeliveryPackageEmail.ts  
- workflow/triggers/workflowTriggers.ts  
- workflow/utils/environment.ts  
- callSheets/disablePublishedCallSheet.ts, publishCallSheet.ts, syncDailyRecordToPublished.ts  
- box/files.ts  
- dropbox/files.ts, oauth.ts  
- integrations/googleDrive.ts, googleDriveHttp.ts, encryption.ts, archived/googleDriveMinimal.ts  
- google/config.ts  
- apple/config.ts  
- videoConferencing/googleMeet.ts  
- budgeting/matchTemplates.ts  
- licensing/create.ts, delete.ts, list.ts, update.ts  
- sessions/create.ts, delete.ts, list.ts, update.ts  
- datasets/create.ts, delete.ts, list.ts, update.ts  
- projects/create.ts, delete.ts, list.ts, update.ts, datasets.ts  
- payments/create.ts, delete.ts, list.ts, update.ts  
- callsheet/personnel.ts  
- functions/pageInfo.ts  
- updateUserActivity.ts  
- index-minimal.ts, index-google-http.ts, googleDriveOnly.ts  

Use this list to tick off files as you migrate and to avoid missing a v1 usage.
