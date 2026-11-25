'use client';

// The stock form schemas and zod (about 66 KB gzipped) stay out of the page's
// first-load bundle: they load once the page is idle, or at the latest on a
// form's first validation, whichever comes first.
let loaded;
const load = () => (loaded ??= Promise.all([import('@hookform/resolvers/zod'), import('./stock-forms')]));

if (typeof window !== 'undefined') (window.requestIdleCallback || setTimeout)(() => load());

/** zodResolver(schemas[schemaName]) for react-hook-form, loaded on demand. */
export function lazyZodResolver(schemaName) {
  return async (values, context, options) => {
    const [{ zodResolver }, schemas] = await load();
    return zodResolver(schemas[schemaName])(values, context, options);
  };
}
