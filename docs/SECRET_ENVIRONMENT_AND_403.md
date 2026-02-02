# Secret environment changes and 403 Forbidden

If the API was working and then started returning **403 Forbidden** (e.g. on `GET /api/google-maps/config`) after you changed the **secret environment**, the cause is usually IAM or secret names, not the route logic.

## What “changing the secret environment” can break

- Renaming or moving secrets in Secret Manager  
- Switching to a different GCP/Firebase project  
- Changing IAM (e.g. removing public invoker)  
- Adding/removing secrets the `api` function depends on  

## Why you get 403

403 means **the caller is not allowed to invoke the Cloud Function**. That is enforced by **Google Cloud IAM**, not by the Express app. So:

- **401** = our code (e.g. `authenticateToken`: missing/invalid Bearer token).
- **403** = Cloud: the HTTP request is not allowed to invoke the function (e.g. invoker is private or IAM was tightened).

## Fix 1: Re-deploy the `api` function (restore public invoker)

The `api` function is configured with `invoker: 'public'` in `lib/functionOptions.ts` so that browser/proxy calls (including unauthenticated `GET /api/google-maps/config`) are allowed. If that was overridden (e.g. in the console) or lost, re-deploy so the code’s options are applied again:

```bash
./scripts/deployment/deploy-functions.sh --only api
```

Or from the repo root:

```bash
cd shared-firebase-functions && pnpm run build && firebase deploy --only functions:api
```

After a successful deploy, the function’s IAM should again allow unauthenticated invocations. Then retry the request; 403 should go away if the only issue was invoker/IAM.

## Fix 2: Align secret names with the API

The `api` function declares these secrets (see `lib/functionOptions.ts`):

- `INTEGRATIONS_ENCRYPTION_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GEMINI_API_KEY`

- **If you renamed a secret** (e.g. `GOOGLE_MAPS_API_KEY` → something else): either create a secret in Secret Manager with the **expected** name above, or change `API_SECRETS` in `lib/functionOptions.ts` to match your new names and re-deploy.
- **If deploy fails** with “secret not found” or permission errors: ensure these three secrets exist in the **same project** as the function and that the deployer has **Secret Manager Secret Accessor** (or equivalent) on them. Fix names or permissions, then re-deploy.

## Fix 3: If you intentionally made the function private

If you want the API to be callable only by authenticated/authorized callers (e.g. via IAM or a gateway), then:

- 403 for unauthenticated browser calls is expected.
- To allow the browser again, either re-enable public invoker (Fix 1) or have the client call the API with a token that satisfies your IAM (e.g. Firebase Auth + a backend that invokes the function with a service account).

## Summary

- **403 after changing the secret environment** → Treat as an **invoker/IAM or secret name** issue first.
- **Re-deploy `api`** so `invoker: 'public'` and the correct `secrets` are applied again.
- Ensure **secret names and project** match what `API_SECRETS` and the code expect.
