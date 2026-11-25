import Image from 'next/image';

// The trimmed, transparent logo (public/logo-mark.png). Its navy roof is
// invisible on dark surfaces (~1:1), so dark mode swaps in a copy with the navy
// lifted to slate-200. Hanumant Marble's storefront mark.
export function BrandMark({ size = 32, className = '', priority = false }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: Math.round((size * 289) / 276) }}>
      <Image src="/logo-mark.png" alt="Hanumant Marble logo" fill sizes={`${size}px`} className="object-contain dark:hidden" priority={priority} />
      <Image src="/logo-mark-dark.png" alt="" aria-hidden="true" fill sizes={`${size}px`} className="hidden object-contain dark:block" priority={priority} />
    </span>
  );
}

/**
 * A company's mark in the stock app: its uploaded logo (or tenants.settings
 * { logo, logoDark }), otherwise its initials. `name` alone (no logo) is used
 * for the product itself on the login page.
 */
export function CompanyMark({ name = '', logo = null, logoDark = null, size = 32, className = '' }) {
  if (logo) {
    // Plain <img>, not next/image: an uploaded logo is served by a signed-in
    // API route, and the image optimiser would fetch it without the cookie.
    /* eslint-disable @next/next/no-img-element */
    return (
      <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
        <img src={logo} alt={`${name} logo`} className={`h-full w-full object-contain ${logoDark ? 'dark:hidden' : ''}`} />
        {logoDark ? <img src={logoDark} alt="" aria-hidden="true" className="hidden h-full w-full object-contain dark:block" /> : null}
      </span>
    );
    /* eslint-enable @next/next/no-img-element */
  }
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}
