/**
 * 🔥 Simplified Context Middleware for Firebase Functions
 * 
 * Basic context injection middleware that works with existing Firebase setup
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';

// Simple context interfaces
interface SimpleUserContext {
  userId: string;
  email: string;
  organizationId?: string;
}

interface SimpleOrganizationContext {
  organizationId: string;
  name: string;
  tier: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      userContext?: SimpleUserContext;
      organizationContext?: SimpleOrganizationContext;
    }
  }
}

/**
 * Simple Context Middleware
 */
export class SimpleContextMiddleware {
  private static instance: SimpleContextMiddleware;
  private db: admin.firestore.Firestore;

  private constructor() {
    this.db = admin.firestore();
  }

  static getInstance(): SimpleContextMiddleware {
    if (!this.instance) {
      this.instance = new SimpleContextMiddleware();
    }
    return this.instance;
  }

  /**
   * Main middleware function
   */
  public middleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip context loading for public routes
      if (this.isPublicRoute(req.path)) {
        return next();
      }

      // Verify authentication (use existing auth middleware logic)
      const user = await this.verifyAuthentication(req);
      if (!user) {
        return next(); // Let existing auth middleware handle this
      }

      // Load simple user context
      const userContext: SimpleUserContext = {
        userId: user.uid,
        email: user.email || '',
        organizationId: user.organizationId || undefined
      };

      req.userContext = userContext;

      // Load organization context if available
      if (userContext.organizationId) {
        try {
          const orgDoc = await this.db.collection('organizations').doc(userContext.organizationId).get();
          if (orgDoc.exists) {
            const orgData = orgDoc.data();
            req.organizationContext = {
              organizationId: userContext.organizationId,
              name: orgData?.name || 'Unknown Organization',
              tier: orgData?.tier || 'free'
            };
          }
        } catch (error) {
          console.warn('Failed to load organization context:', error);
        }
      }

      next();
    } catch (error) {
      console.error('Context middleware error:', error);
      next(); // Continue without context
    }
  };

  /**
   * Verify Firebase authentication token
   */
  private async verifyAuthentication(req: Request): Promise<admin.auth.DecodedIdToken | null> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }

      const token = authHeader.split(' ')[1];
      return await admin.auth().verifyIdToken(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if route is public
   */
  private isPublicRoute(path: string): boolean {
    const publicRoutes = [
      '/health', 
      '/status', 
      '/api/auth/login', 
      '/api/auth/register'
    ];
    return publicRoutes.some(route => path.startsWith(route));
  }
}

// Export singleton instance
export const simpleContextMiddleware = SimpleContextMiddleware.getInstance().middleware;
