// Conditional imports - observability is optional
let NodeSDK: any;
let getNodeAutoInstrumentations: any;
let TraceExporter: any;
let MetricExporter: any;
let Resource: any;
let SEMRESATTRS_SERVICE_NAME: string = 'service.name';
let SEMRESATTRS_SERVICE_VERSION: string = 'service.version';
let SentrySpanProcessor: any;

try {
  const otelSdk = require('@opentelemetry/sdk-node');
  const otelAuto = require('@opentelemetry/auto-instrumentations-node');
  const otelTrace = require('@google-cloud/opentelemetry-cloud-trace-exporter');
  const otelMetric = require('@google-cloud/opentelemetry-cloud-monitoring-exporter');
  const otelResource = require('@opentelemetry/resources');
  const otelSem = require('@opentelemetry/semantic-conventions');
  const sentryOtel = require('@sentry/opentelemetry-node');
  
  NodeSDK = otelSdk.NodeSDK;
  getNodeAutoInstrumentations = otelAuto.getNodeAutoInstrumentations;
  TraceExporter = otelTrace.TraceExporter;
  MetricExporter = otelMetric.MetricExporter;
  Resource = otelResource.Resource;
  SEMRESATTRS_SERVICE_NAME = otelSem.SEMRESATTRS_SERVICE_NAME || 'service.name';
  SEMRESATTRS_SERVICE_VERSION = otelSem.SEMRESATTRS_SERVICE_VERSION || 'service.version';
  SentrySpanProcessor = sentryOtel.SentrySpanProcessor;
} catch (e) {
  console.warn('⚠️ OpenTelemetry packages not installed. Observability disabled.');
}

// Sentry is optional - uncomment to enable when needed
// import { initializeSentry } from './sentry';

const resource = new Resource({
  [SEMRESATTRS_SERVICE_NAME]: 'backbone-firebase-functions',
  [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
  'environment': process.env.NODE_ENV || 'development',
  'project': 'backbone-logic'
});

export const sdk = new NodeSDK({
  resource,
  traceExporter: new TraceExporter(),
  metricExporter: new MetricExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true }
    })
  ]
});

export function initializeTelemetry() {
  if (!NodeSDK) {
    console.warn('⚠️ OpenTelemetry not available. Install dependencies to enable observability.');
    return;
  }
  
  // Sentry is optional - uncomment to enable when needed
  // initializeSentry();
  
  // Add Sentry span processor to OpenTelemetry (only if Sentry is enabled)
  // try {
  //   if (SentrySpanProcessor) {
  //     sdk.addSpanProcessor(new SentrySpanProcessor());
  //   }
  // } catch (error: any) {
  //   console.warn('⚠️ Could not add Sentry span processor:', error);
  // }
  
  sdk.start();
  console.log('✅ OpenTelemetry initialized (Google Cloud Monitoring)');
}

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Telemetry terminated'))
    .catch((error: any) => console.error('Error terminating telemetry', error))
    .finally(() => process.exit(0));
});
