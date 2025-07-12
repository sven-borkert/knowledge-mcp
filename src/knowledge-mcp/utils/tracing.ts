import crypto from 'crypto';

/**
 * Request context for tracing
 */
export interface RequestContext {
  traceId: string;
  method: string;
  startTime: number;
  projectId?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate a unique trace ID for request tracking
 */
export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create a new request context
 */
export function createRequestContext(
  method: string,
  metadata?: Record<string, unknown>
): RequestContext {
  return {
    traceId: generateTraceId(),
    method,
    startTime: Date.now(),
    metadata,
  };
}

/**
 * Calculate request duration
 */
export function getRequestDuration(context: RequestContext): number {
  return Date.now() - context.startTime;
}

/**
 * Format request context for logging
 */
export function formatRequestContext(context: RequestContext): Record<string, unknown> {
  return {
    traceId: context.traceId,
    method: context.method,
    duration: getRequestDuration(context),
    projectId: context.projectId,
    filename: context.filename,
    ...context.metadata,
  };
}
