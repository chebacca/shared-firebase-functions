import * as admin from 'firebase-admin';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  errorDetails?: string;
}

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email: string;
    organizationId: string;
    role: string;
    hierarchy?: number;
    projectAssignments?: Record<string, any>;
  };
}

export interface Project {
  id?: string;
  name: string;
  description: string;
  organizationId: string;
  createdBy: string;
  applicationMode?: string;
  storageBackend?: string;
  allowCollaboration?: boolean;
  maxCollaborators?: number;
  realTimeEnabled?: boolean;
  status?: 'active' | 'inactive' | 'archived';
  isActive?: boolean;
  isArchived?: boolean;
  createdAt: admin.firestore.Timestamp;
  lastAccessedAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  teamMembers?: string[];
}

export interface Dataset {
  id?: string;
  name: string;
  type: string;
  organizationId: string;
  createdBy: string;
  size?: number;
  description?: string;
  metadata?: Record<string, any>;
  status?: 'active' | 'inactive' | 'archived';
  isActive?: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  projectId?: string;
}

export interface Session {
  id?: string;
  name: string;
  projectId: string;
  organizationId: string;
  createdBy: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface TeamMember {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  hierarchy: number;
  projectAssignments?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  permissions?: string[];
}

export interface License {
  id?: string;
  userId: string;
  organizationId: string;
  type: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  expiresAt?: Date;
  features?: string[];
  subscriptionId?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Notification {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
  data?: Record<string, any>;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface NetworkDeliveryBible {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  organizationId: string;
  projectId: string | null;
  uploadedBy: string;
  uploadedAt: admin.firestore.Timestamp;
  rawText: string | null;
  deliverableCount: number;
  parsedAt?: admin.firestore.Timestamp;
  error?: string;
}

export interface Deliverable {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  organizationId: string;
  projectId: string;
  sessionId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  description?: string;
  metadata?: Record<string, any>;
}

export interface Timecard {
  id: string;
  userId: string;
  organizationId: string;
  projectId: string;
  sessionId?: string;
  date: Date;
  hoursWorked: number;
  description?: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  rejectionReason?: string;
}

export interface Organization {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  settings?: Record<string, any>;
  subscription?: {
    type: string;
    status: string;
    expiresAt?: Date;
  };
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
  organizationId: string;
  role: string;
  hierarchy?: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  lastLoginAt?: Date;
  preferences?: Record<string, any>;
  customClaims?: Record<string, any>;
}

export interface EDLFile {
  id: string;
  fileName: string;
  fileType: 'edl' | 'xml' | 'fcpxml';
  content: string;
  organizationId: string;
  projectId?: string;
  uploadedBy: string;
  uploadedAt: Date;
  processedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  metadata?: Record<string, any>;
}

export interface Payment {
  id?: string;
  userId: string;
  organizationId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  type: 'subscription' | 'one_time' | 'upgrade';
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  description?: string;
  metadata?: Record<string, any>;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export interface Subscription {
  id: string;
  userId: string;
  organizationId: string;
  planId: string;
  status: 'active' | 'inactive' | 'cancelled' | 'past_due';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  stripeSubscriptionId: string;
  createdAt: Date;
  updatedAt: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, any>;
}

// Request/Response types for API endpoints
export interface CreateProjectRequest {
  name: string;
  description?: string;
  organizationId: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
}

export interface CreateDatasetRequest {
  name: string;
  type: string;
  organizationId: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

export interface CreateSessionRequest {
  name: string;
  projectId: string;
  organizationId: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CreateTeamMemberRequest {
  userId: string;
  organizationId: string;
  role: string;
  hierarchy: number;
  permissions?: string[];
}

export interface AssignTeamMemberToProjectRequest {
  teamMemberId: string;
  projectId: string;
  role: string;
  hierarchy: number;
}

export interface CreateNotificationRequest {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  data?: Record<string, any>;
}

export interface CreateTimecardRequest {
  userId: string;
  organizationId: string;
  projectId: string;
  sessionId?: string;
  date: Date;
  hoursWorked: number;
  description?: string;
}

export interface ProcessEDLRequest {
  fileName: string;
  content: string;
  organizationId: string;
  projectId?: string;
  fileType: 'edl' | 'xml' | 'fcpxml';
}

export interface CreatePaymentRequest {
  userId: string;
  organizationId: string;
  amount: number;
  currency: string;
  type: 'subscription' | 'one_time' | 'upgrade';
  description?: string;
  metadata?: Record<string, any>;
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter types
export interface ProjectFilters {
  organizationId: string;
  status?: 'active' | 'inactive' | 'archived';
  createdBy?: string;
  search?: string;
}

export interface DatasetFilters {
  organizationId: string;
  projectId?: string;
  type?: string;
  status?: 'active' | 'inactive' | 'archived';
  createdBy?: string;
  search?: string;
}

export interface SessionFilters {
  organizationId: string;
  projectId?: string;
  status?: 'draft' | 'active' | 'completed' | 'archived';
  createdBy?: string;
  search?: string;
}

export interface TeamMemberFilters {
  organizationId: string;
  role?: string;
  isActive?: boolean;
  search?: string;
}

export interface NotificationFilters {
  userId: string;
  organizationId: string;
  type?: string;
  read?: boolean;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
}

export interface TimecardFilters {
  userId?: string;
  organizationId: string;
  projectId?: string;
  sessionId?: string;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  dateFrom?: Date;
  dateTo?: Date;
}
