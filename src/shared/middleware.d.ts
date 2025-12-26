import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                uid: string;
                email: string;
                organizationId: string;
                role: string;
                hierarchy?: number;
                projectAssignments?: Record<string, any>;
            };
        }
    }
}
export declare const authenticateToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateOrganization: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateProjectAccess: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateDatasetAccess: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const validateSessionAccess: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const requireAuth: (req: Request, res: Response, next: NextFunction) => void;
export declare const requireAdmin: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=middleware.d.ts.map