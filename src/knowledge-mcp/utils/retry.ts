import { logger } from '../config/index.js';
import { MCPError, MCPErrorCode } from '../errors/index.js';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: MCPErrorCode[];
  onRetry?: (error: MCPError, attempt: number) => void;
}

/**
 * Default retry options
 */
const defaultRetryOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 100,
  maxDelay: 5000,
  backoffMultiplier: 2,
  retryableErrors: [
    MCPErrorCode.FILE_SYSTEM_ERROR,
    MCPErrorCode.GIT_ERROR,
    MCPErrorCode.STORAGE_ERROR,
  ],
  onRetry: () => {},
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: MCPError, retryableErrors: MCPErrorCode[]): boolean {
  // Check if error code is in retryable list
  if (retryableErrors.includes(error.code)) {
    return true;
  }

  // Check for specific file system errors that are transient
  const originalError = error.context.originalError;
  if (originalError && typeof originalError === 'object' && 'code' in originalError) {
    const nodeError = originalError as NodeJS.ErrnoException;
    // Retry on temporary file system issues
    if (['EAGAIN', 'EBUSY', 'EMFILE', 'ENFILE'].includes(nodeError.code ?? '')) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay for next retry attempt using exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number
): number {
  const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: MCPError | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Convert to MCPError if needed
      const mcpError = error instanceof MCPError ? error : MCPError.fromError(error);
      lastError = mcpError;

      // Check if we should retry
      const isLastAttempt = attempt === opts.maxAttempts;
      const isRetryable = isRetryableError(mcpError, opts.retryableErrors);

      if (isLastAttempt || !isRetryable) {
        throw mcpError;
      }

      // Calculate delay and wait
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier
      );

      // Log retry attempt
      logger.warn(`Retrying after error (attempt ${attempt}/${opts.maxAttempts})`, {
        error: mcpError.toJSON(),
        delay,
        nextAttempt: attempt + 1,
      });

      // Call retry callback
      opts.onRetry(mcpError, attempt);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new MCPError(MCPErrorCode.INTERNAL_ERROR, 'Retry failed with unknown error');
}

/**
 * Retry a synchronous function with exponential backoff
 */
export function withRetrySync<T>(fn: () => T, options: RetryOptions = {}): T {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: MCPError | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      // Convert to MCPError if needed
      const mcpError = error instanceof MCPError ? error : MCPError.fromError(error);
      lastError = mcpError;

      // Check if we should retry
      const isLastAttempt = attempt === opts.maxAttempts;
      const isRetryable = isRetryableError(mcpError, opts.retryableErrors);

      if (isLastAttempt || !isRetryable) {
        throw mcpError;
      }

      // Calculate delay
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier
      );

      // Log retry attempt
      logger.warn(`Retrying after error (attempt ${attempt}/${opts.maxAttempts})`, {
        error: mcpError.toJSON(),
        delay,
        nextAttempt: attempt + 1,
      });

      // Call retry callback
      opts.onRetry(mcpError, attempt);

      // Synchronous sleep (blocking - use sparingly!)
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new MCPError(MCPErrorCode.INTERNAL_ERROR, 'Retry failed with unknown error');
}

/**
 * Create a retryable version of an async function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), options);
  }) as T;
}

/**
 * Create a retryable version of a sync function
 */
export function makeRetryableSync<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => {
    return withRetrySync(() => fn(...args), options);
  }) as T;
}
