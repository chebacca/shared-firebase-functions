/**
 * 🔧 Environment Configuration Routes
 * 
 * Firebase Functions routes for environment and configuration info
 */

import { Router } from 'express';
import { getEnvironmentConfig, getApiServiceConfig, getWebSocketConfig } from '../utils/environment';

const router: Router = Router();

// Get environment configuration (safe info only)
router.get('/', async (req, res) => {
  try {
    const envConfig = getEnvironmentConfig();
    const apiConfig = getApiServiceConfig();
    const wsConfig = getWebSocketConfig();
    
      // Return safe configuration info (no sensitive data)
      const safeConfig = {
        environment: {
          nodeEnv: envConfig.nodeEnv,
          firebaseProjectId: envConfig.firebaseProjectId,
          debugEnabled: envConfig.debugEnabled,
          verboseLogging: envConfig.verboseLogging
        },
      services: {
        gemini: {
          configured: !!apiConfig.gemini.apiKey,
          model: apiConfig.gemini.model
        },
        googleMaps: {
          configured: !!apiConfig.googleMaps.apiKey
        },
        email: {
          configured: !!apiConfig.email.user && !!apiConfig.email.pass,
          host: apiConfig.email.host,
          port: apiConfig.email.port
        },
        weather: {
          defaultLocation: apiConfig.weather.defaultLocation,
          cacheDuration: apiConfig.weather.cacheDuration
        }
      },
      limits: {
        rateLimitWindowMs: envConfig.rateLimitWindowMs,
        rateLimitMaxRequests: envConfig.rateLimitMaxRequests,
        maxWebSocketConnections: wsConfig.maxConnections,
        connectionTimeout: wsConfig.connectionTimeout
      },
      features: {
        messageBatching: wsConfig.messageBatching,
        compression: wsConfig.compression
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      configuration: safeConfig
    });
  } catch (error) {
    console.error('Environment config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get environment configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get service status
router.get('/status', async (req, res) => {
  try {
    const apiConfig = getApiServiceConfig();
    
    const serviceStatus = {
      services: {
        gemini: {
          status: apiConfig.gemini.apiKey ? 'configured' : 'not_configured',
          model: apiConfig.gemini.model
        },
        googleMaps: {
          status: apiConfig.googleMaps.apiKey ? 'configured' : 'not_configured'
        },
        email: {
          status: (apiConfig.email.user && apiConfig.email.pass) ? 'configured' : 'not_configured',
          host: apiConfig.email.host
        },
        weather: {
          status: 'available',
          provider: 'Open-Meteo'
        }
      },
      overall: {
        status: 'operational',
        configuredServices: Object.values({
          gemini: !!apiConfig.gemini.apiKey,
          googleMaps: !!apiConfig.googleMaps.apiKey,
          email: !!(apiConfig.email.user && apiConfig.email.pass),
          weather: true
        }).filter(Boolean).length,
        totalServices: 4
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      status: serviceStatus
    });
  } catch (error) {
    console.error('Service status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Health check with environment info
router.get('/health', async (req, res) => {
  try {
    const envConfig = getEnvironmentConfig();
    
    res.json({
      success: true,
      status: 'healthy',
      environment: envConfig.nodeEnv,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    console.error('Environment health check error:', error);
    res.status(500).json({
      success: false,
      error: 'Environment health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
