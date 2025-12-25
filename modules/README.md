# 🔥 Modular Functions

This directory contains **independent function modules** that can be deployed separately.

## Current Modules

✅ **api-sessions**: Sessions API endpoints (`/sessions/*`)  
✅ **api-network-delivery**: Network Delivery Bible endpoints (`/network-delivery/*`)  
✅ **api-workflow**: Workflow endpoints (`/workflow/*`)  
✅ **api-contacts**: Contacts endpoints (`/contacts/*`)  
✅ **api-production**: Production endpoints (`/production/*`)

## Module Structure

Each module follows this structure:

```
api-<name>/
├── src/
│   ├── index.ts          # Exports the function
│   └── routes/
│       └── <name>.ts     # Route handlers
├── firebase.json         # Module config (unique codebase)
├── package.json          # Module dependencies
└── tsconfig.json         # TypeScript config
```

## Shared Code

All modules reference shared utilities:
- `../../../src/shared/middleware.ts` - Authentication middleware
- `../../../src/shared/utils.ts` - Common utilities

## Deployment

### Deploy All Modules
```bash
./FIREBASE_MANAGER/START_HERE.sh
```

### Deploy Single Module
```bash
./FIREBASE_MANAGER/DEPLOY_MODULE.sh api-sessions
./FIREBASE_MANAGER/DEPLOY_MODULE.sh api-network-delivery
./FIREBASE_MANAGER/DEPLOY_MODULE.sh api-workflow
./FIREBASE_MANAGER/DEPLOY_MODULE.sh api-contacts
./FIREBASE_MANAGER/DEPLOY_MODULE.sh api-production
```

## Benefits

- ⚡ **Faster**: Deploy only what changed (1-2 min vs 5-10 min)
- 🎯 **Selective**: Update one API without affecting others
- 📦 **Modular**: Clear boundaries and dependencies
- 🔧 **Maintainable**: Easier to understand and modify

## Migration Status

All API route modules have been created and are ready for deployment!
