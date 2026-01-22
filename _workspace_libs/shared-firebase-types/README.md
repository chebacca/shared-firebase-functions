# 🔥 Shared Firebase Types

TypeScript type definitions for Firebase Auth custom claims and user models used across all BACKBONE projects.

## 📋 Overview

This package provides:

- **CustomClaims** interface - Complete structure of Firebase Auth custom claims
- **UnifiedUser** interface - Unified user model across all applications
- **Utility functions** - Type-safe helpers for working with claims

## 🚀 Installation

```bash
# Add to your project's package.json
"shared-firebase-types": "file:../shared-firebase-types"

# Install dependencies
pnpm install
```

## 📖 Usage

### Basic Claims Reading

```typescript
import { getAuth, getIdTokenResult } from 'firebase/auth';
import { CustomClaims, getClaims } from 'shared-firebase-types';

const auth = getAuth();
const user = auth.currentUser;

if (user) {
  // Method 1: Use utility function
  const claims = await getClaims(user);
  if (claims) {
    console.log('Organization:', claims.organizationId);
    console.log('Role:', claims.role);
  }
  
  // Method 2: Direct access
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims as CustomClaims;
  console.log('Organization:', claims.organizationId);
}
```

### Check User Permissions

```typescript
import { isAdmin, hasAppAccess, hasPageReadAccess } from 'shared-firebase-types/utils';
import { getClaims } from 'shared-firebase-types';

const claims = await getClaims(user);

if (claims) {
  // Check if admin
  if (isAdmin(claims)) {
    console.log('User is an admin');
  }
  
  // Check app access
  if (hasAppAccess(claims, 'clipShow')) {
    console.log('User has Clip Show Pro access');
  }
  
  // Check page permissions
  if (hasPageReadAccess(claims, 'pitching')) {
    console.log('User can read pitching page');
  }
}
```

### Create Unified User

```typescript
import { createUnifiedUser } from 'shared-firebase-types/user';
import { getClaims } from 'shared-firebase-types';

const claims = await getClaims(user);
if (claims && user) {
  const unifiedUser = createUnifiedUser(user, claims);
  console.log('Unified user:', unifiedUser);
}
```

## 📚 Type Definitions

### CustomClaims

Complete structure of Firebase Auth custom claims. See `src/claims.ts` for full definition.

Key properties:
- `organizationId` - Organization ID (required)
- `role` - Primary role (ADMIN, OWNER, MEMBER, etc.)
- `licensingRole` - Licensing tier role
- `pagePermissions` - Page-level permissions (Clip Show Pro)
- `subscriptionAddOns` - App access flags
- `effectiveHierarchy` - Permission hierarchy level

### UnifiedUser

Unified user model combining Firebase Auth user, custom claims, and Firestore data.

## 🔧 Utility Functions

All utilities are exported from `shared-firebase-types/utils`:

- `getClaims(user, forceRefresh?)` - Get claims from Firebase user
- `getOrganizationId(claims)` - Extract organization ID
- `hasRole(claims, role)` - Check specific role
- `hasAnyRole(claims, roles)` - Check any of multiple roles
- `isAdmin(claims)` - Check if user is admin
- `hasAppAccess(claims, app)` - Check app access
- `hasPageReadAccess(claims, pageId)` - Check page read access
- `hasPageWriteAccess(claims, pageId)` - Check page write access
- `getEffectiveHierarchy(claims)` - Get hierarchy level
- `hasMinimumHierarchy(claims, minLevel)` - Check minimum hierarchy
- `belongsToOrganization(claims, orgId)` - Check organization membership
- `getAppRoles(claims)` - Get all app roles

## 📝 Examples

### Standard Claims Reading Pattern

```typescript
import { getAuth, getIdTokenResult } from 'firebase/auth';
import { CustomClaims } from 'shared-firebase-types';

async function getCurrentUserClaims(): Promise<CustomClaims | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) return null;
  
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims as CustomClaims;
}
```

### Force Token Refresh After Claims Update

```typescript
import { getAuth } from 'firebase/auth';
import { getClaims } from 'shared-firebase-types';

// After claims are updated server-side
const auth = getAuth();
const user = auth.currentUser;

if (user) {
  // Force refresh to get new claims
  await user.getIdToken(true);
  
  // Read updated claims
  const updatedClaims = await getClaims(user, true);
  console.log('Updated claims:', updatedClaims);
}
```

## 🔗 Related Packages

- **shared-firebase-functions** - Backend functions that set claims
- **shared-firebase-rules** - Firestore rules that validate claims
- **shared-firebase-config** - Firebase configuration

## 📚 Documentation

- **Custom Claims Reference**: See root `CUSTOM_CLAIMS_REFERENCE.md`
- **Audit Report**: See root `CLAIMS_AUDIT_REPORT.md`
- **Quick Reference**: See root `CLAIMS_QUICK_REFERENCE.md`

## 🎯 Status

**✅ PRODUCTION READY**

- Complete type definitions
- Utility functions for common operations
- Type-safe claims access
- Used by all BACKBONE projects

---

*Version: 1.0.0*  
*Last Updated: January 2025*











