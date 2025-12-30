import * as admin from 'firebase-admin';
import { Request, Response, NextFunction } from 'express';
import { createErrorResponse, validateOrganizationAccess, getUserOrganizationId } from './utils';

// Extend Express Request interface
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

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(createErrorResponse('No token provided'));
      return;
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Get user's organization ID - try from token claims first, then fallback to database lookup
    let organizationId: string | null = null;
    
    // Priority 1: Check if organizationId is in the token claims (most reliable)
    if (decodedToken.organizationId && typeof decodedToken.organizationId === 'string') {
      organizationId = decodedToken.organizationId;
      console.log(`✅ [AUTH] Found organizationId in token claims: ${organizationId}`);
    } else {
      // Priority 2: Fallback to database lookup
      try {
        organizationId = await getUserOrganizationId(decodedToken.uid, decodedToken.email || '');
      } catch (error: any) {
        console.error('❌ [AUTH] Error getting organizationId from database:', error?.message || error);
        // If database lookup fails, check for special cases
        const userEmail = decodedToken.email || '';
        if (userEmail === 'admin.clipshow@example.com') {
          organizationId = 'clip-show-pro-productions';
          console.log(`✅ [AUTH] Using special case for admin.clipshow: ${organizationId}`);
        } else if (userEmail === 'enterprise.user@enterprisemedia.com') {
          organizationId = 'enterprise-media-org';
          console.log(`✅ [AUTH] Using special case for enterprise user: ${organizationId}`);
        }
      }
    }
    
    if (!organizationId) {
      res.status(403).json(createErrorResponse('User not associated with any organization'));
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
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json(createErrorResponse('Invalid token'));
  }
};

export const validateOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { organizationId } = req.params;
    const userOrgId = req.user?.organizationId;

    if (organizationId && organizationId !== userOrgId) {
      res.status(403).json(createErrorResponse('Access denied to organization'));
      return;
    }

    next();
  } catch (error) {
    console.error('Organization validation error:', error);
    res.status(500).json(createErrorResponse('Organization validation failed'));
  }
};

export const validateProjectAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId || !projectId) {
      res.status(400).json(createErrorResponse('Missing required parameters'));
      return;
    }

    const hasAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasAccess) {
      res.status(403).json(createErrorResponse('Access denied to project'));
      return;
    }

    next();
  } catch (error) {
    console.error('Project access validation error:', error);
    res.status(500).json(createErrorResponse('Project access validation failed'));
  }
};

export const validateDatasetAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { datasetId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId || !datasetId) {
      res.status(400).json(createErrorResponse('Missing required parameters'));
      return;
    }

    const hasAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasAccess) {
      res.status(403).json(createErrorResponse('Access denied to dataset'));
      return;
    }

    next();
  } catch (error) {
    console.error('Dataset access validation error:', error);
    res.status(500).json(createErrorResponse('Dataset access validation failed'));
  }
};

export const validateSessionAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = req.user?.uid;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId || !sessionId) {
      res.status(400).json(createErrorResponse('Missing required parameters'));
      return;
    }

    const hasAccess = await validateOrganizationAccess(userId, organizationId);
    if (!hasAccess) {
      res.status(403).json(createErrorResponse('Access denied to session'));
      return;
    }

    next();
  } catch (error) {
    console.error('Session access validation error:', error);
    res.status(500).json(createErrorResponse('Session access validation failed'));
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json(createErrorResponse('Authentication required'));
    return;
  }
  next();
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json(createErrorResponse('Authentication required'));
    return;
  }

  const isAdmin = req.user.role === 'OWNER' || (req.user.hierarchy && req.user.hierarchy >= 90);
  if (!isAdmin) {
    res.status(403).json(createErrorResponse('Admin access required'));
    return;
  }

  next();
};