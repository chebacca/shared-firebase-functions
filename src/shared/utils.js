"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCorsHeaders = exports.getProjectHierarchy = exports.getProjectRole = exports.hasProjectAccess = exports.canAccessTimecardAdmin = exports.canManageOrganization = exports.isAdminUser = exports.updateCustomClaimsWithDualRoleSupport = exports.sendNotification = exports.logActivity = exports.createPaginatedResponse = exports.paginateQuery = exports.batchWrite = exports.createFieldValue = exports.createTimestamp = exports.formatDate = exports.validateRequiredFields = exports.validateEmail = exports.sanitizeInput = exports.generateId = exports.validateSessionAccess = exports.validateDatasetAccess = exports.validateProjectAccess = exports.getUserOrganizationId = exports.validateOrganizationAccess = exports.handleError = exports.createErrorResponse = exports.createSuccessResponse = exports.createApiResponse = exports.auth = exports.db = void 0;
var admin = require("firebase-admin");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.db = admin.firestore();
exports.auth = admin.auth();
var createApiResponse = function (success, data, error, message, errorDetails) { return ({
    success: success,
    data: data,
    error: error,
    message: message,
    errorDetails: errorDetails
}); };
exports.createApiResponse = createApiResponse;
var createSuccessResponse = function (data, message) { return (0, exports.createApiResponse)(true, data, undefined, message); };
exports.createSuccessResponse = createSuccessResponse;
var createErrorResponse = function (error, errorDetails, statusCode) {
    if (statusCode === void 0) { statusCode = 500; }
    return (0, exports.createApiResponse)(false, undefined, error, undefined, errorDetails);
};
exports.createErrorResponse = createErrorResponse;
var handleError = function (error, context) {
    console.error("[".concat(context, "] Error:"), error);
    var errorMessage = error.message || 'Internal server error';
    var errorDetails = error.stack || error.toString();
    return (0, exports.createErrorResponse)(errorMessage, errorDetails);
};
exports.handleError = handleError;
var validateOrganizationAccess = function (userId, organizationId) { return __awaiter(void 0, void 0, void 0, function () {
    var userDoc, userData, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, exports.db.collection('users').doc(userId).get()];
            case 1:
                userDoc = _a.sent();
                if (!userDoc.exists) {
                    return [2 /*return*/, false];
                }
                userData = userDoc.data();
                return [2 /*return*/, (userData === null || userData === void 0 ? void 0 : userData.organizationId) === organizationId];
            case 2:
                error_1 = _a.sent();
                console.error('Error validating organization access:', error_1);
                return [2 /*return*/, false];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.validateOrganizationAccess = validateOrganizationAccess;
var getUserOrganizationId = function (userId, userEmail) { return __awaiter(void 0, void 0, void 0, function () {
    var organizationId, userDoc, userData, error_2, teamMemberQuery, teamMemberDoc, teamMemberData, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                organizationId = null;
                // Special case: Handle enterprise user's dual organization issue
                if (userEmail === 'enterprise.user@enterprisemedia.com') {
                    console.log("[ORG LOOKUP] Special handling for enterprise user");
                    return [2 /*return*/, 'enterprise-media-org'];
                }
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, exports.db.collection('users').doc(userId).get()];
            case 2:
                userDoc = _a.sent();
                if (userDoc.exists) {
                    userData = userDoc.data();
                    organizationId = userData === null || userData === void 0 ? void 0 : userData.organizationId;
                    if (organizationId) {
                        console.log("[ORG LOOKUP] Found organization in users collection: ".concat(organizationId));
                        return [2 /*return*/, organizationId];
                    }
                }
                return [3 /*break*/, 4];
            case 3:
                error_2 = _a.sent();
                console.error('Error getting organization from users collection:', error_2);
                return [3 /*break*/, 4];
            case 4:
                _a.trys.push([4, 6, , 7]);
                return [4 /*yield*/, exports.db.collection('teamMembers')
                        .where('userId', '==', userId)
                        .limit(1)
                        .get()];
            case 5:
                teamMemberQuery = _a.sent();
                if (!teamMemberQuery.empty) {
                    teamMemberDoc = teamMemberQuery.docs[0];
                    teamMemberData = teamMemberDoc.data();
                    organizationId = teamMemberData === null || teamMemberData === void 0 ? void 0 : teamMemberData.organizationId;
                    if (organizationId) {
                        console.log("[ORG LOOKUP] Found organization in teamMembers collection: ".concat(organizationId));
                        return [2 /*return*/, organizationId];
                    }
                }
                return [3 /*break*/, 7];
            case 6:
                error_3 = _a.sent();
                console.error('Error getting organization from teamMembers collection:', error_3);
                return [3 /*break*/, 7];
            case 7:
                console.log("[ORG LOOKUP] No organization found for user: ".concat(userId));
                return [2 /*return*/, null];
        }
    });
}); };
exports.getUserOrganizationId = getUserOrganizationId;
var validateProjectAccess = function (userId, projectId, organizationId) { return __awaiter(void 0, void 0, void 0, function () {
    var hasOrgAccess, projectDoc, projectData, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, (0, exports.validateOrganizationAccess)(userId, organizationId)];
            case 1:
                hasOrgAccess = _a.sent();
                if (!hasOrgAccess) {
                    return [2 /*return*/, false];
                }
                return [4 /*yield*/, exports.db.collection('projects').doc(projectId).get()];
            case 2:
                projectDoc = _a.sent();
                if (!projectDoc.exists) {
                    return [2 /*return*/, false];
                }
                projectData = projectDoc.data();
                return [2 /*return*/, (projectData === null || projectData === void 0 ? void 0 : projectData.organizationId) === organizationId];
            case 3:
                error_4 = _a.sent();
                console.error('Error validating project access:', error_4);
                return [2 /*return*/, false];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.validateProjectAccess = validateProjectAccess;
var validateDatasetAccess = function (userId, datasetId, organizationId) { return __awaiter(void 0, void 0, void 0, function () {
    var hasOrgAccess, datasetDoc, datasetData, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, (0, exports.validateOrganizationAccess)(userId, organizationId)];
            case 1:
                hasOrgAccess = _a.sent();
                if (!hasOrgAccess) {
                    return [2 /*return*/, false];
                }
                return [4 /*yield*/, exports.db.collection('datasets').doc(datasetId).get()];
            case 2:
                datasetDoc = _a.sent();
                if (!datasetDoc.exists) {
                    return [2 /*return*/, false];
                }
                datasetData = datasetDoc.data();
                return [2 /*return*/, (datasetData === null || datasetData === void 0 ? void 0 : datasetData.organizationId) === organizationId];
            case 3:
                error_5 = _a.sent();
                console.error('Error validating dataset access:', error_5);
                return [2 /*return*/, false];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.validateDatasetAccess = validateDatasetAccess;
var validateSessionAccess = function (userId, sessionId, organizationId) { return __awaiter(void 0, void 0, void 0, function () {
    var hasOrgAccess, sessionDoc, sessionData, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, (0, exports.validateOrganizationAccess)(userId, organizationId)];
            case 1:
                hasOrgAccess = _a.sent();
                if (!hasOrgAccess) {
                    return [2 /*return*/, false];
                }
                return [4 /*yield*/, exports.db.collection('sessions').doc(sessionId).get()];
            case 2:
                sessionDoc = _a.sent();
                if (!sessionDoc.exists) {
                    return [2 /*return*/, false];
                }
                sessionData = sessionDoc.data();
                return [2 /*return*/, (sessionData === null || sessionData === void 0 ? void 0 : sessionData.organizationId) === organizationId];
            case 3:
                error_6 = _a.sent();
                console.error('Error validating session access:', error_6);
                return [2 /*return*/, false];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.validateSessionAccess = validateSessionAccess;
var generateId = function () {
    return exports.db.collection('_temp').doc().id;
};
exports.generateId = generateId;
var sanitizeInput = function (input) {
    if (typeof input === 'string') {
        return input.trim().replace(/[<>]/g, '');
    }
    if (typeof input === 'object' && input !== null) {
        var sanitized = {};
        for (var key in input) {
            sanitized[key] = (0, exports.sanitizeInput)(input[key]);
        }
        return sanitized;
    }
    return input;
};
exports.sanitizeInput = sanitizeInput;
var validateEmail = function (email) {
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
exports.validateEmail = validateEmail;
var validateRequiredFields = function (data, requiredFields) {
    var missingFields = [];
    for (var _i = 0, requiredFields_1 = requiredFields; _i < requiredFields_1.length; _i++) {
        var field = requiredFields_1[_i];
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            missingFields.push(field);
        }
    }
    return missingFields;
};
exports.validateRequiredFields = validateRequiredFields;
var formatDate = function (date) {
    if (date instanceof admin.firestore.Timestamp) {
        return date.toDate();
    }
    return date;
};
exports.formatDate = formatDate;
var createTimestamp = function () {
    return admin.firestore.Timestamp.now();
};
exports.createTimestamp = createTimestamp;
var createFieldValue = function () { return admin.firestore.FieldValue; };
exports.createFieldValue = createFieldValue;
var batchWrite = function (operations) { return __awaiter(void 0, void 0, void 0, function () {
    var batch, _i, operations_1, operation;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                batch = exports.db.batch();
                for (_i = 0, operations_1 = operations; _i < operations_1.length; _i++) {
                    operation = operations_1[_i];
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
                return [4 /*yield*/, batch.commit()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); };
exports.batchWrite = batchWrite;
var paginateQuery = function (query_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([query_1], args_1, true), void 0, function (query, page, limit) {
        var offset, countQuery, countSnapshot, total, paginatedQuery, snapshot;
        if (page === void 0) { page = 1; }
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    offset = (page - 1) * limit;
                    countQuery = query.limit(1000);
                    return [4 /*yield*/, countQuery.get()];
                case 1:
                    countSnapshot = _a.sent();
                    total = countSnapshot.size;
                    paginatedQuery = query.offset(offset).limit(limit);
                    return [4 /*yield*/, paginatedQuery.get()];
                case 2:
                    snapshot = _a.sent();
                    return [2 /*return*/, {
                            docs: snapshot.docs,
                            total: total
                        }];
            }
        });
    });
};
exports.paginateQuery = paginateQuery;
var createPaginatedResponse = function (data, page, limit, total) {
    var totalPages = Math.ceil(total / limit);
    return {
        data: data,
        pagination: {
            page: page,
            limit: limit,
            total: total,
            totalPages: totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
};
exports.createPaginatedResponse = createPaginatedResponse;
var logActivity = function (userId, organizationId, action, resource, resourceId, metadata) { return __awaiter(void 0, void 0, void 0, function () {
    var error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, exports.db.collection('activityLogs').add({
                        userId: userId,
                        organizationId: organizationId,
                        action: action,
                        resource: resource,
                        resourceId: resourceId,
                        metadata: metadata || {},
                        timestamp: (0, exports.createTimestamp)(),
                        createdAt: (0, exports.createTimestamp)()
                    })];
            case 1:
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_7 = _a.sent();
                console.error('Error logging activity:', error_7);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.logActivity = logActivity;
var sendNotification = function (userId, organizationId, type, title, message, data) { return __awaiter(void 0, void 0, void 0, function () {
    var error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, exports.db.collection('notifications').add({
                        userId: userId,
                        organizationId: organizationId,
                        type: type,
                        title: title,
                        message: message,
                        data: data || {},
                        read: false,
                        createdAt: (0, exports.createTimestamp)(),
                        updatedAt: (0, exports.createTimestamp)()
                    })];
            case 1:
                _a.sent();
                return [3 /*break*/, 3];
            case 2:
                error_8 = _a.sent();
                console.error('Error sending notification:', error_8);
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.sendNotification = sendNotification;
var updateCustomClaimsWithDualRoleSupport = function (userId, projectId, projectRole, projectHierarchy) { return __awaiter(void 0, void 0, void 0, function () {
    var userRecord, currentClaims, isOwner, ownerHierarchy, effectiveHierarchy, existingProjectAssignments, updatedProjectAssignments, enhancedClaims, error_9;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, exports.auth.getUser(userId)];
            case 1:
                userRecord = _b.sent();
                currentClaims = userRecord.customClaims || {};
                isOwner = currentClaims.role === 'OWNER' || currentClaims.isOrganizationOwner === true;
                ownerHierarchy = isOwner ? 100 : 0;
                effectiveHierarchy = Math.max(ownerHierarchy, projectHierarchy || 0);
                existingProjectAssignments = currentClaims.projectAssignments || {};
                updatedProjectAssignments = __assign(__assign({}, existingProjectAssignments), (_a = {}, _a[projectId] = {
                    roleId: projectRole,
                    roleName: projectRole,
                    hierarchy: projectHierarchy,
                    assignedAt: new Date().toISOString(),
                    syncedFromLicensing: true
                }, _a));
                enhancedClaims = __assign(__assign({}, currentClaims), { 
                    // Enhanced hierarchy system
                    hierarchy: effectiveHierarchy, effectiveHierarchy: effectiveHierarchy, dashboardHierarchy: effectiveHierarchy, 
                    // Dual role system
                    hasOwnershipRole: isOwner, hasProjectRoles: Object.keys(updatedProjectAssignments).length > 0, 
                    // Project assignments
                    projectAssignments: updatedProjectAssignments, currentProjectId: projectId, currentProjectRole: projectRole, currentProjectHierarchy: projectHierarchy, 
                    // Admin access preservation
                    isAdmin: effectiveHierarchy >= 90, canManageOrganization: isOwner || effectiveHierarchy >= 90, canAccessTimecardAdmin: effectiveHierarchy >= 90, 
                    // Enhanced permissions
                    permissions: __spreadArray(__spreadArray(__spreadArray([], (currentClaims.permissions || []), true), [
                        'read:projects',
                        'write:projects'
                    ], false), (effectiveHierarchy >= 90 ? ['admin:organization', 'admin:timecard'] : []), true).filter(function (perm, index, arr) { return arr.indexOf(perm) === index; }), 
                    // Update metadata
                    lastUpdated: Date.now(), dualRoleSystemEnabled: true });
                return [4 /*yield*/, exports.auth.setCustomUserClaims(userId, enhancedClaims)];
            case 2:
                _b.sent();
                console.log("[DUAL ROLE CLAIMS] Enhanced claims updated for user: ".concat(userId));
                console.log("   - Effective Hierarchy: ".concat(effectiveHierarchy));
                console.log("   - Is Owner: ".concat(isOwner));
                console.log("   - Admin Access: ".concat(effectiveHierarchy >= 90));
                console.log("   - Project Assignments: ".concat(Object.keys(updatedProjectAssignments).length));
                return [2 /*return*/, enhancedClaims];
            case 3:
                error_9 = _b.sent();
                console.error("[DUAL ROLE CLAIMS] Error updating claims for user ".concat(userId, ":"), error_9);
                throw error_9;
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.updateCustomClaimsWithDualRoleSupport = updateCustomClaimsWithDualRoleSupport;
var isAdminUser = function (user) {
    return user.hierarchy >= 90 || user.role === 'OWNER' || user.isOrganizationOwner === true;
};
exports.isAdminUser = isAdminUser;
var canManageOrganization = function (user) {
    return (0, exports.isAdminUser)(user) || user.canManageOrganization === true;
};
exports.canManageOrganization = canManageOrganization;
var canAccessTimecardAdmin = function (user) {
    return (0, exports.isAdminUser)(user) || user.canAccessTimecardAdmin === true;
};
exports.canAccessTimecardAdmin = canAccessTimecardAdmin;
var hasProjectAccess = function (user, projectId) {
    if ((0, exports.isAdminUser)(user)) {
        return true;
    }
    var projectAssignments = user.projectAssignments || {};
    return projectId in projectAssignments;
};
exports.hasProjectAccess = hasProjectAccess;
var getProjectRole = function (user, projectId) {
    var projectAssignments = user.projectAssignments || {};
    var assignment = projectAssignments[projectId];
    return assignment ? assignment.roleName : null;
};
exports.getProjectRole = getProjectRole;
var getProjectHierarchy = function (user, projectId) {
    var projectAssignments = user.projectAssignments || {};
    var assignment = projectAssignments[projectId];
    return assignment ? assignment.hierarchy : 0;
};
exports.getProjectHierarchy = getProjectHierarchy;
var setCorsHeaders = function (req, res) {
    var allowedOrigins = [
        'https://backbone-logic.web.app',
        'https://backbone-client.web.app',
        'https://backbone-callsheet-standalone.web.app',
        'https://dashboard-1c3a5.web.app',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:4003',
        'http://localhost:5173',
        'null'
    ];
    var origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || origin === 'null')) {
        res.set('Access-Control-Allow-Origin', origin || '*');
    }
    else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application-Mode, X-Requested-With, Cache-Control, Pragma, Expires, x-request-started-at, X-Request-Started-At, request-started-at, X-Request-ID, x-auth-token, X-Client-Type, x-client-type, X-Client-Version, x-client-version');
    res.set('Access-Control-Allow-Credentials', 'true');
};
exports.setCorsHeaders = setCorsHeaders;
