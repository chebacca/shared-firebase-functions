# Using v2 Auth Trigger (`onUserLoginTrigger` with `beforeUserCreated`)

The v2 identity trigger `beforeUserCreated` (from `firebase-functions/v2/identity`) **only works when the project uses Identity Platform (GCIP)**. Standard Firebase Auth returns:

```text
OPERATION_NOT_ALLOWED : Blocking Functions may only be configured for GCIP projects.
```

## 1. Enable Identity Platform (GCIP)

1. Open **Firebase Console** → your project (**backbone-logic**).
2. Go to **Build** → **Authentication** → **Settings** (or open [Authentication Settings](https://console.firebase.google.com/project/backbone-logic/authentication/settings)).
3. Find the option to **upgrade to Firebase Authentication with Identity Platform** and complete the upgrade.

**Notes:**

- No app code changes are required for existing Auth; client and Admin SDK code keeps working.
- **Pricing:** Spark plan is limited to 3,000 daily active users; Blaze has a free tier of 50,000 monthly active users, then paid. Confirm [pricing](https://firebase.google.com/docs/auth#identity-platform) before upgrading.

## 2. Switch code to v2 and deploy

After GCIP is enabled:

1. **Delete the current v1 function** (so Firebase can replace it with the v2 blocking function):
   ```bash
   firebase functions:delete onUserLoginTrigger --region us-central1 --project backbone-logic --force
   ```

2. **Update** `shared-firebase-functions/src/auth/unifiedAuth.ts`:
   - Remove the v1 `functionsV1.auth.user().onCreate(...)` implementation.
   - Use the v2 `beforeUserCreated` implementation (see below).

3. **Deploy**:
   ```bash
   firebase deploy --only functions:onUserLoginTrigger --project backbone-logic
   ```

## 3. Register the blocking function (script or Console)

After deploying, **wire the function to Auth** so Identity Platform actually invokes it. Until this is set, the function is deployed but not called during sign-up.

### Option A: Script (recommended)

From the project root:

```bash
# Dry run: show URL and payload only
./scripts/deployment/register-blocking-function.sh --project backbone-logic --dry-run

# Apply: register onUserLoginTrigger as Before account creation
./scripts/deployment/register-blocking-function.sh --project backbone-logic
```

Requires `gcloud` authenticated (`gcloud auth application-default login`). The script resolves the Cloud Run URL for `onUserLoginTrigger` and PATCHes the Identity Platform config via the REST API.

### Option B: Firebase Console

1. Open [Authentication → Settings → Blocking functions](https://console.firebase.google.com/project/backbone-logic/authentication/settings).
2. Under **Before account creation (beforeCreate)**, select **onUserLoginTrigger** from the dropdown (not "None").
3. Click **Save**.

**Before sign in (beforeSignIn):** Leave **None** unless you add a `beforeUserSignedIn` function. The Hub already calls `syncUserClaimsOnLogin` (callable) on every login to refresh claims.

**Additional provider token credentials:** Leave ID token, Refresh token, and Access token **unchecked**. `onUserLoginTrigger` only uses `event.data` (uid, email); no OAuth tokens are needed, and leaving them unchecked is more secure.

---

## 4. v2 implementation (for reference)

In `unifiedAuth.ts`:

```typescript
import { beforeUserCreated } from 'firebase-functions/v2/identity';

export const onUserLoginTrigger = beforeUserCreated(
    { memory: '512MiB' },
    async (event) => {
        const user = event.data;
        if (!user) return {};
        const uid = user.uid;
        const email = user.email ?? undefined;
        console.log(`🆕 [UnifiedAuth] Before user create: ${email}. Minting initial claims.`);
        const claims = await computeUserClaims({ uid, email });
        return { customClaims: claims };
    }
);
```

Remove the `firebase-functions/v1` import when using this.

## 5. If you stay on standard Firebase Auth

Keep the current v1 trigger (`functionsV1.auth.user().onCreate`). It works without GCIP and continues to mint claims after user creation.
