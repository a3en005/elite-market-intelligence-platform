/**
 * Enhanced error handling utilities for API integrations.
 * 
 * Provides typed error categorization, retry logic with exponential backoff,
 * and consistent error response formats for Binance and OANDA integrations.
 */

export enum ErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  CLIENT_ERROR = 'CLIENT_ERROR', // 4xx
  SERVER_ERROR = 'SERVER_ERROR', // 5xx
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  UNKNOWN = 'UNKNOWN',
}

export interface APIError extends Error {
  type: ErrorType;
  statusCode?: number;
  source: 'BINANCE' | 'OANDA' | 'EXTERNAL' | 'UNKNOWN';
  timestamp: Date;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Categorizes fetch errors into specific types for informed retry/fallback decisions.
 */
export function categorizeError(
  error: unknown,
  statusCode?: number,
  source: 'BINANCE' | 'OANDA' | 'EXTERNAL' = 'UNKNOWN',
): APIError {
  let type = ErrorType.UNKNOWN;
  let retryable = false;
  let message = 'Unknown error occurred';

  if (error instanceof Error) {
    const errMsg = error.message.toLowerCase();

    // Timeout detection
    if (errMsg.includes('abort') || errMsg.includes('timeout')) {
      type = ErrorType.TIMEOUT;
      message = `API request timeout from ${source}`;
      retryable = true;
    }
    // Network error detection
    else if (errMsg.includes('network') || errMsg.includes('econnrefused')) {
      type = ErrorType.NETWORK_ERROR;
      message = `Network error connecting to ${source}`;
      retryable = true;
    }
    // Generic error
    else {
      message = error.message;
    }
  }

  // Status code-based categorization
  if (statusCode) {
    if (statusCode === 429) {
      type = ErrorType.RATE_LIMITED;
      message = `Rate limited by ${source} (HTTP 429)`;
      retryable = true;
    } else if (statusCode >= 400 && statusCode < 500) {
      type = ErrorType.CLIENT_ERROR;
      message = `Client error from ${source} (HTTP ${statusCode})`;
      retryable = statusCode === 429; // Only 429 is retryable
    } else if (statusCode >= 500) {
      type = ErrorType.SERVER_ERROR;
      message = `Server error from ${source} (HTTP ${statusCode})`;
      retryable = true;
    }
  }

  const apiError: APIError = new Error(message) as APIError;
  apiError.name = type;
  apiError.type = type;
  apiError.statusCode = statusCode;
  apiError.source = source;
  apiError.timestamp = new Date();
  apiError.retryable = retryable;
  apiError.details = {
    originalError: error instanceof Error ? error.message : String(error),
  };

  return apiError;
}

/**
 * Retry strategy with exponential backoff and jitter.
 * Suitable for API calls that may be temporarily unavailable.
 * 
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param initialDelayMs - Initial delay before first retry
 * @param maxDelayMs - Maximum delay cap for backoff
 * @returns The result of the function if successful
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  initialDelayMs = 1000,
  maxDelayMs = 32000,
): Promise<T> {
  let lastError: APIError | Error | unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on non-retryable errors
      if (error instanceof Error && 'retryable' in error && !(error as APIError).retryable) {
        throw error;
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter: delay = min(maxDelay, initialDelay * 2^attempt) + random(0, delay * 0.1)
        const exponentialDelay = Math.min(
          maxDelayMs,
          initialDelayMs * Math.pow(2, attempt),
        );
        const jitter = Math.random() * exponentialDelay * 0.1;
        const delayMs = Math.floor(exponentialDelay + jitter);

        console.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms. Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Validates JSON response and categorizes parsing errors.
 */
export async function parseJSONSafely<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = categorizeError(
      new Error(`HTTP ${response.status}`),
      response.status,
      'UNKNOWN',
    );
    throw error;
  }

  try {
    const data = await response.json();
    return data as T;
  } catch (error) {
    const apiError: APIError = new Error('Invalid JSON response') as APIError;
    apiError.type = ErrorType.INVALID_RESPONSE;
    apiError.statusCode = response.status;
    apiError.source = 'UNKNOWN';
    apiError.timestamp = new Date();
    apiError.retryable = false;
    throw apiError;
  }
}

/**
 * Formats error for logging and monitoring.
 */
export function formatErrorLog(error: APIError | Error, context: string): string {
  const isAPIError = 'type' in error;

  if (isAPIError) {
    const e = error as APIError;
    return `[${context}] ${e.type} from ${e.source} at ${e.timestamp.toISOString()}: ${e.message} (HTTP ${e.statusCode || 'N/A'}, retryable: ${e.retryable})`;
  }

  return `[${context}] ${error.message}`;
}
