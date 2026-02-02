# Functions verification summary

Quick checklist to confirm all functions are present, updated, and working.

## 1. Build

- **Entry:** `shared-firebase-functions` → `lib/index.js` (from `src/index.ts`)
- **Verify:** `cd shared-firebase-functions && pnpm run build` → exits 0
- **Status:** ✅ Build passes

## 2. No v1 in source

- **Check:** No `firebase-functions/v1` or `functionsV1` in `src/`
- **Status:** ✅ No v1 imports; all triggers use v2 (https, identity, firestore, scheduler)

## 3. Auth trigger (onUserLoginTrigger)

- **File:** `src/auth/unifiedAuth.ts`
- **Implementation:** v2 `beforeUserCreated` from `firebase-functions/v2/identity`, 512MiB
- **Requires:** Identity Platform (GCIP) enabled on the Firebase project
- **Exported:** Yes (`index.ts` → `auth` → `unifiedAuth`)
- **Status:** ✅ Updated and exported

## 4. Default options

- **Callables:** `defaultCallableOptions` in `lib/functionOptions.ts` → 1GiB memory
- **API:** `apiHttpOptions` → 2GiB, 300s, secrets
- **Identity trigger:** `onUserLoginTrigger` uses explicit `{ memory: '512MiB' }`

## 5. Exports

- **Main index:** `src/index.ts` exports 94+ blocks (auth, api, clipShowPro, timecards, slack, etc.)
- **Auth exports:** `refreshAuthClaims`, `onUserLoginTrigger`, `syncUserClaimsOnLogin`, `exchangeHubToken`
- **Deploy:** Root `firebase.json` points `functions[0].source` at `shared-firebase-functions`; Firebase uses `package.json` main `lib/index.js`

## 6. Deploy verification

After deploying from project root:

```bash
firebase functions:list --project backbone-logic
```

- All functions from this codebase should show as **2nd Gen** (v2), nodejs22.
- `onUserLoginTrigger` should show as a blocking function (identity/beforeCreate).
- Extensions (`ext-*`) may still show as v1; those are managed by Firebase Extensions.

## 7. If something fails in production

- **Container healthcheck / OOM:** Ensure the function has sufficient memory in code (512MiB or 1GiB via options); redeploy so the cloud picks up the change.
- **Auth blocking error (GCIP):** If you see "Blocking Functions may only be configured for GCIP projects", enable Identity Platform in Firebase Console → Authentication → Settings.
- **Trigger type change:** When switching a function from one trigger type to another (e.g. v1 auth → v2 identity), delete the old function first, then deploy the new one.
