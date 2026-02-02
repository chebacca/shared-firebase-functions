# Firebase Functions Memory Audit

**Purpose:** List all 2nd-gen functions that still need a memory bump (to `512MiB` or higher) to avoid Cloud Run container healthcheck timeouts. Default 256MiB often fails on cold start.

**Already OK:**
- No `memory: '256MiB'` left in `src/` (all bumped to 512MiB or higher).
- Functions using `defaultCallableOptions` from `lib/functionOptions.ts` already have `memory: '1GiB'`.
- Functions we've already updated in recent sessions (sendMessage, saveOAuthTokens, searchAll, etc.) have `memory: '512MiB'` or `1GiB`.

---

## 1. Functions with NO options (onCall(async) / onRequest(async)) — need memory

These use the zero-options form and get Cloud Run default 256MiB. Add `memory: '512MiB'` via an options object.

### notifications/crud.ts
| Function | Fix |
|----------|-----|
| getNotifications | onRequest({ memory: '512MiB' }, async ...) |
| getUnreadNotifications | onRequest({ memory: '512MiB' }, async ...) |
| createNotification | onRequest({ memory: '512MiB' }, async ...) |
| markNotificationAsRead | onRequest({ memory: '512MiB' }, async ...) |
| markAllNotificationsAsRead | onRequest({ memory: '512MiB' }, async ...) |
| deleteNotification | onRequest({ memory: '512MiB' }, async ...) |
| clearAllNotifications | onRequest({ memory: '512MiB' }, async ...) |
| updateNotificationSettings | onRequest({ memory: '512MiB' }, async ...) |

### unified/index.ts
| Function | Fix |
|----------|-----|
| validateLicense | onCall({ memory: '512MiB' }, async ...) |
| grantAppAccess | onCall({ memory: '512MiB' }, async ...) |
| getUserOrganization | onCall({ memory: '512MiB' }, async ...) |
| updateUserOrganization | onCall({ memory: '512MiB' }, async ...) |
| getUserProjects | onCall({ memory: '512MiB' }, async ...) |
| discoverCollections | onCall({ memory: '512MiB' }, async ...) |
| getSystemStats | onCall({ memory: '512MiB' }, async ...) |
| healthCheck | onRequest({ memory: '512MiB' }, async ...) |

### unified/index.ts — options but no memory
| Function | Fix |
|----------|-----|
| getUserInfoHttp | Add memory: '512MiB' to existing options |
| findUserByEmail | Add memory: '512MiB' to existing options |
| ensureUserDocument | Add memory: '512MiB' to existing options |

### clipShowPro/index.ts
| Function | Fix |
|----------|-----|
| notifyPitchStatusChange | onCall({ memory: '512MiB' }, async ...) |
| notifyPitchAssignment | onCall({ memory: '512MiB' }, async ...) |
| notifyLicensingSpecialist | onCall({ memory: '512MiB' }, async ...) |
| generateScript | onCall({ memory: '512MiB' }, async ...) |
| uploadToBoxForClipShow | onCall({ memory: '512MiB' }, async ...) |

### clipShowPro/syncSubscriptionAddOns.ts
| Function | Fix |
|----------|-----|
| syncSubscriptionAddOns | onCall({ memory: '512MiB' }, async ...) |
| grantClipShowProAccess | onCall({ memory: '512MiB' }, async ...) |
| revokeClipShowProAccess | onCall({ memory: '512MiB' }, async ...) |

### clipShowPro/automationExecutor.ts
| Function | Fix |
|----------|-----|
| executeAutomationHttp | Add memory: '512MiB' to existing options |

### box/files.ts
| Function | Fix |
|----------|-----|
| uploadToBoxHttp | onRequest({ memory: '512MiB' }, async ...) |

### integrations/airtable.ts
| Function | Fix |
|----------|-----|
| initiateAirtableOAuth | onCall({ memory: '512MiB' }, async ...) |
| handleAirtableOAuthCallback | onCall({ memory: '512MiB' }, async ...) |
| getAirtableIntegrationStatus | onCall({ memory: '512MiB' }, async ...) |
| syncAirtableToFirebase | onCall({ memory: '512MiB' }, async ...) |
| syncFirebaseToAirtable | onCall({ memory: '512MiB' }, async ...) |
| importAirtableData | onCall({ memory: '512MiB' }, async ...) |
| exportToAirtable | onCall({ memory: '512MiB' }, async ...) |
| validateAirtableConnection | onCall({ memory: '512MiB' }, async ...) |
| getAirtableBases | onCall({ memory: '512MiB' }, async ...) |
| getAirtableTables | onCall({ memory: '512MiB' }, async ...) |

### integrations/googleDriveHttp.ts
| Function | Fix |
|----------|-----|
| initiateGoogleOAuthHttp | onRequest({ memory: '512MiB' }, async ...) |
| handleGoogleOAuthCallbackHttp | onRequest({ memory: '512MiB' }, async ...) |
| getGoogleIntegrationStatusHttp | onRequest({ memory: '512MiB' }, async ...) |
| listGoogleDriveFoldersHttp | onRequest({ memory: '512MiB' }, async ...) |
| getGoogleDriveFilesHttp | onRequest({ memory: '512MiB' }, async ...) |
| createGoogleDriveFolderHttp | onRequest({ memory: '512MiB' }, async ...) |
| uploadToGoogleDriveHttp | onRequest({ memory: '512MiB' }, async ...) |

### integrations/googleDrive.ts
| Function | Fix |
|----------|-----|
| initiateGoogleOAuthHttp | Add memory if not present (may be duplicate export) |
| refreshGoogleAccessTokenHttp | Add memory if not present |

### budgeting/matchTemplates.ts
| Function | Fix |
|----------|-----|
| matchTemplates | onCall({ memory: '512MiB' }, async ...) |

### workflow/delivery/proxyFileDownload.ts
| Function | Fix |
|----------|-----|
| proxyFileDownload | onRequest({ memory: '512MiB' }, async ...) |

### functions/pageInfo.ts
| Function | Fix |
|----------|-----|
| getPageInfo | onRequest({ memory: '512MiB' }, async ...) |
| listAllPageInfo | onRequest({ memory: '512MiB' }, async ...) |
| updatePageInfo | onRequest({ memory: '512MiB' }, async ...) |
| createPageInfo | onRequest({ memory: '512MiB' }, async ...) |

### projects/*.ts, payments/*.ts, datasets/*.ts, sessions/*.ts, licensing/*.ts
| File | Functions (all onRequest(async ...)) |
|------|--------------------------------------|
| projects/update.ts | updateProject |
| projects/delete.ts | deleteProject |
| projects/list.ts | listProjects |
| projects/create.ts | createProject |
| projects/datasets.ts | assignDatasetToProject, removeDatasetFromProject, getProjectDatasets |
| payments/list.ts | listPayments |
| payments/delete.ts | deletePayment |
| payments/update.ts | updatePayment |
| payments/create.ts | createPayment |
| datasets/delete.ts | deleteDataset |
| datasets/create.ts | createDataset |
| datasets/list.ts | listDatasets |
| datasets/update.ts | updateDataset |
| sessions/list.ts | listSessions |
| sessions/update.ts | updateSession |
| sessions/delete.ts | deleteSession |
| sessions/create.ts | createSession |
| licensing/list.ts | listLicenses |
| licensing/delete.ts | deleteLicense |
| licensing/create.ts | createLicense |
| licensing/update.ts | updateLicense |

**Fix for all above:** Wrap in onRequest({ memory: '512MiB' }, async ...).

### api/routes/networkDelivery.ts
| Function | Fix |
|----------|-----|
| getNetworkDeliveryDeliverables | onCall({ memory: '512MiB' }, async ...) |
| uploadNetworkDeliveryBible | onCall({ memory: '512MiB' }, async ...) |

### inventory/networks.ts
| Function | Fix |
|----------|-----|
| getNetworks | onRequest({ memory: '512MiB' }, async ...) |
| getNetwork | onRequest({ memory: '512MiB' }, async ...) |
| createNetwork | onRequest({ memory: '512MiB' }, async ...) |
| updateNetwork | onRequest({ memory: '512MiB' }, async ...) |
| deleteNetwork | onRequest({ memory: '512MiB' }, async ...) |

### clipShowPro/syncLicensePitch.ts, backfillLicenseFees.ts, backfillWorkflowHistory.ts
| Function | File | Fix |
|----------|------|-----|
| syncAllPitchesWithLicenses | syncLicensePitch.ts | onCall({ memory: '512MiB' }, async ...) |
| backfillLicenseFees | backfillLicenseFees.ts | onCall({ memory: '512MiB' }, async ...) |
| auditLicenseFees | backfillLicenseFees.ts | onCall({ memory: '512MiB' }, async ...) |
| backfillWorkflowHistory | backfillWorkflowHistory.ts | onCall({ memory: '512MiB' }, async ...) |
| auditWorkflowHistory | backfillWorkflowHistory.ts | onCall({ memory: '512MiB' }, async ...) |

### clipShowPro/createContactWithAuth.ts
| Function | Fix |
|----------|-----|
| createContactWithAuth | onCall({ memory: '512MiB' }, async ...) |

### calendar/index.ts
| Function | Fix |
|----------|-----|
| createCalendarEvent | onCall({ memory: '512MiB' }, async ...) |
| updateCalendarEvent | onCall({ memory: '512MiB' }, async ...) |
| deleteCalendarEvent | onCall({ memory: '512MiB' }, async ...) |
| getCalendarEvents | onCall({ memory: '512MiB' }, async ...) |
| assignContactsToEvent | onCall({ memory: '512MiB' }, async ...) |

---

## 2. Options object but no memory (add memory: '512MiB')

Already identified in codebase (sample; add to any options block that has region/cors/secrets but no memory):

- **unified/index.ts:** getUserInfo (if options exist), getUserInfoHttp, findUserByEmail, ensureUserDocument
- **clipShowPro/automationExecutor.ts:** executeAutomationHttp
- **Slack / Meet / Webex:** Any remaining onCall/onRequest that have region + cors + secrets but no memory (many were already updated in prior sessions)

---

## 3. Already using defaultCallableOptions (1GiB) — no change

These use `defaultCallableOptions` from `lib/functionOptions.ts` (memory: '1GiB'):

- box/files.ts: listBoxFolders, getBoxFiles, createBoxFolder, indexBoxFolder
- dropbox/files.ts: getDropboxAccessToken, listDropboxFolders, getDropboxFiles, createDropboxFolder, uploadToDropbox, indexDropboxFolder
- auth/login.ts, auth/verify.ts, auth/updateEDLConverterClaims.ts, auth/migrateLastActive.ts, auth/unifiedAuth.ts, callsheet/personnel.ts, workflow/delivery/sendDeliveryPackageEmail.ts
- integrations/googleDrive.ts (downloadGoogleDriveFile, deleteGoogleDriveFile use defaultCallableOptions)
- integrations/archived/googleDriveMinimal.ts (all callables)

---

## 4. Summary counts

| Category | Count (approx) |
|----------|----------------|
| onRequest(async ...) / onCall(async ...) with no options | ~91 |
| Options without memory (add one prop) | Handful (getUserInfoHttp, findUserByEmail, ensureUserDocument, executeAutomationHttp, etc.) |
| Using defaultCallableOptions (1GiB) | No change needed |
| Already updated (512MiB / 1GiB) | All previously failing + many Slack/Meet/Box/OAuth |

**Recommendation:** Apply memory bumps in batches by file (e.g. all of `notifications/crud.ts`, then `unified/index.ts`, then clipShowPro, then integrations, then api/projects/payments/datasets/sessions/licensing, then calendar/inventory/workflow). Re-deploy after each batch or run full deploy once all are updated.
