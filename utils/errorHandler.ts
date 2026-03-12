import { toast } from 'react-toastify';

export interface ErrorLog {
  message: string;
  error: unknown;
  timestamp: number;
  context?: string;
}

// Store recent errors (last 50) for debugging
const errorLog: ErrorLog[] = [];

/**
 * Centralized error handler that logs errors and shows user-friendly messages
 */
export const handleError = (
  error: unknown,
  userMessage: string,
  context?: string,
  showToast: boolean = true
): void => {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log to internal error log
  errorLog.push({
    message: errorMessage,
    error,
    timestamp: Date.now(),
    context,
  });

  // Keep only last 50 errors
  if (errorLog.length > 50) {
    errorLog.shift();
  }

  // Show user-friendly toast notification
  if (showToast) {
    toast.error(userMessage, {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  }

  // In development, also log to console for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context || 'Error'}]:`, errorMessage, error);
  }
};

/**
 * Handle success messages
 */
export const handleSuccess = (message: string): void => {
  toast.success(message, {
    position: 'top-right',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

/**
 * Handle warning messages
 */
export const handleWarning = (message: string): void => {
  toast.warning(message, {
    position: 'top-right',
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

/**
 * Handle info messages
 */
export const handleInfo = (message: string): void => {
  toast.info(message, {
    position: 'top-right',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
  });
};

/**
 * Get error logs for debugging
 */
export const getErrorLogs = (): ErrorLog[] => {
  return [...errorLog];
};

/**
 * Clear error logs
 */
export const clearErrorLogs = (): void => {
  errorLog.length = 0;
};

/**
 * Retry wrapper with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

/**
 * Timeout wrapper for API calls
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
};
