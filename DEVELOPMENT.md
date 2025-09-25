# 🔥 BACKBONE Shared Firebase Functions - Development Guide

## 📋 **Project Overview**

This repository contains the complete shared Firebase Functions implementation for the BACKBONE v14.2 project. All functions have been extracted from the monolithic Dashboard application and organized into a modular, reusable structure.

## 🚀 **Quick Start**

```bash
# Clone the repository
git clone <repository-url>
cd shared-firebase-functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy all functions
npm run deploy
```

## 🏗️ **Project Structure**

```
src/
├── auth/           # Authentication functions (16 functions)
├── projects/       # Project management (7 functions)
├── datasets/       # Dataset management (4 functions)
├── sessions/       # Session management (4 functions)
├── licensing/      # License management (4 functions)
├── payments/       # Payment processing (3 functions)
├── database/       # Database operations (4 functions)
├── system/         # System operations (4 functions)
├── ai/            # AI processing (3 functions)
├── team/          # Team management (6 functions)
├── callSheets/    # Call sheet system (12 functions)
├── timecards/     # Timecard system (4 functions)
├── debug/         # Debug utilities (1 function)
├── api/           # Main API router (1 function)
└── shared/        # Shared utilities and types
```

## 🔧 **Development Setup**

### Prerequisites
- Node.js 18+
- npm or pnpm
- Firebase CLI
- TypeScript

### Environment Configuration
1. Copy `env.example` to `.env`
2. Configure Firebase project settings
3. Set up API keys (Gemini, Stripe, etc.)

### Available Scripts
```bash
npm run build          # Build TypeScript
npm run deploy         # Deploy all functions
npm run deploy:auth    # Deploy authentication functions
npm run deploy:projects # Deploy project functions
npm run lint           # Run ESLint
npm run lint:fix       # Fix linting issues
npm test              # Run tests
```

## 🔥 **Function Categories**

### Authentication (16 functions)
- `loginUser` / `loginUserHttp`
- `registerUser` / `registerUserHttp`
- `verifyEmail` / `verifyEmailHttp`
- `resendVerificationEmail` / `resendVerificationEmailHttp`
- `forgotPassword` / `forgotPasswordHttp`
- `resetPassword` / `resetPasswordHttp`
- `checkEmailAvailability` / `checkEmailAvailabilityHttp`
- `validateSession` / `validateSessionHttp`

### Project Management (7 functions)
- `createProject`
- `listProjects`
- `updateProject`
- `deleteProject`
- `assignDatasetToProject`
- `removeDatasetFromProject`
- `getProjectDatasets`

### AI Processing (3 functions)
- `processDeliverableDocumentEnhanced`
- `verifyDeliverableAccuracy`
- `generateWorkflowFromDeliverables`

### Team Management (6 functions)
- `teamMemberAuth`
- `getProjectTeamMembers`
- `getLicensedTeamMembers`
- `addTeamMemberToProject`
- `removeTeamMemberFromProject`
- `getAvailableProjectRoles`

## 🌐 **API Endpoints**

### Base URL
```
https://us-central1-backbone-logic.cloudfunctions.net/api
```

### Health Check
```
GET /api/health
```

### Authentication
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/verify
```

### Projects
```
GET /api/projects
POST /api/projects
PUT /api/projects/:id
DELETE /api/projects/:id
```

## 🔒 **Security Features**

- Firebase Auth token verification
- Organization-based access control
- Role-based permissions
- Input validation and sanitization
- CORS configuration
- Rate limiting (planned)

## 🧪 **Testing**

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suite
npm test -- --grep "Authentication"
```

## 📊 **Monitoring & Logging**

- Structured logging with context
- Error tracking and reporting
- Performance monitoring
- Health check endpoints
- Activity logging

## 🚀 **Deployment**

### Manual Deployment
```bash
# Deploy all functions
firebase deploy --only functions --project backbone-logic

# Deploy specific function
firebase deploy --only functions:loginUser --project backbone-logic
```

### Automated Deployment
```bash
# Use the deployment script
./deploy.sh
```

## 🔄 **Migration from Monolith**

This project represents a complete extraction from the monolithic Dashboard application:

### Before (Monolith)
- Single 36,000+ line file
- All functions in one place
- Difficult to maintain
- No modularity

### After (Modular)
- 80+ individual functions
- Organized by category
- Easy to maintain
- Reusable across projects

## 📚 **Documentation**

- **API Docs**: `/api/docs` (when deployed)
- **Health Check**: `/api/health`
- **Function List**: See README.md
- **Usage Examples**: See individual function files

## 🆘 **Troubleshooting**

### Common Issues

1. **Build Errors**
   ```bash
   npm run build
   # Check TypeScript compilation errors
   ```

2. **Deploy Errors**
   ```bash
   firebase login
   firebase use backbone-logic
   # Verify project configuration
   ```

3. **Runtime Errors**
   - Check Firebase Console logs
   - Verify environment variables
   - Check function permissions

4. **Permission Errors**
   - Verify authentication tokens
   - Check organization access
   - Validate user roles

### Debug Tools
- `debugRoleConversion` - Debug role mapping
- Health check endpoint
- Function logs in Firebase Console
- API documentation endpoint

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style
- Use TypeScript for all new code
- Follow existing naming conventions
- Add JSDoc comments for functions
- Include error handling
- Write unit tests

## 📈 **Performance**

### Optimizations
- Memory-optimized functions
- Efficient database queries
- Caching strategies
- Batch operations

### Scaling
- Auto-scaling based on demand
- Regional deployment
- Load balancing
- Resource optimization

## 🔗 **Integration**

### Dashboard v14.2
- Replace monolithic functions
- Use shared function imports
- Maintain existing API contracts

### Licensing Website
- Integrate with shared functions
- Unified authentication
- Consistent data access

### Standalone Apps
- Use shared functions for backend
- Consistent API patterns
- Unified error handling

## 📝 **Changelog**

### v14.2.0 (Initial Release)
- ✅ Complete function extraction from monolith
- ✅ Modular architecture implementation
- ✅ TypeScript migration
- ✅ Comprehensive error handling
- ✅ API documentation
- ✅ Testing framework
- ✅ Deployment automation

## 🎯 **Roadmap**

### v14.3.0 (Planned)
- [ ] Enhanced caching layer
- [ ] Rate limiting implementation
- [ ] Advanced monitoring
- [ ] Performance optimizations
- [ ] Additional AI features

### v15.0.0 (Future)
- [ ] GraphQL API layer
- [ ] Real-time subscriptions
- [ ] Advanced analytics
- [ ] Multi-region deployment

## 📞 **Support**

For questions, issues, or contributions:
- Create an issue in the repository
- Contact the development team
- Check the documentation
- Review existing issues

---

**🎯 MISSION: Providing robust, scalable, and maintainable Firebase Functions for the BACKBONE ecosystem**
