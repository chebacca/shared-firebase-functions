"use strict";
/**
 * 🔥 APP ROLE DEFINITION SERVICE
 *
 * Manages app role definitions (system defaults + organization custom)
 * for the hybrid dynamic app role system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.appRoleDefinitionService = exports.AppRoleDefinitionService = void 0;
const utils_1 = require("../shared/utils");
// Role enum definitions for system defaults
const DashboardRole = {
    ADMIN: 'ADMIN',
    EXEC: 'EXEC',
    MANAGER: 'MANAGER',
    POST_COORDINATOR: 'POST_COORDINATOR',
    PRODUCER: 'PRODUCER',
    ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
    POST_PRODUCER: 'POST_PRODUCER',
    LINE_PRODUCER: 'LINE_PRODUCER',
    DIRECTOR: 'DIRECTOR',
    EDITOR: 'EDITOR',
    ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
    WRITER: 'WRITER',
    LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
    MEDIA_MANAGER: 'MEDIA_MANAGER',
    PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
    VIEWER: 'VIEWER'
};
const ClipShowProRole = {
    PRODUCER: 'PRODUCER',
    SUPERVISING_PRODUCER: 'SUPERVISING_PRODUCER',
    SERIES_PRODUCER: 'SERIES_PRODUCER',
    ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
    DIRECTOR: 'DIRECTOR',
    WRITER: 'WRITER',
    EDITOR: 'EDITOR',
    ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
    ASSEMBLY_EDITOR: 'ASSEMBLY_EDITOR',
    LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
    CLEARANCE_COORDINATOR: 'CLEARANCE_COORDINATOR',
    RESEARCHER: 'RESEARCHER',
    POST_PRODUCER: 'POST_PRODUCER',
    LINE_PRODUCER: 'LINE_PRODUCER',
    PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
    MEDIA_MANAGER: 'MEDIA_MANAGER'
};
const CallSheetRole = {
    ADMIN: 'ADMIN',
    PRODUCER: 'PRODUCER',
    COORDINATOR: 'COORDINATOR',
    MEMBER: 'MEMBER'
};
const CuesheetRole = {
    PRODUCER: 'PRODUCER',
    SUPERVISING_PRODUCER: 'SUPERVISING_PRODUCER',
    SERIES_PRODUCER: 'SERIES_PRODUCER',
    ASSOCIATE_PRODUCER: 'ASSOCIATE_PRODUCER',
    DIRECTOR: 'DIRECTOR',
    WRITER: 'WRITER',
    EDITOR: 'EDITOR',
    ASSISTANT_EDITOR: 'ASSISTANT_EDITOR',
    ASSEMBLY_EDITOR: 'ASSEMBLY_EDITOR',
    LICENSING_SPECIALIST: 'LICENSING_SPECIALIST',
    CLEARANCE_COORDINATOR: 'CLEARANCE_COORDINATOR',
    RESEARCHER: 'RESEARCHER',
    POST_PRODUCER: 'POST_PRODUCER',
    LINE_PRODUCER: 'LINE_PRODUCER',
    PRODUCTION_ASSISTANT: 'PRODUCTION_ASSISTANT',
    MEDIA_MANAGER: 'MEDIA_MANAGER',
    ADMIN: 'ADMIN',
    VIEWER: 'VIEWER'
};
// System default enum maps for fast validation
const SYSTEM_DEFAULT_ENUMS = {
    dashboard: DashboardRole,
    clipShowPro: ClipShowProRole,
    callSheet: CallSheetRole,
    cuesheet: CuesheetRole
};
// Validation function
function validateAppRoleValue(roleValue) {
    const pattern = /^[A-Z][A-Z0-9_]*$/;
    if (!pattern.test(roleValue)) {
        return {
            valid: false,
            error: 'Role value must be uppercase with underscores only (e.g., VFX_SUPERVISOR)'
        };
    }
    if (roleValue.length < 2) {
        return {
            valid: false,
            error: 'Role value must be at least 2 characters'
        };
    }
    if (roleValue.length > 50) {
        return {
            valid: false,
            error: 'Role value must be no more than 50 characters'
        };
    }
    return { valid: true };
}
class AppRoleDefinitionService {
    constructor() {
        this.systemDefaultsCache = new Map();
        this.customRolesCache = new Map();
    }
    static getInstance() {
        if (!AppRoleDefinitionService.instance) {
            AppRoleDefinitionService.instance = new AppRoleDefinitionService();
        }
        return AppRoleDefinitionService.instance;
    }
    /**
     * Check if a role value is a system default (using enum check)
     */
    isSystemDefaultRoleValue(roleValue, appName) {
        const enumMap = SYSTEM_DEFAULT_ENUMS[appName];
        if (!enumMap)
            return false;
        return Object.values(enumMap).includes(roleValue);
    }
    /**
     * Get system default app role definitions
     */
    async getSystemDefaults(appName, useCache = true) {
        // Check cache first
        if (useCache && this.systemDefaultsCache.has(appName)) {
            return this.systemDefaultsCache.get(appName);
        }
        try {
            const snapshot = await utils_1.db.collection('appRoleDefinitions')
                .where('organizationId', '==', null)
                .where('appName', '==', appName)
                .where('isActive', '==', true)
                .get();
            const roles = snapshot.docs.map(doc => {
                var _a, _b;
                return (Object.assign(Object.assign({ id: doc.id }, doc.data()), { createdAt: ((_a = doc.data().createdAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date(), updatedAt: ((_b = doc.data().updatedAt) === null || _b === void 0 ? void 0 : _b.toDate()) || new Date() }));
            });
            // Cache the results
            this.systemDefaultsCache.set(appName, roles);
            return roles;
        }
        catch (error) {
            console.error(`[AppRoleDefinitionService] Error getting system defaults for ${appName}:`, error);
            // Fallback to enum values if Firestore query fails
            return this.getSystemDefaultsFromEnum(appName);
        }
    }
    /**
     * Fallback: Get system defaults from enum (if Firestore not available)
     */
    getSystemDefaultsFromEnum(appName) {
        const enumMap = SYSTEM_DEFAULT_ENUMS[appName];
        if (!enumMap)
            return [];
        return Object.values(enumMap).map((roleValue) => ({
            id: `system-${appName}-${roleValue}`,
            organizationId: null,
            appName: appName,
            roleValue: roleValue,
            displayName: roleValue.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            description: `System default ${roleValue} role`,
            isSystemDefault: true,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
    }
    /**
     * Get organization custom app role definitions
     */
    async getOrganizationCustomRoles(orgId, appName, useCache = true) {
        // Check cache first
        if (useCache) {
            const orgCache = this.customRolesCache.get(orgId);
            if (orgCache && orgCache.has(appName)) {
                return orgCache.get(appName);
            }
        }
        try {
            const snapshot = await utils_1.db.collection('appRoleDefinitions')
                .where('organizationId', '==', orgId)
                .where('appName', '==', appName)
                .where('isActive', '==', true)
                .get();
            const roles = snapshot.docs.map(doc => {
                var _a, _b;
                return (Object.assign(Object.assign({ id: doc.id }, doc.data()), { createdAt: ((_a = doc.data().createdAt) === null || _a === void 0 ? void 0 : _a.toDate()) || new Date(), updatedAt: ((_b = doc.data().updatedAt) === null || _b === void 0 ? void 0 : _b.toDate()) || new Date() }));
            });
            // Cache the results
            if (!this.customRolesCache.has(orgId)) {
                this.customRolesCache.set(orgId, new Map());
            }
            this.customRolesCache.get(orgId).set(appName, roles);
            return roles;
        }
        catch (error) {
            console.error(`[AppRoleDefinitionService] Error getting custom roles for ${orgId}/${appName}:`, error);
            return [];
        }
    }
    /**
     * Get all available app roles (system defaults + organization custom)
     */
    async getAvailableAppRoles(orgId, appName) {
        const [systemDefaults, customRoles] = await Promise.all([
            this.getSystemDefaults(appName),
            this.getOrganizationCustomRoles(orgId, appName)
        ]);
        // Combine and sort: system defaults first, then custom
        return [...systemDefaults, ...customRoles];
    }
    /**
     * Get all available role values as strings
     */
    async getAvailableRoleValues(orgId, appName) {
        const roles = await this.getAvailableAppRoles(orgId, appName);
        return roles.map(role => role.roleValue);
    }
    /**
     * Validate if a role value is valid for an organization
     */
    async validateAppRole(orgId, appName, roleValue) {
        // First check format
        const formatValidation = validateAppRoleValue(roleValue);
        if (!formatValidation.valid) {
            return formatValidation;
        }
        // Check if it's a system default (fast enum check)
        const isSystemDefault = this.isSystemDefaultRoleValue(roleValue, appName);
        if (isSystemDefault) {
            return { valid: true, isSystemDefault: true };
        }
        // Check if it's an organization custom role
        const customRoles = await this.getOrganizationCustomRoles(orgId, appName);
        const exists = customRoles.some(role => role.roleValue === roleValue);
        if (exists) {
            return { valid: true, isSystemDefault: false };
        }
        return {
            valid: false,
            error: `Role value "${roleValue}" is not available for ${appName}. It must be a system default or a custom role created by your organization.`
        };
    }
    /**
     * Create a custom app role definition
     */
    async createCustomAppRole(orgId, appName, role, createdBy) {
        // Validate format
        const formatValidation = validateAppRoleValue(role.roleValue);
        if (!formatValidation.valid) {
            throw new Error(formatValidation.error || 'Invalid role value format');
        }
        // Check if it conflicts with system default (case-insensitive)
        if (this.isSystemDefaultRoleValue(role.roleValue, appName)) {
            throw new Error(`Role value "${role.roleValue}" conflicts with a system default. Please choose a different value.`);
        }
        // Check if it already exists for this organization
        const existing = await utils_1.db.collection('appRoleDefinitions')
            .where('organizationId', '==', orgId)
            .where('appName', '==', appName)
            .where('roleValue', '==', role.roleValue)
            .where('isActive', '==', true)
            .limit(1)
            .get();
        if (!existing.empty) {
            throw new Error(`Role value "${role.roleValue}" already exists for ${appName} in your organization.`);
        }
        // Create the custom role
        const roleData = {
            organizationId: orgId,
            appName: appName,
            roleValue: role.roleValue,
            displayName: role.displayName,
            description: role.description || '',
            permissions: role.permissions || [],
            hierarchy: role.hierarchy,
            isSystemDefault: false,
            isActive: true,
            createdAt: (0, utils_1.createFieldValue)().serverTimestamp(),
            updatedAt: (0, utils_1.createFieldValue)().serverTimestamp(),
            createdBy: createdBy
        };
        // Add equivalentEnum if provided
        if (role.equivalentEnum) {
            roleData.equivalentEnum = role.equivalentEnum;
        }
        const docRef = await utils_1.db.collection('appRoleDefinitions').add(roleData);
        // Invalidate cache
        this.invalidateCache(orgId, appName);
        return Object.assign(Object.assign({ id: docRef.id }, roleData), { createdAt: new Date(), updatedAt: new Date() });
    }
    /**
     * Update a custom app role definition
     */
    async updateCustomAppRole(orgId, appName, roleId, updates) {
        // Verify the role belongs to the organization and is not a system default
        const roleDoc = await utils_1.db.collection('appRoleDefinitions').doc(roleId).get();
        if (!roleDoc.exists) {
            throw new Error('Role definition not found');
        }
        const roleData = roleDoc.data();
        if (roleData.organizationId !== orgId) {
            throw new Error('Access denied: Role does not belong to your organization');
        }
        if (roleData.isSystemDefault) {
            throw new Error('Cannot update system default roles');
        }
        // Update the role
        const updateData = Object.assign(Object.assign({}, updates), { updatedAt: (0, utils_1.createFieldValue)().serverTimestamp() });
        await utils_1.db.collection('appRoleDefinitions').doc(roleId).update(updateData);
        // Invalidate cache
        this.invalidateCache(orgId, appName);
        // Return updated role
        const updatedDoc = await utils_1.db.collection('appRoleDefinitions').doc(roleId).get();
        return Object.assign(Object.assign({ id: updatedDoc.id }, updatedDoc.data()), { createdAt: roleData.createdAt, updatedAt: new Date() });
    }
    /**
     * Delete (soft delete) a custom app role definition
     */
    async deleteCustomAppRole(orgId, appName, roleId) {
        // Verify the role belongs to the organization and is not a system default
        const roleDoc = await utils_1.db.collection('appRoleDefinitions').doc(roleId).get();
        if (!roleDoc.exists) {
            throw new Error('Role definition not found');
        }
        const roleData = roleDoc.data();
        if (roleData.organizationId !== orgId) {
            throw new Error('Access denied: Role does not belong to your organization');
        }
        if (roleData.isSystemDefault) {
            throw new Error('Cannot delete system default roles');
        }
        // Soft delete
        await utils_1.db.collection('appRoleDefinitions').doc(roleId).update({
            isActive: false,
            updatedAt: (0, utils_1.createFieldValue)().serverTimestamp()
        });
        // Invalidate cache
        this.invalidateCache(orgId, appName);
        return true;
    }
    /**
     * Invalidate cache for an organization and app
     */
    invalidateCache(orgId, appName) {
        const orgCache = this.customRolesCache.get(orgId);
        if (orgCache) {
            orgCache.delete(appName);
        }
    }
    /**
     * Clear all caches (useful for testing or forced refresh)
     */
    clearCache() {
        this.systemDefaultsCache.clear();
        this.customRolesCache.clear();
    }
}
exports.AppRoleDefinitionService = AppRoleDefinitionService;
exports.appRoleDefinitionService = AppRoleDefinitionService.getInstance();
//# sourceMappingURL=AppRoleDefinitionService.js.map