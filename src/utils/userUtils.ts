import crypto from 'crypto';

export const generateUserId = (role: string, phoneNumber: string, factoryCode?: string): string => {
  // Extract last 5 digits from phone number
  const cleanPhone = phoneNumber.replace(/\D/g, ''); // Remove all non-digits
  const last5Digits = cleanPhone.slice(-5);
  
  // For supervisors and employees, use Factory + Role + last 5 digits
  if (role === 'supervisor' || role === 'employee') {
    const factoryPrefix = factoryCode ? factoryCode.slice(0, 3).toUpperCase() : 'FAC';
    const rolePrefix = role === 'supervisor' ? 'SUP' : 'EMP';
    return `${factoryPrefix}${rolePrefix}${last5Digits}`;
  }
  
  // For other roles, use the old format as fallback
  const timestamp = Date.now().toString().slice(-6);
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `USR${timestamp}${random}`;
};

export const generatePassword = (): string => {
  // Generate a 6-character password with letters and numbers
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const generateEmailFromId = (userId: string, factoryDomain: string = 'factory.com'): string => {
  return `${userId.toLowerCase()}@${factoryDomain}`;
};
