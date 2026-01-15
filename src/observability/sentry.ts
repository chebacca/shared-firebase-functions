// Conditional imports - Sentry is optional
let Sentry: any;
let nodeProfilingIntegration: any;

try {
  Sentry = require('@sentry/node');
  const profiling = require('@sentry/profiling-node');
  nodeProfilingIntegration = profiling.nodeProfilingIntegration;
} catch (e) {
  console.warn('⚠️ Sentry packages not installed. Error tracking disabled.');
}

export function initializeSentry() {
  if (!Sentry) {
    console.warn('⚠️ Sentry not available. Install @sentry/node to enable error tracking.');
    return;
  }
  
  const dsn = process.env.SENTRY_DSN;
  
  if (!dsn) {
    console.warn('⚠️ Sentry DSN not configured. Error tracking will be disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    integrations: nodeProfilingIntegration ? [
      nodeProfilingIntegration()
    ] : [],
    beforeSend(event: any) {
      // Filter out sensitive data
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    }
  });
  
  console.log('✅ Sentry initialized');
}

export function captureException(error: Error, context?: Record<string, any>) {
  // Sentry is optional - errors are still logged to Google Cloud Logging
  if (Sentry) {
    Sentry.captureException(error, {
      extra: context
    });
  } else {
    // Fallback to console logging (picked up by Google Cloud Logging)
    console.error('Error captured:', error, context);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  // Sentry is optional - messages are still logged to Google Cloud Logging
  if (Sentry) {
    Sentry.captureMessage(message, level);
  } else {
    // Fallback to console logging (picked up by Google Cloud Logging)
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](message);
  }
}

export function setUserContext(userId: string, email?: string, organizationId?: string) {
  // Sentry is optional - user context is tracked in Google Cloud Trace spans
  if (Sentry) {
    Sentry.setUser({
      id: userId,
      email,
      organizationId
    });
  }
  // User context is automatically tracked in OpenTelemetry spans
}
