import { STORAGE_PATH, logger } from '../config/index.js';
import { MCPError, handleError } from '../errors/index.js';
import type { RequestContext } from '../utils/tracing.js';
import { createRequestContext, formatRequestContext } from '../utils/tracing.js';
import { logMethodCall, logActivityAsync } from '../utils.js';

export abstract class BaseHandler {
  protected readonly storagePath: string;
  protected readonly logger: typeof logger;

  constructor() {
    this.storagePath = STORAGE_PATH;
    this.logger = logger;
  }

  /**
   * Create request context for tracing
   */
  protected createContext(method: string, params: Record<string, unknown>): RequestContext {
    const context = createRequestContext(method, params);
    this.logger.debug(`Starting request: ${method}`, formatRequestContext(context));
    return context;
  }

  /**
   * Log successful operation
   */
  protected logSuccess(
    method: string,
    params: Record<string, unknown>,
    context?: RequestContext
  ): void {
    const logData = {
      ...params,
      success: true,
      ...(context && { traceId: context.traceId, duration: Date.now() - context.startTime }),
    };

    logMethodCall(this.storagePath, method, logData);

    if (context) {
      this.logger.info(`Request completed: ${method}`, formatRequestContext(context));
    }
  }

  /**
   * Log error with context
   */
  protected logError(
    method: string,
    params: Record<string, unknown>,
    error: string | MCPError,
    context?: RequestContext
  ): void {
    const errorMessage = error instanceof MCPError ? error.message : error;
    const logData = {
      ...params,
      success: false,
      error: errorMessage,
      ...(context && { traceId: context.traceId, duration: Date.now() - context.startTime }),
      ...(error instanceof MCPError && { errorCode: error.code, errorContext: error.context }),
    };

    logMethodCall(this.storagePath, method, logData);

    if (context) {
      this.logger.error(`Request failed: ${method}`, {
        ...formatRequestContext(context),
        error: error instanceof MCPError ? error.toJSON() : errorMessage,
      });
    }
  }

  /**
   * Format successful response
   */
  protected formatSuccessResponse(data: Record<string, unknown>): string {
    return JSON.stringify({ success: true, ...data }, null, 2);
  }

  /**
   * Format error response with proper error handling
   */
  protected formatErrorResponse(error: unknown, context?: RequestContext): string {
    const mcpError = handleError(error, context ? { traceId: context.traceId } : {});
    return JSON.stringify(mcpError.toMCPResponse(), null, 2);
  }

  // Async versions for async handlers
  protected async logSuccessAsync(
    method: string,
    params: Record<string, unknown>,
    context?: RequestContext
  ): Promise<void> {
    const logData = {
      ...params,
      success: true,
      ...(context && { traceId: context.traceId, duration: Date.now() - context.startTime }),
    };

    await logActivityAsync(this.storagePath, method, logData);

    if (context) {
      this.logger.info(`Request completed: ${method}`, formatRequestContext(context));
    }
  }

  protected async logErrorAsync(
    method: string,
    params: Record<string, unknown>,
    error: string | MCPError,
    context?: RequestContext
  ): Promise<void> {
    const errorMessage = error instanceof MCPError ? error.message : error;
    const logData = {
      ...params,
      success: false,
      error: errorMessage,
      ...(context && { traceId: context.traceId, duration: Date.now() - context.startTime }),
      ...(error instanceof MCPError && { errorCode: error.code, errorContext: error.context }),
    };

    await logActivityAsync(this.storagePath, method, logData);

    if (context) {
      this.logger.error(`Request failed: ${method}`, {
        ...formatRequestContext(context),
        error: error instanceof MCPError ? error.toJSON() : errorMessage,
      });
    }
  }
}
