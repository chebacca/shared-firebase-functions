/**
 * 🔧 Environment Configuration Utility
 * 
 * Centralized environment variable management for Firebase Functions
 * Supports both local development and Firebase Functions config
 */

import * as functions from 'firebase-functions';

// Environment configuration interface
interface EnvironmentConfig {
  // Google API Services
  geminiApiKey: string;
  googleMapsApiKey: string;
  
  // JWT Configuration
  jwtSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  
  // Email Configuration
  emailHost: string;
  emailPort: number;
  emailUser: string;
  emailPass: string;
  
  // Application Configuration
  nodeEnv: string;
  firebaseProjectId: string;
  
  // Rate Limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  
  // WebSocket Configuration
  maxWebSocketConnections: number;
  connectionTimeoutMs: number;
  messageBatchInterval: number;
  maxBatchSize: number;
  enableMessageCompression: boolean;
  
  // Weather API Configuration
  weatherDefaultLocation: string;
  weatherCacheDuration: number;
  
  // Development Flags
  debugEnabled: boolean;
  verboseLogging: boolean;
}

/**
 * Get environment configuration
 * Uses .env files and environment variables
 */
export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    // Google API Services
    geminiApiKey: 
      process.env.GEMINI_API_KEY || 
      process.env.REACT_APP_GEMINI_API_KEY || 
      '',
    
    googleMapsApiKey: 
      process.env.GOOGLE_MAPS_API_KEY || 
      process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 
      '',
    
    // JWT Configuration
    jwtSecret: 
      process.env.JWT_SECRET || 
      'default-dev-secret-change-in-production',
    
    jwtExpiresIn: 
      process.env.JWT_EXPIRES_IN || 
      '7d',
    
    jwtRefreshExpiresIn: 
      process.env.JWT_REFRESH_EXPIRES_IN || 
      '30d',
    
    // Email Configuration
    emailHost: 
      process.env.EMAIL_HOST || 
      'smtp.gmail.com',
    
    emailPort: 
      parseInt(process.env.EMAIL_PORT || '587'),
    
    emailUser: 
      process.env.EMAIL_USER || 
      '',
    
    emailPass: 
      process.env.EMAIL_PASS || 
      '',
    
    // Application Configuration
    nodeEnv: 
      process.env.NODE_ENV || 
      'production',
    
    firebaseProjectId: 
      process.env.FIREBASE_PROJECT_ID || 
      process.env.GCLOUD_PROJECT || 
      'backbone-logic',
    
    // Rate Limiting
    rateLimitWindowMs: 
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    
    rateLimitMaxRequests: 
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    
    // WebSocket Configuration
    maxWebSocketConnections: 
      parseInt(process.env.MAX_WEBSOCKET_CONNECTIONS || '1000'),
    
    connectionTimeoutMs: 
      parseInt(process.env.CONNECTION_TIMEOUT_MS || '300000'),
    
    messageBatchInterval: 
      parseInt(process.env.MESSAGE_BATCH_INTERVAL || '50'),
    
    maxBatchSize: 
      parseInt(process.env.MAX_BATCH_SIZE || '100'),
    
    enableMessageCompression: 
      (process.env.ENABLE_MESSAGE_COMPRESSION || 'true') === 'true',
    
    // Weather API Configuration
    weatherDefaultLocation: 
      process.env.WEATHER_DEFAULT_LOCATION || 
      'Los Angeles, CA',
    
    weatherCacheDuration: 
      parseInt(process.env.WEATHER_CACHE_DURATION || '1800000'),
    
    // Development Flags
    debugEnabled: 
      (process.env.DEBUG || 'false') === 'true',
    
    verboseLogging: 
      (process.env.VERBOSE_LOGGING || 'false') === 'true'
  };
}

/**
 * Validate required environment variables
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const config = getEnvironmentConfig();
  const missing: string[] = [];
  
  // Check required variables
  if (!config.jwtSecret || config.jwtSecret === 'default-dev-secret-change-in-production') {
    missing.push('JWT_SECRET');
  }
  
  if (!config.geminiApiKey) {
    missing.push('GEMINI_API_KEY');
  }
  
  if (!config.googleMapsApiKey) {
    missing.push('GOOGLE_MAPS_API_KEY');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Get API service configuration
 */
export function getApiServiceConfig() {
  const config = getEnvironmentConfig();
  
  return {
    gemini: {
      apiKey: config.geminiApiKey,
      model: 'gemini-1.5-flash'
    },
    googleMaps: {
      apiKey: config.googleMapsApiKey
    },
    email: {
      host: config.emailHost,
      port: config.emailPort,
      user: config.emailUser,
      pass: config.emailPass,
      secure: config.emailPort === 465
    },
    weather: {
      defaultLocation: config.weatherDefaultLocation,
      cacheDuration: config.weatherCacheDuration
    }
  };
}

/**
 * Get security configuration
 */
export function getSecurityConfig() {
  const config = getEnvironmentConfig();
  
  return {
    jwt: {
      secret: config.jwtSecret,
      expiresIn: config.jwtExpiresIn,
      refreshExpiresIn: config.jwtRefreshExpiresIn
    },
    rateLimit: {
      windowMs: config.rateLimitWindowMs,
      maxRequests: config.rateLimitMaxRequests
    }
  };
}

/**
 * Get WebSocket configuration
 */
export function getWebSocketConfig() {
  const config = getEnvironmentConfig();
  
  return {
    maxConnections: config.maxWebSocketConnections,
    connectionTimeout: config.connectionTimeoutMs,
    messageBatching: {
      interval: config.messageBatchInterval,
      maxSize: config.maxBatchSize
    },
    compression: config.enableMessageCompression
  };
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  const config = getEnvironmentConfig();
  return config.nodeEnv === 'development' || config.debugEnabled;
}

/**
 * Log environment configuration (without sensitive data)
 */
export function logEnvironmentInfo(): void {
  const config = getEnvironmentConfig();
  const validation = validateEnvironment();
  
  console.log('🔧 Environment Configuration:');
  console.log(`   Node Environment: ${config.nodeEnv}`);
  console.log(`   Firebase Project: ${config.firebaseProjectId}`);
  console.log(`   Debug Enabled: ${config.debugEnabled}`);
  console.log(`   Verbose Logging: ${config.verboseLogging}`);
  
  console.log('\n🔑 API Services:');
  console.log(`   Gemini API: ${config.geminiApiKey ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Google Maps API: ${config.googleMapsApiKey ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Email Service: ${config.emailUser ? '✅ Configured' : '❌ Missing'}`);
  
  console.log('\n⚙️  Configuration:');
  console.log(`   Rate Limit: ${config.rateLimitMaxRequests} requests per ${config.rateLimitWindowMs}ms`);
  console.log(`   WebSocket Max Connections: ${config.maxWebSocketConnections}`);
  console.log(`   Weather Location: ${config.weatherDefaultLocation}`);
  
  if (!validation.valid) {
    console.warn('\n⚠️  Missing Required Environment Variables:');
    validation.missing.forEach(key => console.warn(`   - ${key}`));
  } else {
    console.log('\n✅ All required environment variables are configured');
  }
}

// Export the singleton instance
export const env = getEnvironmentConfig();
