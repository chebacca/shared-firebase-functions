# Box OAuth Scope Configuration

## Issue
"Unsupported scope was requested" error occurs when the scope requested doesn't match what's enabled in your Box app.

## Solution

### Step 1: Check Your Box App Configuration

1. Go to your Box Developer Console: https://app.box.com/developers/console
2. Select your app
3. Go to **"Configuration"** → **"Content Actions"**
4. Check which scopes/content actions are enabled

### Step 2: Set the Scope in Firebase Functions Config

Based on what you've enabled in Box, set the scope:

```bash
# For root read/write access
firebase functions:config:set box.scope="root_readwrite"

# For root read-only access
firebase functions:config:set box.scope="root_readonly"

# For multiple scopes (space-separated)
firebase functions:config:set box.scope="root_readwrite read write"

# Or if your Box app uses different scope names, use those exactly
firebase functions:config:set box.scope="your_exact_scope_name"
```

### Step 3: Verify Configuration

```bash
firebase functions:config:get box
```

You should see:
```json
{
  "box": {
    "client_id": "...",
    "client_secret": "...",
    "redirect_uri": "...",
    "scope": "root_readwrite"
  }
}
```

### Step 4: Redeploy Functions

After updating the config, redeploy the functions:

```bash
cd shared-firebase-functions
firebase deploy --only functions:initiateBoxOAuthHttp
```

## Common Box Scopes

- `root_readwrite` - Full read/write access to user's root folder
- `root_readonly` - Read-only access to user's root folder
- `read` - Basic read access
- `write` - Basic write access
- Multiple scopes can be space-separated: `root_readwrite read write`

## Important Notes

1. **Scope must match exactly** what's enabled in your Box app
2. **Case-sensitive** - `root_readwrite` vs `Root_ReadWrite` matters
3. **Content Actions** - The scope should match the content actions you enabled
4. **Default** - If not configured, it defaults to `root_readwrite`

## Troubleshooting

If you still get "Unsupported scope":
1. Double-check the exact scope name in Box Developer Console
2. Ensure the scope is enabled in your Box app settings
3. Try using `root_readonly` first to test
4. Check Box API documentation for the latest scope names

