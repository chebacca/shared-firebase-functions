# Firebase Functions in Cloud – v2 Audit

**Source:** `firebase functions:list --project backbone-logic` (live cloud state).  
**Purpose:** What’s left to update to 2nd gen (v2) and what’s still v1 or at 256 MiB.

---

## 1. Summary

| Category | Count | Notes |
|----------|--------|--------|
| **v2 (your code)** | **368+** | All shared-firebase-functions are deployed as v2, nodejs22. |
| **v1 (your code)** | **0** | All custom functions migrated to v2. (Previously: `onUserLoginTrigger` – migrated to v2 `beforeUserCreated`.) |
| **v1 (Firebase Extensions)** | **15** | `ext-*` – managed by extensions, not this repo. |
| **v2 still at 256 MiB in cloud** | **~120+** | Code has 512MiB; redeploy to update cloud. |

---

## 2. Your Code: What’s Left to Update to v2

### 2.1 ~~Only v1 function from this repo: `onUserLoginTrigger`~~ **Migrated to v2**

- **Location:** `shared-firebase-functions/src/auth/unifiedAuth.ts`
- **Current:** v2 `beforeUserCreated` from `firebase-functions/v2/identity` (512MiB). Requires Identity Platform (GCIP) enabled on the project.
- **Deployed as:** v2 blocking function, trigger before user create. No v1 auth trigger left in this repo.

### 2.2 Everything else from this repo

All other deployed functions from `shared-firebase-functions` are **already v2** (callable, https, scheduled, firestore triggers). No other “update to v2” work in the cloud for your code.

---

## 3. v1 Functions in the Cloud (Not Your Repo)

These are from **Firebase Extensions**; version/runtime are controlled by the extension, not by `shared-firebase-functions`:

| Function (pattern) | Trigger | Runtime |
|--------------------|--------|---------|
| ext-delete-user-data-clearData | firebase.auth user.delete | nodejs20 |
| ext-delete-user-data-handleDeletion | pubsub | nodejs20 |
| ext-delete-user-data-handleSearch | pubsub | nodejs20 |
| ext-firestore-bigquery-export-* (3) | https / sync | nodejs20 |
| ext-firestore-counter-* (3) | firestore write / pubsub | nodejs20 |
| ext-firestore-stripe-payments-* (6) | auth/firestore/https | nodejs20 |

To “update to v2” for these you’d use the Extensions UI (reconfigure/update the extension), not this codebase.

---

## 4. v2 Functions Still at 256 MiB in the Cloud

Many v2 functions still show **Memory: 256** in `firebase functions:list` because the cloud revision hasn’t been updated since we added `memory: '512MiB'` (or higher) in code. **Action:** redeploy functions so new revisions pick up the new memory.

Examples (non-exhaustive) – all v2, nodejs22, 256 MiB in cloud:

- authenticateTeamMemberHttp, calculateDirections, checkReminders, clearAllNotifications  
- clipShowProUpdateClaims, createContactWithAuth, createDocuSignEnvelope  
- createMeetMeeting, createMessageSession, createNotification, createPageInfo  
- createWebexMeeting, createWorkflow, deleteMessage, deleteNotification  
- disablePublishedCallSheet*, discoverCollections, ensureUserDocument  
- executeAutomationHttp, findUserByEmail, generateAlerts, generateDeliveryPackageZip  
- generateScheduleAlerts, generateScript, getAIAgentHealth, getActiveOvertimeSession  
- getBoxConfigStatus, getDocuSignEnvelopeStatus, getDropboxConfigStatus, getDropboxIntegrationStatus  
- getGoogleConfigStatus, getLaborRules*, getMeetMeetingDetails, getMessageSessions  
- getMessages, getNetworkDeliveryDeliverables, getNotificationSettings, getNotifications  
- getNotificationsByCategory, getPageInfo, getParticipantDetails, getPitchAnalytics  
- getProjectTeamMembersCallable, getProjectTeamMembersForContact*, getPublishedCallSheet  
- getReportStatus, getSlackConfigStatusHttp, getSystemStats, getTURNCredentials  
- getTranscriptionTaskStatus, getUnreadNotifications, getUserInfoHttp, getUserOrganization  
- getUserPreferences, getUserProjects, getUserSettings, getWebexConfigStatus, getWebexMeetingDetails  
- …and many more (Slack, Webex, OAuth, notifications, etc.)

After a full deploy, `firebase functions:list` should show 512 (or 1024/2048 where set) for these.

---

## 5. Recommended Next Steps

1. **Redeploy functions**  
   From repo root:  
   `./scripts/deployment/deploy-functions.sh`  
   (or your usual deploy) so all v2 functions get new revisions with 512MiB (or current code memory).

2. **~~Optional: Migrate `onUserLoginTrigger` to v2~~ DONE**  
   - Migrated in `auth/unifiedAuth.ts` to v2 `beforeUserCreated` from `firebase-functions/v2/identity`.  
   - Old v1 function deleted; v2 function deployed. Requires Identity Platform (GCIP) enabled.

3. **Extensions**  
   Leave as-is or update via Firebase Console → Extensions if you want those extensions on a newer runtime/version.

---

## 6. How to Re-run This Audit

```bash
cd "/path/to/repo"
firebase functions:list --project backbone-logic | tee /tmp/fn-list.txt
grep "│ v1 " /tmp/fn-list.txt   # Your v1 + extension v1
grep "│ 256 " /tmp/fn-list.txt  # Still at 256 MiB in cloud
```
