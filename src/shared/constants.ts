// API Response Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503
} as const;

// User Roles and Hierarchies
export const USER_ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
} as const;

export const USER_HIERARCHIES = {
  OWNER: 100,
  ADMIN: 90,
  MANAGER: 70,
  MEMBER: 50,
  VIEWER: 30
} as const;

// Project Status
export const PROJECT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived'
} as const;

// Dataset Types
export const DATASET_TYPES = {
  CALLSHEET: 'callsheet',
  TIMECARD: 'timecard',
  INVENTORY: 'inventory',
  DELIVERABLE: 'deliverable',
  SESSION: 'session',
  PROJECT: 'project',
  TEAM_MEMBER: 'team_member',
  NOTIFICATION: 'notification',
  LICENSE: 'license',
  PAYMENT: 'payment'
} as const;

// Session Status
export const SESSION_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
} as const;

// License Types
export const LICENSE_TYPES = {
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise'
} as const;

export const LICENSE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended'
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_DELETED: 'project_deleted',
  SESSION_CREATED: 'session_created',
  SESSION_UPDATED: 'session_updated',
  SESSION_COMPLETED: 'session_completed',
  TEAM_MEMBER_ADDED: 'team_member_added',
  TEAM_MEMBER_REMOVED: 'team_member_removed',
  TIMECARD_SUBMITTED: 'timecard_submitted',
  TIMECARD_APPROVED: 'timecard_approved',
  TIMECARD_REJECTED: 'timecard_rejected',
  LICENSE_ACTIVATED: 'license_activated',
  LICENSE_EXPIRED: 'license_expired',
  PAYMENT_SUCCESSFUL: 'payment_successful',
  PAYMENT_FAILED: 'payment_failed',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  GENERAL: 'general'
} as const;

export const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
} as const;

// Timecard Status
export const TIMECARD_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const;

// Payment Types
export const PAYMENT_TYPES = {
  SUBSCRIPTION: 'subscription',
  ONE_TIME: 'one_time',
  UPGRADE: 'upgrade'
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded'
} as const;

// EDL File Types
export const EDL_FILE_TYPES = {
  EDL: 'edl',
  XML: 'xml',
  FCPXML: 'fcpxml'
} as const;

export const EDL_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

// Deliverable Status
export const DELIVERABLE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected'
} as const;

// Pagination Defaults
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100
} as const;

// Rate Limiting
export const RATE_LIMITS = {
  DEFAULT: {
    MAX_REQUESTS: 100,
    WINDOW_MS: 15 * 60 * 1000 // 15 minutes
  },
  AUTH: {
    MAX_REQUESTS: 10,
    WINDOW_MS: 15 * 60 * 1000 // 15 minutes
  },
  API: {
    MAX_REQUESTS: 1000,
    WINDOW_MS: 60 * 60 * 1000 // 1 hour
  }
} as const;

// File Upload Limits
export const FILE_LIMITS = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain', 'application/json'],
  MAX_FILES: 10
} as const;

// Database Collection Names
export const COLLECTIONS = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  PROJECTS: 'projects',
  DATASETS: 'datasets',
  SESSIONS: 'sessions',
  TEAM_MEMBERS: 'teamMembers',
  LICENSES: 'licenses',
  NOTIFICATIONS: 'notifications',
  TIMECARDS: 'timecards',
  DELIVERABLES: 'deliverables',
  PAYMENTS: 'payments',
  SUBSCRIPTIONS: 'subscriptions',
  EDL_FILES: 'edlFiles',
  NETWORK_DELIVERY_BIBLES: 'networkDeliveryBibles',
  ACTIVITY_LOGS: 'activityLogs'
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  AUTH: '/api/auth',
  PROJECTS: '/api/projects',
  DATASETS: '/api/datasets',
  SESSIONS: '/api/sessions',
  TEAM_MEMBERS: '/api/team-members',
  LICENSES: '/api/licenses',
  NOTIFICATIONS: '/api/notifications',
  TIMECARDS: '/api/timecards',
  DELIVERABLES: '/api/deliverables',
  PAYMENTS: '/api/payments',
  EDL_CONVERTER: '/api/edl-converter',
  HEALTH: '/health'
} as const;

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
} as const;

// Stripe Configuration
export const STRIPE_CONFIG = {
  API_VERSION: '2023-10-16',
  CURRENCY: 'usd',
  WEBHOOK_TOLERANCE: 300 // 5 minutes
} as const;

// Firebase Configuration
export const FIREBASE_CONFIG = {
  REGION: 'us-central1',
  MAX_RETRIES: 3,
  TIMEOUT: 30000 // 30 seconds
} as const;

// Cache Configuration
export const CACHE_CONFIG = {
  DEFAULT_TTL: 300, // 5 minutes
  USER_TTL: 600, // 10 minutes
  PROJECT_TTL: 300, // 5 minutes
  DATASET_TTL: 300, // 5 minutes
  SESSION_TTL: 300 // 5 minutes
} as const;

// Validation Rules
export const VALIDATION_RULES = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 1000,
  PHONE_REGEX: /^\+?[\d\s\-\(\)]+$/,
  URL_REGEX: /^https?:\/\/.+/,
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
} as const;

// Feature Flags
export const FEATURE_FLAGS = {
  DUAL_ROLE_SYSTEM: true,
  ENHANCED_PERMISSIONS: true,
  REAL_TIME_NOTIFICATIONS: true,
  ADVANCED_ANALYTICS: true,
  AI_INTEGRATION: true,
  BULK_OPERATIONS: true,
  EXPORT_FUNCTIONALITY: true,
  WEBHOOK_SUPPORT: true
} as const;

// Environment Variables
export const ENV_VARS = {
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  FIREBASE_PROJECT_ID: 'FIREBASE_PROJECT_ID',
  FIREBASE_PRIVATE_KEY: 'FIREBASE_PRIVATE_KEY',
  FIREBASE_CLIENT_EMAIL: 'FIREBASE_CLIENT_EMAIL',
  STRIPE_SECRET_KEY: 'STRIPE_SECRET_KEY',
  STRIPE_PUBLISHABLE_KEY: 'STRIPE_PUBLISHABLE_KEY',
  STRIPE_WEBHOOK_SECRET: 'STRIPE_WEBHOOK_SECRET',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  RESEND_API_KEY: 'RESEND_API_KEY',
  SENDGRID_API_KEY: 'SENDGRID_API_KEY'
} as const;

// Log Levels
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
} as const;

// Default Values
export const DEFAULTS = {
  ORGANIZATION_NAME: 'Default Organization',
  PROJECT_NAME: 'Untitled Project',
  SESSION_NAME: 'Untitled Session',
  DATASET_NAME: 'Untitled Dataset',
  NOTIFICATION_TITLE: 'Notification',
  DELIVERABLE_NAME: 'Untitled Deliverable'
} as const;
