/**
 * Password policy utilities
 * Enforces password strength requirements for new users and password changes
 */

export interface PasswordStrengthResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

/**
 * Check password strength
 * Requirements:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - Optional special character (recommended but not required)
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];
  let strength: 'weak' | 'medium' | 'strong' = 'weak';

  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password is required'],
      strength: 'weak'
    };
  }

  // Check minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  // Check for uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  // Check for number
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  // Determine strength
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const lengthScore = password.length >= 12 ? 2 : password.length >= 8 ? 1 : 0;
  const complexityScore = (hasSpecialChar ? 1 : 0) + (password.length >= 10 ? 1 : 0);

  if (lengthScore >= 1 && complexityScore >= 1) {
    strength = 'strong';
  } else if (lengthScore >= 1) {
    strength = 'medium';
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
}

/**
 * Validate password for new users or password changes
 * This is stricter than the old policy (which only required 6 characters)
 */
export function validatePasswordForNewUsers(password: string): { isValid: boolean; error?: string } {
  const result = checkPasswordStrength(password);
  
  if (!result.isValid) {
    return {
      isValid: false,
      error: result.errors.join('. ')
    };
  }

  return { isValid: true };
}

/**
 * Check if password meets old policy (for existing users)
 * Old policy: minimum 6 characters
 */
export function validatePasswordOldPolicy(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      error: 'Password is required'
    };
  }

  if (password.length < 6) {
    return {
      isValid: false,
      error: 'Password must be at least 6 characters long'
    };
  }

  return { isValid: true };
}

