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
  if (import.meta.env.DEV) {
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
 * Extract retry delay from a Gemini 429 error body (respects retryDelay hint).
 */
const extract429Delay = (error: unknown): number | null => {
  try {
    const msg = error instanceof Error ? error.message : String(error);
    // Parse JSON from the error message if present
    const jsonMatch = msg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const details = parsed?.error?.details ?? [];
      for (const d of details) {
        if (d?.retryDelay) {
          const secs = parseFloat(d.retryDelay.replace('s', ''));
          if (!isNaN(secs)) return Math.ceil(secs) * 1000 + 500; // add 500ms buffer
        }
      }
    }
  } catch { /* ignore */ }
  return null;
};

/**
 * Retry wrapper with exponential backoff + 429 rate-limit awareness.
 * Reads Gemini's suggested retryDelay and waits accordingly.
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 4,
  baseDelay: number = 2000
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) break;

      const msg = error instanceof Error ? error.message : String(error);
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');

      // Respect Gemini's suggested retry delay for 429s
      const suggested = is429 ? extract429Delay(error) : null;
      const delay = suggested ?? baseDelay * Math.pow(2, attempt);

      console.warn(`[retryWithBackoff] attempt ${attempt + 1}/${maxRetries} failed${is429 ? ' (rate limit)' : ''}. Retrying in ${Math.round(delay / 1000)}s...`);
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
