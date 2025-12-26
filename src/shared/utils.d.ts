import * as admin from 'firebase-admin';
import { ApiResponse } from './types';
export declare const db: admin.firestore.Firestore;
export declare const auth: import("node_modules/firebase-admin/lib/auth").Auth;
export declare const createApiResponse: <T>(success: boolean, data?: T, error?: string, message?: string, errorDetails?: string) => ApiResponse<T>;
export declare const createSuccessResponse: <T>(data: T, message?: string) => ApiResponse<T>;
export declare const createErrorResponse: (error: string, errorDetails?: string, statusCode?: number) => ApiResponse;
export declare const handleError: (error: any, context: string) => ApiResponse;
export declare const validateOrganizationAccess: (userId: string, organizationId: string) => Promise<boolean>;
export declare const getUserOrganizationId: (userId: string, userEmail: string) => Promise<string | null>;
export declare const validateProjectAccess: (userId: string, projectId: string, organizationId: string) => Promise<boolean>;
export declare const validateDatasetAccess: (userId: string, datasetId: string, organizationId: string) => Promise<boolean>;
export declare const validateSessionAccess: (userId: string, sessionId: string, organizationId: string) => Promise<boolean>;
export declare const generateId: () => string;
export declare const sanitizeInput: (input: any) => any;
export declare const validateEmail: (email: string) => boolean;
export declare const validateRequiredFields: (data: any, requiredFields: string[]) => string[];
export declare const formatDate: (date: Date | admin.firestore.Timestamp) => Date;
export declare const createTimestamp: () => admin.firestore.Timestamp;
export declare const createFieldValue: () => typeof admin.firestore.FieldValue;
export declare const batchWrite: (operations: any[]) => Promise<void>;
export declare const paginateQuery: (query: admin.firestore.Query, page?: number, limit?: number) => Promise<{
    docs: admin.firestore.QueryDocumentSnapshot[];
    total: number;
}>;
export declare const createPaginatedResponse: <T>(data: T[], page: number, limit: number, total: number) => {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
};
export declare const logActivity: (userId: string, organizationId: string, action: string, resource: string, resourceId: string, metadata?: Record<string, any>) => Promise<void>;
export declare const sendNotification: (userId: string, organizationId: string, type: string, title: string, message: string, data?: Record<string, any>) => Promise<void>;
export declare const updateCustomClaimsWithDualRoleSupport: (userId: string, projectId: string, projectRole: string, projectHierarchy: number, licensingRole?: string) => Promise<any>;
export declare const isAdminUser: (user: any) => boolean;
export declare const canManageOrganization: (user: any) => boolean;
export declare const canAccessTimecardAdmin: (user: any) => boolean;
export declare const hasProjectAccess: (user: any, projectId: string) => boolean;
export declare const getProjectRole: (user: any, projectId: string) => string | null;
export declare const getProjectHierarchy: (user: any, projectId: string) => number;
export declare const setCorsHeaders: (req: any, res: any) => void;
//# sourceMappingURL=utils.d.ts.map