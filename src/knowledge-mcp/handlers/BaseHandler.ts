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
   * Create request context with unique trace ID for operation tracking.
   *
   * This should be the FIRST operation in every handler method to ensure
   * all subsequent operations can be traced back to the same request.
   *
   * @param method - The MCP method name being executed
   * @param params - The parameters passed to the method
   * @returns RequestContext with unique traceId and timestamp
   *
   * @example
   * ```typescript
   * updateChapter(params: ChapterParams): string {
   *   const context = this.createContext('update_chapter', params);
   *   // ... rest of implementation
   * }
   * ```
   */
  protected createContext(method: string, params: Record<string, unknown>): RequestContext {
    const context = createRequestContext(method, params);
    this.logger.debug(`Starting request: ${method}`, formatRequestContext(context));
    return context;
  }

  /**
   * Log successful operation with trace ID and duration tracking.
   *
   * Writes to both the activity log (for persistence) and console log
   * (for debugging). The trace ID from context is included in all logs
   * to enable request tracing across log files.
   *
   * @param method - The MCP method name that succeeded
   * @param params - The parameters used (excluding sensitive data)
   * @param context - The request context with trace ID
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
   * Log error with trace ID for debugging failed operations.
   *
   * Ensures all errors are logged with their trace ID, making it easy
   * to find all related log entries for a failed request. The error
   * is also formatted to include the trace ID in its context.
   *
   * @param method - The MCP method name that failed
   * @param params - The parameters used (excluding sensitive data)
   * @param error - The error that occurred (string or Error/MCPError)
   * @param context - The request context with trace ID
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
   * Format error response with trace ID included in context.
   *
   * Ensures error responses returned to clients include the trace ID,
   * allowing users to report issues with a specific identifier that
   * can be searched in the logs.
   *
   * @param error - MCPError instance or error message string
   * @param context - Request context containing trace ID
   * @returns JSON string with error details and trace ID
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
