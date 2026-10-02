import Image from 'next/image';

// The trimmed, transparent logo (public/logo-mark.png). Its navy roof is
// invisible on dark surfaces (~1:1), so dark mode swaps in a copy with the navy
// lifted to slate-200.
export function BrandMark({ size = 32, className = '', priority = false }) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: Math.round((size * 289) / 276) }}>
      <Image src="/logo-mark.png" alt="Hanumant Marble logo" fill sizes={`${size}px`} className="object-contain dark:hidden" priority={priority} />
      <Image src="/logo-mark-dark.png" alt="" aria-hidden="true" fill sizes={`${size}px`} className="hidden object-contain dark:block" priority={priority} />
    </span>
  );
}
