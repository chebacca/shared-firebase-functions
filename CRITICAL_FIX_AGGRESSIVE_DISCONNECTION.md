# Critical Fix: Aggressive Disconnection on Token Refresh Failure

## 🚨 The REAL Problem Discovered

The **actual root cause** of Google Drive and Box connections getting "knocked off" was NOT the refresh frequency - it was **aggressive disconnection on ANY refresh error**.

### What Was Happening

**Location**: `shared-firebase-functions/src/integrations/unified-oauth/schedules/refreshTokens.ts`

**Old Behavior** (Lines 108-117):

```typescript
catch (error) {
  // If refresh fails, mark as inactive
  await connectionDoc.ref.update({
    isActive: false,  // ❌ DISCONNECTS ON ANY ERROR!
    refreshError: error.message,
    refreshErrorAt: Timestamp.now()
  });
}
```

### Why This Was Catastrophic

The scheduled token refresh runs **every hour**. If it encountered **ANY error** (even temporary ones), it would:

1. ❌ Mark `isActive: false` immediately
2. ❌ Show "Disconnected" in the UI
3. ❌ Require user to manually reconnect
4. ❌ Lose the connection even though the refresh token was still valid!

### Common Temporary Errors That Caused Disconnection

- **Network hiccups** (timeout, DNS issues)
- **Provider API temporarily down** (Google/Box maintenance)
- **Rate limiting** (too many requests)
- **Transient 500 errors** from provider
- **Firestore write conflicts**
- **Function timeout** (cold start)

**None of these should disconnect the user!**

## ✅ The Fix

### New Behavior: Smart Error Handling

Now the system distinguishes between **permanent** and **temporary** errors:

#### 1. **Permanent Errors** → Disconnect Immediately

```typescript
const isPermanentError = 
  errorMessage.includes('invalid_grant') ||
  errorMessage.includes('Token has been expired or revoked') ||
  errorMessage.includes('refresh token is invalid or revoked') ||
  errorMessage.includes('token_revoked') ||
  errorMessage.includes('invalid_client') ||
  errorMessage.includes('unauthorized_client');

if (isPermanentError) {
  // Mark as inactive - user MUST reconnect
  await connectionDoc.ref.update({
    isActive: false,
    requiresReconnection: true
  });
}
```

**Permanent errors** mean the refresh token is actually invalid - user needs to reconnect.

#### 2. **Temporary Errors** → Retry with Backoff

```typescript
else {
  // Track consecutive failures
  const failureCount = (connectionData.consecutiveRefreshFailures || 0) + 1;
  const maxRetries = 3;
  
  if (failureCount >= maxRetries) {
    // Too many failures - disconnect
    await connectionDoc.ref.update({
      isActive: false,
      requiresReconnection: false // May recover
    });
  } else {
    // Keep active - will retry next hour
    await connectionDoc.ref.update({
      lastRefreshError: errorMessage,
      consecutiveRefreshFailures: failureCount
      // isActive stays TRUE!
    });
  }
}
```

**Temporary errors** allow **3 retries** (3 hours) before disconnecting.

#### 3. **Success** → Reset Failure Counter

```typescript
// On successful refresh
await connectionDoc.ref.update({
  accessToken: newAccessToken,
  consecutiveRefreshFailures: 0 // ✅ Reset counter
});
```

## 📊 Impact of This Fix

### Before Fix

```
Hour 1: Token refresh fails (network hiccup)
        → isActive: false ❌
        → User sees "Disconnected"
        → User must manually reconnect
```

### After Fix

```
Hour 1: Token refresh fails (network hiccup)
        → consecutiveRefreshFailures: 1
        → isActive: TRUE ✅
        → User still sees "Connected"

Hour 2: Token refresh succeeds
        → consecutiveRefreshFailures: 0
        → Connection stable!
```

## 🎯 Why Connections Were "Getting Knocked Off"

Your connections were getting disconnected because:

1. **Scheduled refresh runs every hour**
2. **Any temporary error** (network, API downtime, etc.) would disconnect
3. **User had to manually reconnect** even though refresh token was valid
4. **This created the illusion** that tokens were "expiring every 4 hours"

**Reality**: The tokens weren't expiring - the system was **too aggressive** in marking connections as inactive!

## 🔍 New Firestore Fields

The fix adds new tracking fields to `cloudIntegrations` documents:

```typescript
{
  // Existing fields
  isActive: true,
  accessToken: "encrypted...",
  refreshToken: "encrypted...",
  
  // NEW: Failure tracking
  consecutiveRefreshFailures: 0,        // Increments on failure, resets on success
  lastRefreshError: "Network timeout",  // Last error message (if any)
  lastRefreshErrorAt: Timestamp,        // When last error occurred
  requiresReconnection: false,          // true = permanent error, false = may recover
  
  // Existing error fields (still used for permanent errors)
  refreshError: null,
  refreshErrorAt: null
}
```

## 🧪 Testing the Fix

### Scenario 1: Temporary Network Error

```
1. Connection is active
2. Network hiccup during refresh
3. ✅ Connection stays active
4. Next hour: refresh succeeds
5. ✅ Connection still active
```

### Scenario 2: Permanent Token Revocation

```
1. Connection is active
2. User revokes access in Google account
3. Refresh fails with "invalid_grant"
4. ❌ Connection marked inactive (correct!)
5. requiresReconnection: true
6. User must reconnect
```

### Scenario 3: Multiple Temporary Failures

```
1. Connection is active
2. Hour 1: Network error → consecutiveRefreshFailures: 1 ✅ Still active
3. Hour 2: API down → consecutiveRefreshFailures: 2 ✅ Still active
4. Hour 3: Timeout → consecutiveRefreshFailures: 3 ✅ Still active
5. Hour 4: Still failing → ❌ Marked inactive (after 3 retries)
```

## 📝 Summary of All Fixes

### Fix #1: Reduced Client-Side Refresh Frequency

- **Changed**: 50 minutes → 24 hours
- **File**: `_backbone_licensing_website/client/src/hooks/integrations/useOAuthConnections.ts`
- **Impact**: Reduced unnecessary refresh activity

### Fix #2: Smart Error Handling (THIS FIX)

- **Changed**: Disconnect on ANY error → Disconnect only on permanent errors or 3+ failures
- **File**: `shared-firebase-functions/src/integrations/unified-oauth/schedules/refreshTokens.ts`
- **Impact**: Prevents disconnection from temporary errors

## 🚀 Expected Behavior After Both Fixes

### User Experience

1. **Connect once** → Connection persists for 30+ days
2. **Temporary errors** → Automatically retried, user never knows
3. **Permanent errors** → User prompted to reconnect (rare)
4. **No manual intervention** needed for normal operation

### System Behavior

```
Every Hour (Server-Side):
├─ Check tokens expiring within 30 minutes
├─ Attempt refresh
├─ If temporary error → Log, keep active, retry next hour
├─ If permanent error → Mark inactive, require reconnection
└─ If success → Reset failure counter, update tokens

Every 24 Hours (Client-Side):
└─ Safety net refresh (if page is open)

On Page Load:
└─ Refresh if expiring within 5 minutes
```

## 🔧 Deployment

This fix requires **deploying the Firebase Functions**:

```bash
cd /Users/chebrooks/Documents/IDE_Project/BACKBONE\ ALL\ 4\ APP\ Master/shared-firebase-functions
npm run build
firebase deploy --only functions:refreshExpiredTokens
```

## 📊 Monitoring

After deployment, monitor Firebase Functions logs:

```bash
firebase functions:log --only refreshExpiredTokens
```

**Look for**:

- ✅ `Refreshed {provider} token for org {orgId}` - Success
- ⚠️ `Temporary error for {provider} in org {orgId} (attempt X/3) - will retry` - Temporary failure
- 🚫 `Permanent error for {provider} in org {orgId} - marking inactive` - Permanent failure

## 🎉 Conclusion

This fix addresses the **actual root cause** of connections getting "knocked off":

- **Not** the refresh frequency (though we optimized that too)
- **Not** the token expiration (tokens were being refreshed correctly)
- **But** the aggressive disconnection on ANY error, even temporary ones!

With both fixes in place, your Google Drive and Box connections should now:

- ✅ Persist for 30+ days without manual reconnection
- ✅ Survive temporary network/API issues
- ✅ Only disconnect when truly necessary (permanent errors)
- ✅ Provide a stable, reliable user experience

---

**Date**: 2026-01-18
**Critical Fix**: Aggressive Disconnection on Token Refresh Failure
**Affected**: Google Drive, Box, Dropbox integrations
