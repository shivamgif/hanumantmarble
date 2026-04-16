const MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_TYPES = 3;

function getPasswordTypeCount(password) {
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  return [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length;
}

export function validateStockPassword(password) {
  const cleanPassword = String(password || '');

  if (!cleanPassword) {
    return '';
  }

  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (getPasswordTypeCount(cleanPassword) < MIN_PASSWORD_TYPES) {
    return `Password must contain at least ${MIN_PASSWORD_TYPES} of these character types: lowercase, uppercase, number, and symbol.`;
  }

  return '';
}
