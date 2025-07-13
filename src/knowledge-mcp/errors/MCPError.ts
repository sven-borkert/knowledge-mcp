/**
 * Standard error codes for the Knowledge MCP Server
 */
export enum MCPErrorCode {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_PROJECT_ID = 'INVALID_PROJECT_ID',
  INVALID_FILENAME = 'INVALID_FILENAME',
  INVALID_PATH = 'INVALID_PATH',
  INVALID_CONTENT = 'INVALID_CONTENT',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  CHAPTER_NOT_FOUND = 'CHAPTER_NOT_FOUND',
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND',

  // File system errors
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
  ACCESS_DENIED = 'ACCESS_DENIED',
  FILE_ALREADY_EXISTS = 'FILE_ALREADY_EXISTS',
  PROJECT_DELETE_FAILED = 'PROJECT_DELETE_FAILED',

  // Git errors
  GIT_ERROR = 'GIT_ERROR',
  GIT_COMMAND_FAILED = 'GIT_COMMAND_FAILED',

  // Search errors
  SEARCH_ERROR = 'SEARCH_ERROR',
  INVALID_SEARCH_QUERY = 'INVALID_SEARCH_QUERY',
}

/**
 * Error context interface for additional debugging information
 */
export interface MCPErrorContext {
  method?: string;
  projectId?: string;
  filename?: string;
  path?: string;
  query?: string;
  originalError?: unknown;
  timestamp?: string;
  traceId?: string;
  [key: string]: unknown;
}

/**
 * Standard MCP Error class with error codes and context
 */
export class MCPError extends Error {
  public readonly code: MCPErrorCode;
  public readonly context: MCPErrorContext;
  public readonly timestamp: string;
  public readonly isOperational: boolean;

  constructor(
    code: MCPErrorCode,
    message: string,
    context: MCPErrorContext = {},
    isOperational = true
  ) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.timestamp = new Date().toISOString();
    this.context = {
      ...context,
      timestamp: this.timestamp,
    };
    this.isOperational = isOperational;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MCPError);
    }
  }

  /**
   * Create MCPError from unknown error
   */
  static fromError(error: unknown, context: MCPErrorContext = {}): MCPError {
    if (error instanceof MCPError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const code = MCPErrorCode.INTERNAL_ERROR;

    return new MCPError(code, message, {
      ...context,
      originalError: error,
    });
  }

  /**
   * Create validation error
   */
  static validation(message: string, context: MCPErrorContext = {}): MCPError {
    return new MCPError(MCPErrorCode.INVALID_INPUT, message, context);
  }

  /**
   * Create not found error
   */
  static notFound(resource: string, context: MCPErrorContext = {}): MCPError {
    return new MCPError(MCPErrorCode.NOT_FOUND, `${resource} not found`, context);
  }

  /**
   * Create file system error
   */
  static fileSystem(message: string, context: MCPErrorContext = {}): MCPError {
    return new MCPError(MCPErrorCode.FILE_SYSTEM_ERROR, message, context);
  }

  /**
   * Create git error
   */
  static git(message: string, context: MCPErrorContext = {}): MCPError {
    return new MCPError(MCPErrorCode.GIT_ERROR, message, context);
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      isOperational: this.isOperational,
    };
  }

  /**
   * Format error for MCP response
   */
  toMCPResponse(): { success: false; error: string; code: string; context?: MCPErrorContext } {
    return {
      success: false,
      error: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

/**
 * Type guard to check if error is MCPError
 */
export function isMCPError(error: unknown): error is MCPError {
  return error instanceof MCPError;
}

/**
 * Helper to handle errors consistently
 */
export function handleError(error: unknown, context: MCPErrorContext = {}): MCPError {
  if (isMCPError(error)) {
    // Return new error with merged context
    return new MCPError(
      error.code,
      error.message,
      { ...error.context, ...context },
      error.isOperational
    );
  }

  // Check for specific error types
  if (error instanceof Error) {
    // File system errors
    if ('code' in error && typeof error.code === 'string') {
      const nodeError = error as NodeJS.ErrnoException;

      switch (nodeError.code) {
        case 'ENOENT':
          return new MCPError(
            MCPErrorCode.NOT_FOUND,
            `File or directory not found: ${nodeError.path ?? 'unknown'}`,
            { ...context, originalError: error }
          );
        case 'EACCES':
        case 'EPERM':
          return new MCPError(
            MCPErrorCode.ACCESS_DENIED,
            `Access denied: ${nodeError.path ?? 'unknown'}`,
            { ...context, originalError: error }
          );
        case 'EEXIST':
          return new MCPError(
            MCPErrorCode.FILE_ALREADY_EXISTS,
            `File already exists: ${nodeError.path ?? 'unknown'}`,
            { ...context, originalError: error }
          );
        default:
          return new MCPError(MCPErrorCode.FILE_SYSTEM_ERROR, error.message, {
            ...context,
            originalError: error,
            code: nodeError.code,
          });
      }
    }
  }

  // Default to internal error
  return MCPError.fromError(error, context);
}
