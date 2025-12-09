"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCorsHeaders = exports.getProjectHierarchy = exports.getProjectRole = exports.hasProjectAccess = exports.canAccessTimecardAdmin = exports.canManageOrganization = exports.isAdminUser = exports.updateCustomClaimsWithDualRoleSupport = exports.sendNotification = exports.logActivity = exports.createPaginatedResponse = exports.paginateQuery = exports.batchWrite = exports.createFieldValue = exports.createTimestamp = exports.formatDate = exports.validateRequiredFields = exports.validateEmail = exports.sanitizeInput = exports.generateId = exports.validateSessionAccess = exports.validateDatasetAccess = exports.validateProjectAccess = exports.getUserOrganizationId = exports.validateOrganizationAccess = exports.handleError = exports.createErrorResponse = exports.createSuccessResponse = exports.createApiResponse = exports.auth = exports.db = void 0;
const admin = require("firebase-admin");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.db = admin.firestore();
exports.auth = admin.auth();
const createApiResponse = (success, data, error, message, errorDetails) => ({
    success,
    data,
    error,
    message,
    errorDetails
});
exports.createApiResponse = createApiResponse;
const createSuccessResponse = (data, message) => (0, exports.createApiResponse)(true, data, undefined, message);
exports.createSuccessResponse = createSuccessResponse;
const createErrorResponse = (error, errorDetails, statusCode = 500) => (0, exports.createApiResponse)(false, undefined, error, undefined, errorDetails);
exports.createErrorResponse = createErrorResponse;
const handleError = (error, context) => {
    console.error(`[${context}] Error:`, error);
    const errorMessage = error.message || 'Internal server error';
    const errorDetails = error.stack || error.toString();
    return (0, exports.createErrorResponse)(errorMessage, errorDetails);
};
exports.handleError = handleError;
const validateOrganizationAccess = async (userId, organizationId) => {
    try {
        const userDoc = await exports.db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return false;
        }
        const userData = userDoc.data();
        return (userData === null || userData === void 0 ? void 0 : userData.organizationId) === organizationId;
    }
    catch (error) {
        console.error('Error validating organization access:', error);
        return false;
    }
};
exports.validateOrganizationAccess = validateOrganizationAccess;
const getUserOrganizationId = async (userId, userEmail) => {
    let organizationId = null;
    // Special case: Handle enterprise user's dual organization issue
    if (userEmail === 'enterprise.user@enterprisemedia.com') {
        console.log(`[ORG LOOKUP] Special handling for enterprise user`);
        return 'enterprise-media-org';
    }
    // Try to get from users collection first
    try {
        const userDoc = await exports.db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            organizationId = userData === null || userData === void 0 ? void 0 : userData.organizationId;
            if (organizationId) {
                console.log(`[ORG LOOKUP] Found organization in users collection: ${organizationId}`);
                return organizationId;
            }
        }
    }
    catch (error) {
        console.error('Error getting organization from users collection:', error);
    }
    // Try to get from teamMembers collection
    try {
        const teamMemberQuery = await exports.db.collection('teamMembers')
            .where('userId', '==', userId)
            .limit(1)
            .get();
        if (!teamMemberQuery.empty) {
            const teamMemberDoc = teamMemberQuery.docs[0];
            const teamMemberData = teamMemberDoc.data();
            organizationId = teamMemberData === null || teamMemberData === void 0 ? void 0 : teamMemberData.organizationId;
            if (organizationId) {
                console.log(`[ORG LOOKUP] Found organization in teamMembers collection: ${organizationId}`);
                return organizationId;
            }
        }
    }
    catch (error) {
        console.error('Error getting organization from teamMembers collection:', error);
    }
    console.log(`[ORG LOOKUP] No organization found for user: ${userId}`);
    return null;
};
exports.getUserOrganizationId = getUserOrganizationId;
const validateProjectAccess = async (userId, projectId, organizationId) => {
    try {
        // Check if user has access to the organization
        const hasOrgAccess = await (0, exports.validateOrganizationAccess)(userId, organizationId);
        if (!hasOrgAccess) {
            return false;
        }
        // Check if project belongs to the organization
        const projectDoc = await exports.db.collection('projects').doc(projectId).get();
        if (!projectDoc.exists) {
            return false;
        }
        const projectData = projectDoc.data();
        return (projectData === null || projectData === void 0 ? void 0 : projectData.organizationId) === organizationId;
    }
    catch (error) {
        console.error('Error validating project access:', error);
        return false;
    }
};
exports.validateProjectAccess = validateProjectAccess;
const validateDatasetAccess = async (userId, datasetId, organizationId) => {
    try {
        // Check if user has access to the organization
        const hasOrgAccess = await (0, exports.validateOrganizationAccess)(userId, organizationId);
        if (!hasOrgAccess) {
            return false;
        }
        // Check if dataset belongs to the organization
        const datasetDoc = await exports.db.collection('datasets').doc(datasetId).get();
        if (!datasetDoc.exists) {
            return false;
        }
        const datasetData = datasetDoc.data();
        return (datasetData === null || datasetData === void 0 ? void 0 : datasetData.organizationId) === organizationId;
    }
    catch (error) {
        console.error('Error validating dataset access:', error);
        return false;
    }
};
exports.validateDatasetAccess = validateDatasetAccess;
const validateSessionAccess = async (userId, sessionId, organizationId) => {
    try {
        // Check if user has access to the organization
        const hasOrgAccess = await (0, exports.validateOrganizationAccess)(userId, organizationId);
        if (!hasOrgAccess) {
            return false;
        }
        // Check if session belongs to the organization
        const sessionDoc = await exports.db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            return false;
        }
        const sessionData = sessionDoc.data();
        return (sessionData === null || sessionData === void 0 ? void 0 : sessionData.organizationId) === organizationId;
    }
    catch (error) {
        console.error('Error validating session access:', error);
        return false;
    }
};
exports.validateSessionAccess = validateSessionAccess;
const generateId = () => {
    return exports.db.collection('_temp').doc().id;
};
exports.generateId = generateId;
const sanitizeInput = (input) => {
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    if (typeof input === 'object' && input !== null) {
        const sanitized = {};
        for (const key in input) {
            sanitized[key] = (0, exports.sanitizeInput)(input[key]);
        }
        return sanitized;
    }
    return input;
};
exports.sanitizeInput = sanitizeInput;
const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
const validateRequiredFields = (data, requiredFields) => {
    const missingFields = [];
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            missingFields.push(field);
        }
    }
    return missingFields;
};
exports.validateRequiredFields = validateRequiredFields;
const formatDate = (date) => {
    if (date instanceof admin.firestore.Timestamp) {
        return date.toDate();
    }
    return date;
};
exports.formatDate = formatDate;
const createTimestamp = () => {
    return admin.firestore.Timestamp.now();
};
exports.createTimestamp = createTimestamp;
const createFieldValue = () => admin.firestore.FieldValue;
exports.createFieldValue = createFieldValue;
const batchWrite = async (operations) => {
    const batch = exports.db.batch();
    for (const operation of operations) {
        if (operation.type === 'set') {
            batch.set(operation.ref, operation.data, operation.options);
        }
        else if (operation.type === 'update') {
            batch.update(operation.ref, operation.data);
        }
        else if (operation.type === 'delete') {
            batch.delete(operation.ref);
        }
    }
    await batch.commit();
};
exports.batchWrite = batchWrite;
const paginateQuery = async (query, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    // Get total count
    const countQuery = query.limit(1000); // Firestore limit for counting
    const countSnapshot = await countQuery.get();
    const total = countSnapshot.size;
    // Get paginated results
    const paginatedQuery = query.offset(offset).limit(limit);
    const snapshot = await paginatedQuery.get();
    return {
        docs: snapshot.docs,
        total
    };
};
exports.paginateQuery = paginateQuery;
const createPaginatedResponse = (data, page, limit, total) => {
    const totalPages = Math.ceil(total / limit);
    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
};
exports.createPaginatedResponse = createPaginatedResponse;
const logActivity = async (userId, organizationId, action, resource, resourceId, metadata) => {
    try {
        await exports.db.collection('activityLogs').add({
            userId,
            organizationId,
            action,
            resource,
            resourceId,
            metadata: metadata || {},
            timestamp: (0, exports.createTimestamp)(),
            createdAt: (0, exports.createTimestamp)()
        });
    }
    catch (error) {
        console.error('Error logging activity:', error);
    }
};
exports.logActivity = logActivity;
const sendNotification = async (userId, organizationId, type, title, message, data) => {
    try {
        await exports.db.collection('notifications').add({
            userId,
            organizationId,
            type,
            title,
            message,
            data: data || {},
            read: false,
            createdAt: (0, exports.createTimestamp)(),
            updatedAt: (0, exports.createTimestamp)()
        });
    }
    catch (error) {
        console.error('Error sending notification:', error);
    }
};
exports.sendNotification = sendNotification;
const updateCustomClaimsWithDualRoleSupport = async (userId, projectId, projectRole, projectHierarchy, licensingRole) => {
    try {
        const userRecord = await exports.auth.getUser(userId);
        const currentClaims = userRecord.customClaims || {};
        // Determine licensing role (Tier 1: Organizational)
        // Priority: provided parameter > existing licensingRole > existing role > teamMemberRole
        const determinedLicensingRole = licensingRole ||
            currentClaims.licensingRole ||
            currentClaims.role ||
            (currentClaims.teamMemberRole ? currentClaims.teamMemberRole.toUpperCase() : 'MEMBER');
        // Determine if user is an owner
        const isOwner = determinedLicensingRole === 'OWNER' ||
            currentClaims.role === 'OWNER' ||
            currentClaims.isOrganizationOwner === true;
        const ownerHierarchy = isOwner ? 100 : 0;
        // Calculate effective hierarchy (max of owner and project hierarchy)
        const effectiveHierarchy = Math.max(ownerHierarchy, projectHierarchy || 0);
        // Preserve existing project assignments
        const existingProjectAssignments = currentClaims.projectAssignments || {};
        const updatedProjectAssignments = Object.assign(Object.assign({}, existingProjectAssignments), { [projectId]: {
                roleId: projectRole,
                roleName: projectRole,
                hierarchy: projectHierarchy,
                assignedAt: new Date().toISOString(),
                syncedFromLicensing: true
            } });
        // Create enhanced custom claims that preserve ownership
        const enhancedClaims = Object.assign(Object.assign({}, currentClaims), { 
            // Tier 1: Licensing Website Role (Organizational)
            licensingRole: determinedLicensingRole, 
            // Tier 2: App-Specific Roles (Functional)
            dashboardRole: currentClaims.dashboardRole || projectRole, clipShowProRole: currentClaims.clipShowProRole, callSheetRole: currentClaims.callSheetRole, 
            // Enhanced hierarchy system
            hierarchy: effectiveHierarchy, effectiveHierarchy: effectiveHierarchy, dashboardHierarchy: effectiveHierarchy, 
            // Dual role system
            hasOwnershipRole: isOwner, hasProjectRoles: Object.keys(updatedProjectAssignments).length > 0, 
            // Project assignments
            projectAssignments: updatedProjectAssignments, currentProjectId: projectId, currentProjectRole: projectRole, currentProjectHierarchy: projectHierarchy, 
            // Admin access preservation
            isAdmin: effectiveHierarchy >= 90, canManageOrganization: isOwner || effectiveHierarchy >= 90, canAccessTimecardAdmin: effectiveHierarchy >= 90, 
            // Legacy compatibility (keep for backward compatibility)
            role: determinedLicensingRole, teamMemberRole: currentClaims.teamMemberRole || determinedLicensingRole.toLowerCase(), 
            // Enhanced permissions
            permissions: [
                ...(currentClaims.permissions || []),
                'read:projects',
                'write:projects',
                ...(effectiveHierarchy >= 90 ? ['admin:organization', 'admin:timecard'] : [])
            ].filter((perm, index, arr) => arr.indexOf(perm) === index), 
            // Update metadata
            lastUpdated: Date.now(), dualRoleSystemEnabled: true });
        await exports.auth.setCustomUserClaims(userId, enhancedClaims);
        console.log(`[DUAL ROLE CLAIMS] Enhanced claims updated for user: ${userId}`);
        console.log(`   - Licensing Role (Tier 1): ${determinedLicensingRole}`);
        console.log(`   - Dashboard Role (Tier 2): ${enhancedClaims.dashboardRole}`);
        console.log(`   - Effective Hierarchy: ${effectiveHierarchy}`);
        console.log(`   - Is Owner: ${isOwner}`);
        console.log(`   - Admin Access: ${effectiveHierarchy >= 90}`);
        console.log(`   - Project Assignments: ${Object.keys(updatedProjectAssignments).length}`);
        return enhancedClaims;
    }
    catch (error) {
        console.error(`[DUAL ROLE CLAIMS] Error updating claims for user ${userId}:`, error);
        throw error;
    }
};
exports.updateCustomClaimsWithDualRoleSupport = updateCustomClaimsWithDualRoleSupport;
const isAdminUser = (user) => {
    return user.hierarchy >= 90 || user.role === 'OWNER' || user.isOrganizationOwner === true;
};
exports.isAdminUser = isAdminUser;
const canManageOrganization = (user) => {
    return (0, exports.isAdminUser)(user) || user.canManageOrganization === true;
};
exports.canManageOrganization = canManageOrganization;
const canAccessTimecardAdmin = (user) => {
    return (0, exports.isAdminUser)(user) || user.canAccessTimecardAdmin === true;
};
exports.canAccessTimecardAdmin = canAccessTimecardAdmin;
const hasProjectAccess = (user, projectId) => {
    if ((0, exports.isAdminUser)(user)) {
        return true;
    }
    const projectAssignments = user.projectAssignments || {};
    return projectId in projectAssignments;
};
exports.hasProjectAccess = hasProjectAccess;
const getProjectRole = (user, projectId) => {
    const projectAssignments = user.projectAssignments || {};
    const assignment = projectAssignments[projectId];
    return assignment ? assignment.roleName : null;
};
exports.getProjectRole = getProjectRole;
const getProjectHierarchy = (user, projectId) => {
    const projectAssignments = user.projectAssignments || {};
    const assignment = projectAssignments[projectId];
    return assignment ? assignment.hierarchy : 0;
};
exports.getProjectHierarchy = getProjectHierarchy;
const setCorsHeaders = (req, res) => {
    const allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://backbone-callsheet-standalone.web.app',
        'https://dashboard-1c3a5.web.app',
        'https://clipshowpro.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4002',
        'http://localhost:4003',
        'http://localhost:4007',
        'http://localhost:4010',
        'http://localhost:5173',
        'null'
    ];
    const origin = req.headers.origin;
    // Always allow the origin that made the request in development mode
    if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR === 'true') {
        res.set('Access-Control-Allow-Origin', origin || '*');
    }
    else if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    else if (origin && origin.includes('localhost')) {
        // Always allow localhost origins (for development/testing)
        res.set('Access-Control-Allow-Origin', origin);
    }
    else {
        // In production, be more restrictive but still allow the request to proceed
        res.set('Access-Control-Allow-Origin', 'https://backbone-client.web.app');
    }
    // Set other CORS headers
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version, Origin');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Max-Age', '3600'); // Cache preflight request for 1 hour
};
exports.setCorsHeaders = setCorsHeaders;
//# sourceMappingURL=utils.js.map