# 🔧 Installing Firebase Email Extension

## Why Switch?

**Firebase Trigger Email Extension** is the built-in solution that:
- ✅ No SMTP configuration needed
- ✅ Automatic email templates
- ✅ Secure credential management
- ✅ Production-ready out of the box
- ✅ Monitors Firestore documents for automatic sending

## Installation Steps

### Step 1: Install the Extension

```bash
cd "/Users/chebrooks/Documents/IDE_Project/BACKBONE ALL 4 APP Master/shared-firebase-functions"
firebase ext:install firebase/firestore-send-email
```

This will prompt you to:
1. Accept the extension installation
2. Choose which Firestore collection to monitor (use `mail`)
3. Configure email provider (SendGrid, Mailgun, or SMTP)

### Step 2: Configure SendGrid (Recommended)

The extension will ask for:
- **SendGrid API Key**: Get from https://app.sendgrid.com/settings/api_keys
- **Default From Email**: e.g., noreply@clipshowpro.com
- **Default Reply To**: e.g., support@clipshowpro.com

### Step 3: Update Code to Use Extension

The extension automatically sends emails when documents are added to the monitored collection. We need to:

1. **Update FirebaseAutomationService** to write to the `mail` collection
2. **Remove custom SMTP logic** 
3. **Use the built-in email templates**

### Step 4: Test

After installation, test with:

```bash
node test-automation-delivery.cjs
```

## How It Works

**Old Way (Custom SMTP):**
```typescript
// Call Cloud Function
const sendEmailFunction = httpsCallable(functions, 'sendNotificationEmail');
await sendEmailFunction({
  organizationId, to, subject, body, type
});
```

**New Way (Firebase Extension):**
```typescript
// Write to Firestore collection
await db.collection('mail').add({
  to: ['user@example.com'],
  message: {
    subject: 'Automation Notification',
    html: generateEmailHTML(subject, body, type),
    text: body
  }
});
// Extension automatically sends email!
```

## Configuration

The extension stores its config in:
```
extensions/firestore-send-email/config
```

You can view/update it in Firebase Console:
https://console.firebase.google.com/project/backbone-logic/extensions

## Migration Plan

1. Install extension
2. Update `FirebaseAutomationService` to write to `mail` collection
3. Keep existing code as fallback
4. Test thoroughly
5. Remove old custom SMTP code if working well

