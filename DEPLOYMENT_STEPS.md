# Deployment Steps - HTTP Functions Removal

## ✅ Pre-Deployment Checklist

- [x] Removed HTTP function exports from `src/index.ts`
- [x] Removed HTTP function exports from module index files
- [x] Cleaned up HTTP function definitions from key source files
- [ ] Build TypeScript to verify no compilation errors
- [ ] Deploy to Firebase
- [ ] Verify functions are removed from Firebase
- [ ] Delete orphaned `removeParticipantHttp` function

## Step 1: Build and Verify

```bash
cd shared-firebase-functions
npm run build
```

**Expected Result**: Build should succeed with no errors. If there are TypeScript errors, fix them before proceeding.

## Step 2: Delete Orphaned Function

Before deploying, delete the `removeParticipantHttp` function that was removed from code but still exists in Firebase:

```bash
firebase functions:delete removeParticipantHttp --region us-central1 --force
```

## Step 3: Deploy Functions

Deploy all functions. The removed HTTP functions won't be deployed because they're not exported:

```bash
firebase deploy --only functions
```

**Note**: This may take a while and may hit quota limits. If you get quota errors:
- Wait 2-3 minutes between batches
- Deploy in smaller batches (see below)

## Step 4: Deploy in Batches (If Quota Issues)

If you encounter quota errors, deploy in smaller batches:

```bash
# Batch 1: Critical OAuth functions
firebase deploy --only functions:appleConnectOAuthCallbackHttp,functions:googleOAuthInitiate,functions:googleOAuthCallback

# Wait 2-3 minutes

# Batch 2: Slack functions
firebase deploy --only functions:slackGetPinnedMessages,functions:getSlackConfigStatus,functions:slackOpenDM

# Wait 2-3 minutes

# Continue with other batches...
```

## Step 5: Verify Functions Removed

After deployment, verify that HTTP functions are no longer deployed:

```bash
# List all functions
firebase functions:list --region us-central1

# Check for removed functions (should not appear)
firebase functions:list --region us-central1 | grep -i "Http"
```

**Expected Result**: You should see:
- ✅ Callable functions (without "Http" suffix)
- ✅ Critical HTTP functions (OAuth callbacks, call sheet functions, etc.)
- ❌ Removed HTTP functions should NOT appear (getTimecardTemplatesHttp, getBudgetsHttp, etc.)

## Step 6: Clean Up Any Remaining Functions

If any removed HTTP functions are still deployed, delete them manually:

```bash
# Example: Delete a specific function
firebase functions:delete getTimecardTemplatesHttp --region us-central1 --force
firebase functions:delete getBudgetsHttp --region us-central1 --force
# ... etc for other removed functions
```

## Expected Results

After successful deployment:

1. **~35 HTTP functions removed** from Firebase
2. **~35 CPUs freed** (estimated)
3. **CPU quota issues resolved** (or significantly reduced)
4. **Callable functions still work** - All functionality preserved
5. **No breaking changes** - Frontend code using callable functions continues to work

## Troubleshooting

### Build Errors
- Check TypeScript compilation errors
- Ensure all imports are correct
- Verify no references to removed HTTP functions

### Deployment Quota Errors
- Wait 2-3 minutes between deployments
- Deploy in smaller batches
- Request quota increase if needed

### Functions Still Deployed
- Manually delete using `firebase functions:delete`
- Check that exports were properly removed from `src/index.ts`

## Post-Deployment Verification

1. **Test callable functions** - Verify they still work:
   ```bash
   # Test a callable function
   curl -X POST https://us-central1-backbone-logic.cloudfunctions.net/getTimecardTemplates \
     -H "Content-Type: application/json" \
     -d '{"data": {"organizationId": "test-org"}}'
   ```

2. **Check CPU usage** - Monitor in GCP Console:
   - Go to Cloud Run → Services
   - Check CPU allocation
   - Should see reduction in number of services

3. **Monitor deployment** - Check Firebase Console:
   - Functions → All functions
   - Verify removed functions are gone
   - Verify remaining functions are working

