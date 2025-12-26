"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.requireAuth = exports.validateSessionAccess = exports.validateDatasetAccess = exports.validateProjectAccess = exports.validateOrganization = exports.authenticateToken = void 0;
const admin = __importStar(require("firebase-admin"));
const utils_1 = require("./utils");
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json((0, utils_1.createErrorResponse)('No token provided'));
            return;
        }
        const token = authHeader.split(' ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        // Get user's organization ID
        const organizationId = await (0, utils_1.getUserOrganizationId)(decodedToken.uid, decodedToken.email || '');
        if (!organizationId) {
            res.status(403).json((0, utils_1.createErrorResponse)('User not associated with any organization'));
            return;
        }
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            organizationId,
            role: decodedToken.role || 'USER',
            hierarchy: decodedToken.hierarchy || 0,
            projectAssignments: decodedToken.projectAssignments || {}
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json((0, utils_1.createErrorResponse)('Invalid token'));
    }
};
exports.authenticateToken = authenticateToken;
const validateOrganization = async (req, res, next) => {
    try {
        const { organizationId } = req.params;
        const userOrgId = req.user?.organizationId;
        if (organizationId && organizationId !== userOrgId) {
            res.status(403).json((0, utils_1.createErrorResponse)('Access denied to organization'));
            return;
        }
        next();
    }
    catch (error) {
        console.error('Organization validation error:', error);
        res.status(500).json((0, utils_1.createErrorResponse)('Organization validation failed'));
    }
};
exports.validateOrganization = validateOrganization;
const validateProjectAccess = async (req, res, next) => {
    try {
        const { projectId } = req.params;
        const userId = req.user?.uid;
        const organizationId = req.user?.organizationId;
        if (!userId || !organizationId || !projectId) {
            res.status(400).json((0, utils_1.createErrorResponse)('Missing required parameters'));
            return;
        }
        const hasAccess = await (0, utils_1.validateOrganizationAccess)(userId, organizationId);
        if (!hasAccess) {
            res.status(403).json((0, utils_1.createErrorResponse)('Access denied to project'));
            return;
        }
        next();
    }
    catch (error) {
        console.error('Project access validation error:', error);
        res.status(500).json((0, utils_1.createErrorResponse)('Project access validation failed'));
    }
};
exports.validateProjectAccess = validateProjectAccess;
const validateDatasetAccess = async (req, res, next) => {
    try {
        const { datasetId } = req.params;
        const userId = req.user?.uid;
        const organizationId = req.user?.organizationId;
        if (!userId || !organizationId || !datasetId) {
            res.status(400).json((0, utils_1.createErrorResponse)('Missing required parameters'));
            return;
        }
        const hasAccess = await (0, utils_1.validateOrganizationAccess)(userId, organizationId);
        if (!hasAccess) {
            res.status(403).json((0, utils_1.createErrorResponse)('Access denied to dataset'));
            return;
        }
        next();
    }
    catch (error) {
        console.error('Dataset access validation error:', error);
        res.status(500).json((0, utils_1.createErrorResponse)('Dataset access validation failed'));
    }
};
exports.validateDatasetAccess = validateDatasetAccess;
const validateSessionAccess = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user?.uid;
        const organizationId = req.user?.organizationId;
        if (!userId || !organizationId || !sessionId) {
            res.status(400).json((0, utils_1.createErrorResponse)('Missing required parameters'));
            return;
        }
        const hasAccess = await (0, utils_1.validateOrganizationAccess)(userId, organizationId);
        if (!hasAccess) {
            res.status(403).json((0, utils_1.createErrorResponse)('Access denied to session'));
            return;
        }
        next();
    }
    catch (error) {
        console.error('Session access validation error:', error);
        res.status(500).json((0, utils_1.createErrorResponse)('Session access validation failed'));
    }
};
exports.validateSessionAccess = validateSessionAccess;
const requireAuth = (req, res, next) => {
    if (!req.user) {
        res.status(401).json((0, utils_1.createErrorResponse)('Authentication required'));
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        res.status(401).json((0, utils_1.createErrorResponse)('Authentication required'));
        return;
    }
    const isAdmin = req.user.role === 'OWNER' || (req.user.hierarchy && req.user.hierarchy >= 90);
    if (!isAdmin) {
        res.status(403).json((0, utils_1.createErrorResponse)('Admin access required'));
        return;
    }
    next();
};
exports.requireAdmin = requireAdmin;
//# sourceMappingURL=middleware.js.map