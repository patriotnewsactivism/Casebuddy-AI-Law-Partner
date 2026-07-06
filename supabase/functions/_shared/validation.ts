/**
 * Input validation utilities for edge functions
 * Phase 1C: Input Validation & SQL Injection Prevention
 */

// UUID validation regex (RFC 4122 compliant)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Google Drive folder ID regex (alphanumeric, underscores, hyphens)
const FOLDER_ID_REGEX = /^[a-zA-Z0-9_-]{10,100}$/;

// Safe file path regex (no path traversal)
const SAFE_PATH_REGEX = /^[a-zA-Z0-9_./ -]+$/;

/**
 * Validate UUID format
 */
export function validateUUID(value: string, fieldName: string = 'id'): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: must be a string`);
  }

  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }

  return value;
}

/**
 * Validate Google Drive folder ID
 */
export function validateGoogleDriveFolderId(folderId: string): string {
  if (!folderId || typeof folderId !== 'string') {
    throw new Error('Invalid folder ID: must be a string');
  }

  if (!FOLDER_ID_REGEX.test(folderId)) {
    throw new Error('Invalid Google Drive folder ID format');
  }

  return folderId;
}

/**
 * Sanitize file path to prevent path traversal attacks
 */
export function sanitizeFilePath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid file path: must be a string');
  }

  // Remove path traversal attempts
  const sanitized = path
    .replace(/\.\./g, '')  // Remove ..
    .replace(/\/\//g, '/') // Remove duplicate slashes
    .replace(/^\//, '')    // Remove leading slash
    .trim();

  if (!SAFE_PATH_REGEX.test(sanitized)) {
    throw new Error('Invalid file path: contains illegal characters');
  }

  if (sanitized.length > 1024) {
    throw new Error('Invalid file path: too long (max 1024 characters)');
  }

  return sanitized;
}

/**
 * Validate file size
 */
export function validateFileSize(size: number, maxSizeMB: number = 100): number {
  if (typeof size !== 'number' || size < 0) {
    throw new Error('Invalid file size');
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (size > maxSizeBytes) {
    throw new Error(`File too large: ${(size / 1024 / 1024).toFixed(2)}MB (max ${maxSizeMB}MB)`);
  }

  return size;
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string, allowedTypes?: string[]): string {
  if (!mimeType || typeof mimeType !== 'string') {
    throw new Error('Invalid MIME type');
  }

  // Basic MIME type validation
  if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(mimeType)) {
    throw new Error('Invalid MIME type format');
  }

  if (allowedTypes && !allowedTypes.includes(mimeType)) {
    throw new Error(`MIME type not allowed: ${mimeType}`);
  }

  return mimeType;
}

/**
 * Validate and sanitize string input
 */
export function sanitizeString(
  value: string,
  fieldName: string,
  maxLength: number = 1000
): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid ${fieldName}: must be a string`);
  }

  const sanitized = value.trim();

  if (sanitized.length === 0) {
    throw new Error(`Invalid ${fieldName}: cannot be empty`);
  }

  if (sanitized.length > maxLength) {
    throw new Error(`Invalid ${fieldName}: too long (max ${maxLength} characters)`);
  }

  return sanitized;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || typeof email !== 'string') {
    throw new Error('Invalid email: must be a string');
  }

  const sanitized = email.trim().toLowerCase();

  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }

  return sanitized;
}

/**
 * Validate URL format
 */
export function validateURL(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: must be a string');
  }

  try {
    const parsedUrl = new URL(url);

    // Only allow HTTP(S) protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL: must use HTTP or HTTPS protocol');
    }

    return url;
  } catch (error) {
    throw new Error('Invalid URL format');
  }
}

/**
 * Validate integer within range
 */
export function validateInteger(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  const num = typeof value === 'number'
    ? value
    : Number.parseInt(String(value), 10);

  if (Number.isNaN(num)) {
    throw new Error(`Invalid ${fieldName}: must be an integer`);
  }

  if (min !== undefined && num < min) {
    throw new Error(`Invalid ${fieldName}: must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new Error(`Invalid ${fieldName}: must be at most ${max}`);
  }

  return num;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: string,
  fieldName: string,
  allowedValues: T[]
): T {
  if (!allowedValues.includes(value as T)) {
    throw new Error(
      `Invalid ${fieldName}: must be one of ${allowedValues.join(', ')}`
    );
  }

  return value as T;
}
