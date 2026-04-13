const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_DATABASE_CONNECTION = process.env.AUTH0_DATABASE_CONNECTION || 'Username-Password-Authentication';
const MIN_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_TYPES = 3;

function assertAuth0Config() {
  if (!AUTH0_DOMAIN) {
    throw new Error('AUTH0_DOMAIN is required');
  }

  if (!AUTH0_CLIENT_ID) {
    throw new Error('AUTH0_CLIENT_ID is required');
  }
}

function toReadableErrorMessage(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toReadableErrorMessage(entry)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message;
    }

    if (typeof value.description === 'string' && value.description.trim()) {
      return value.description;
    }

    if (typeof value.error_description === 'string' && value.error_description.trim()) {
      return value.error_description;
    }

    return Object.entries(value)
      .map(([key, entry]) => `${key}: ${toReadableErrorMessage(entry)}`)
      .filter((entry) => !entry.endsWith(': '))
      .join('; ');
  }

  return String(value);
}

function getPasswordTypeCount(password) {
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  return [hasLowercase, hasUppercase, hasNumber, hasSymbol].filter(Boolean).length;
}

export function validateStockPassword(password) {
  const cleanPassword = String(password || '');

  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (getPasswordTypeCount(cleanPassword) < MIN_PASSWORD_TYPES) {
    return `Password must contain at least ${MIN_PASSWORD_TYPES} of these character types: lowercase, uppercase, number, and symbol.`;
  }

  return '';
}

async function auth0SignupRequest(payload) {
  assertAuth0Config();

  const response = await fetch(`https://${AUTH0_DOMAIN}/dbconnections/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = toReadableErrorMessage(json?.description || json?.error || json?.message || json?.error_description || text) || 'Auth0 signup failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = json;
    throw error;
  }

  return json;
}

export async function upsertAuth0DatabaseUser({ email, password, name, phone, connection = AUTH0_DATABASE_CONNECTION }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  const cleanName = String(name || '').trim();
  const cleanPhone = String(phone || '').trim();

  if (!cleanEmail) {
    throw new Error('Email is required for Auth0 user creation');
  }

  const passwordError = validateStockPassword(cleanPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  const payload = {
    client_id: AUTH0_CLIENT_ID,
    email: cleanEmail,
    password: cleanPassword,
    connection,
    verify_email: false,
    email_verified: false,
    name: cleanName || cleanEmail,
    user_metadata: {
      phone: cleanPhone || '',
      stock_user: 'true',
    },
  };

  return auth0SignupRequest(payload);
}
