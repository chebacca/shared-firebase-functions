import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('backbone-functions', '1.0.0');

export async function traceFunction<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = tracer.startSpan(name, { attributes });
  
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export function getCurrentSpan() {
  return trace.getSpan(context.active());
}

export function addSpanAttribute(key: string, value: any) {
  const span = getCurrentSpan();
  if (span) {
    span.setAttribute(key, value);
  }
}
