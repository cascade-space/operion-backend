import { JSDOM } from 'jsdom';
import createDOMPurifyModule from 'isomorphic-dompurify';

let DOMPurify: ReturnType<typeof createDOMPurifyModule> | { sanitize: (dirty: string) => string };

try {
  // Attempt to initialize DOMPurify with server-side DOM implementation
  const window = (global as any).window ?? new JSDOM('').window;
  DOMPurify = createDOMPurifyModule(window);
} catch (error) {
  console.warn('DOMPurify initialization failed, falling back to passthrough sanitizer', error);
  DOMPurify = { sanitize: (dirty: string) => dirty };
}

// Ensure sanitize function exists
if (!DOMPurify || typeof DOMPurify.sanitize !== 'function') {
  console.warn('DOMPurify sanitize method unavailable, using passthrough');
  DOMPurify = { sanitize: (dirty: string) => dirty };
}

/**
 * Sanitize HTML string to prevent XSS attacks
 * @param dirty - The potentially unsafe HTML string
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') {
    return '';
  }
  
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [], // No HTML tags allowed - strip all
    ALLOWED_ATTR: [], // No attributes allowed
    KEEP_CONTENT: true // Keep text content but strip tags
  });
}

/**
 * Sanitize plain text (removes HTML tags and encodes special characters)
 * @param text - The text to sanitize
 * @returns Sanitized plain text
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // First strip HTML tags
  const withoutTags = sanitizeHtml(text);
  
  // Then escape special characters for safe display
  return withoutTags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize object properties recursively
 * @param obj - Object to sanitize
 * @param fields - Array of field names to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  fields: string[]
): T {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const sanitized = { ...obj };
  
  for (const field of fields) {
    if (field.includes('.')) {
      // Handle nested fields like 'profile.firstName'
      const parts = field.split('.');
      let current: any = sanitized;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] && typeof current[parts[i]] === 'object') {
          current = current[parts[i]];
        } else {
          break;
        }
      }
      
      const lastKey = parts[parts.length - 1];
      if (current[lastKey] && typeof current[lastKey] === 'string') {
        current[lastKey] = sanitizeText(current[lastKey]);
      }
    } else {
      if (sanitized[field] && typeof sanitized[field] === 'string') {
        (sanitized as any)[field] = sanitizeText(sanitized[field]);
      }
    }
  }
  
  return sanitized;
}

/**
 * Sanitize array of strings
 * @param arr - Array of strings to sanitize
 * @returns Sanitized array
 */
export function sanitizeArray(arr: string[]): string[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  
  return arr.map(item => sanitizeText(item));
}

