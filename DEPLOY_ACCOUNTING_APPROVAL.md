# Deploy Accounting Approval System

## Steps to Deploy

### 1. Create Firestore Collections

Run the collection creation script:

```bash
cd shared-firebase-functions
node scripts/create-accounting-approval-collections.cjs
```

This will create:
- `accountingApprovalAlerts` collection
- `accountingApprovalNotifications` collection

### 2. Create Firestore Indexes

Deploy the indexes:

```bash
firebase deploy --only firestore:indexes
```

Or manually add the indexes from `firestore.indexes.accounting-approval.json` to your `firestore.indexes.json` file.

### 3. Update Firestore Security Rules

Add these rules to your `firestore.rules` file:

```javascript
// Accounting Approval Alerts
match /accountingApprovalAlerts/{alertId} {
  allow read: if request.auth != null && 
    (resource.data.organizationId == request.auth.token.organizationId ||
     request.auth.token.role in ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN', 'OWNER']);
  
  allow create: if request.auth != null && 
    request.resource.data.organizationId == request.auth.token.organizationId;
  
  allow update: if request.auth != null && 
    (resource.data.organizationId == request.auth.token.organizationId) &&
    (request.auth.token.role in ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN', 'OWNER'] ||
     request.resource.data.managerId == request.auth.uid);
  
  allow delete: if request.auth != null && 
    resource.data.organizationId == request.auth.token.organizationId &&
    request.auth.token.role in ['ADMIN', 'OWNER'];
}

// Accounting Approval Notifications
match /accountingApprovalNotifications/{notificationId} {
  allow read: if request.auth != null && 
    (resource.data.organizationId == request.auth.token.organizationId &&
     (request.auth.uid in resource.data.recipientIds ||
      request.auth.token.role in ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN', 'OWNER']));
  
  allow create: if request.auth != null && 
    request.resource.data.organizationId == request.auth.token.organizationId;
  
  allow update: if request.auth != null && 
    resource.data.organizationId == request.auth.token.organizationId &&
    (request.auth.uid in resource.data.recipientIds ||
     request.auth.token.role in ['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CFO', 'ADMIN', 'OWNER']);
  
  allow delete: if request.auth != null && 
    resource.data.organizationId == request.auth.token.organizationId &&
    request.auth.token.role in ['ADMIN', 'OWNER'];
}
```

Deploy the rules:

```bash
firebase deploy --only firestore:rules
```

### 4. Deploy Firebase Functions

Deploy the accounting approval functions:

```bash
cd shared-firebase-functions
firebase deploy --only functions:getAccountingApprovalAlerts,functions:createAccountingApprovalAlert,functions:acknowledgeAccountingAlert,functions:resolveAccountingAlert,functions:checkManagerApprovalThreshold
```

Or deploy all functions:

```bash
firebase deploy --only functions
```

### 5. Verify Deployment

Test the functions:

```bash
# Get alerts (requires authentication token)
curl -X GET \
  'https://us-central1-backbone-logic.cloudfunctions.net/getAccountingApprovalAlerts?status=PENDING' \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Check manager threshold (requires authentication token)
curl -X POST \
  'https://us-central1-backbone-logic.cloudfunctions.net/checkManagerApprovalThreshold' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "managerId": "MANAGER_USER_ID",
    "timePeriod": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-07T23:59:59Z"
    }
  }'
```

## Functions Deployed

1. **getAccountingApprovalAlerts** - Get all pending accounting approval alerts
2. **createAccountingApprovalAlert** - Create a new accounting approval alert
3. **acknowledgeAccountingAlert** - Acknowledge an alert
4. **resolveAccountingAlert** - Resolve an alert
5. **checkManagerApprovalThreshold** - Check if a manager needs accounting approval

## Collections Created

1. **accountingApprovalAlerts** - Stores alerts when managers exceed thresholds
2. **accountingApprovalNotifications** - Stores notifications sent to accounting personnel

## Integration Points

The system integrates with:
- Timecard approval system (checks thresholds on approval)
- Overtime approval system (alerts for pending exec approvals)
- Unified notification system (sends notifications to accounting personnel)

## Next Steps

1. Set up scheduled function to check thresholds periodically (optional)
2. Configure manager thresholds in `userDirectReports` collection
3. Test the system with sample data
4. Monitor alerts in the accounting dashboard
