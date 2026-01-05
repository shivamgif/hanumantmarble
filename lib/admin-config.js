// Admin email addresses that have access to the admin panel
// Add your email(s) here
export const ADMIN_EMAILS = [
  'ssshivam.singh.2@gmail.com',
  // Add more admin emails as needed
];

export function isAdmin(userEmail) {
  if (!userEmail) return false;
  return ADMIN_EMAILS.includes(userEmail.toLowerCase());
}
