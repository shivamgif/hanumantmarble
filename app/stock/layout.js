'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ClipboardList, FileText, Home, Languages, MoonStar, PackagePlus, SunMedium, Users, LogOut } from 'lucide-react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';
import BrandedLoginPage from '@/components/BrandedLoginPage';

/**
 * Layout for internal stock management routes
 * Enforces authentication and internal-only access
 */
export default function StockLayout({ children }) {
  const { user, isLoading, error } = useUser();
  const { language, toggleLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessApproved, setAccessApproved] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [accessRole, setAccessRole] = useState('stock_maintainer');
  const [collapsed, setCollapsed] = useState(false);

  const t = (key) => getTranslation(`stock.layout.${key}`, language);
  const isDarkTheme = resolvedTheme === 'dark';
  const isUnauthorizedError = error?.message === 'Unauthorized' || error?.status === 401;
  function handleStockLogout() {
    document.cookie = `hm-login-return-to=${encodeURIComponent('/stock')}; Path=/; Max-Age=300; SameSite=Lax`;
    window.location.href = `/auth/logout?returnTo=${encodeURIComponent(window.location.origin)}`;
  }

  const navigationItems = [
    { href: '/stock', label: t('dashboard'), icon: Home },
  ];

  if (accessRole === 'admin' || accessRole === 'manager') {
    navigationItems.push({ href: '/stock/admin', label: t('adminDashboard'), icon: Users });
  }

  const isActiveRoute = (href) => {
    const cleanHref = href.split('#')[0];

    if (cleanHref === '/stock') {
      return pathname === '/stock';
    }

    return pathname?.startsWith(cleanHref);
  };

  useEffect(() => {
    const storedCollapsed = window.localStorage.getItem('stock-sidebar-collapsed');
    if (storedCollapsed !== null) {
      setCollapsed(storedCollapsed === 'true');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('stock-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      if (!user) {
        return;
      }

      setAccessLoading(true);
      try {
        const response = await fetch('/api/stock/access', { cache: 'no-store' });
        const result = await response.json();

        if (!mounted) {
          return;
        }

        if (!response.ok) {
          setAccessApproved(false);
          setAccessMessage(result.error || t('accessFallback'));
          return;
        }

        setAccessApproved(Boolean(result.approved));
        setAccessMessage(result.message || t('accessPendingFallback'));
        setAccessRole(result.role || 'stock_maintainer');
      } catch (accessError) {
        if (!mounted) {
          return;
        }

        setAccessApproved(false);
        setAccessMessage(accessError.message || t('accessFallback'));
      } finally {
        if (mounted) {
          setAccessLoading(false);
        }
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error && !isUnauthorizedError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">{t('accessError')}</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <BrandedLoginPage returnTo="/stock" />;
  }

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-600 mt-4">{t('loadingAccess')}</p>
        </div>
      </div>
    );
  }

  if (!accessApproved) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background px-4 py-10 text-foreground">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
        </div>
        <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-border bg-muted/40">
                <Image
                  src="/logo.png"
                  alt="Hanumant Marble logo"
                  fill
                  sizes="48px"
                  className="object-contain p-1.5"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Hanumant Marble</p>
                <p className="text-sm text-muted-foreground">Stock management access</p>
              </div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{t('waitingApproval')}</h1>
            <p className="mt-3 text-muted-foreground">{accessMessage}</p>
            <p className="mt-3 text-sm text-muted-foreground">{t('waitingDetails')}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={handleStockLogout} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60">{t('logout')}</button>
              <Link href="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">{t('goWebsite')}</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground lg:flex">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-24 bottom-24 h-72 w-72 rounded-full bg-secondary/60 blur-3xl" />
      </div>
      <aside className={`relative z-10 border-b border-border bg-card/95 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r lg:border-border ${collapsed ? 'lg:w-[92px]' : 'lg:w-[280px]'}`}>
        <div className={`flex items-center gap-3 px-3 py-3 lg:border-b lg:border-border ${collapsed ? 'lg:justify-center' : ''}`}>
          <Link href="/stock" className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center' : ''}`} aria-label="Hanumant Marble stock dashboard">
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border bg-muted/40">
              <Image
                src="/logo.png"
                alt="Hanumant Marble logo"
                fill
                sizes="64px"
                className="object-contain p-1.5"
                priority
              />
            </div>
            <div className={collapsed ? 'lg:hidden' : ''}>
              <p className="text-sm font-semibold tracking-[0.2em] text-muted-foreground">HANUMANT</p>
              <p className="text-lg font-bold leading-tight text-foreground">{t('brand')}</p>
            </div>
          </Link>

          
        </div>

        <div className={`px-5 pb-5 lg:flex lg:flex-1 lg:flex-col lg:justify-between ${collapsed ? 'lg:px-3' : ''}`}>
          <div className="space-y-8">
            <div className="mt-4 flex items-center justify-between gap-1 ">
            <button
              type="button"
              onClick={toggleLanguage}
              className={`inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground transition hover:bg-primary/10 hover:text-primary ${collapsed ? 'lg:px-2' : ''}`}
              aria-label={language === 'en' ? t('switchToHindi') : t('switchToEnglish')}
            >
              <Languages className="h-4 w-4" />
              <span className={collapsed ? 'lg:hidden' : ''}>{language.toUpperCase()}</span>
            </button>
               <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="inline-flex rounded-full border border-border bg-muted/60 p-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
              aria-label={collapsed ? t('openSidebar') : t('closeSidebar')}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            </div>
            <div className={`rounded-3xl border border-border bg-muted/40 p-4 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('workspace')}</p>
              <h1 className="mt-2 text-xl font-bold text-foreground">{t('internalDashboard')}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('workspaceHelp')}</p>
            </div>

            <nav className="space-y-1">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActiveRoute(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${collapsed ? 'lg:justify-center lg:px-3' : ''} ${active ? 'bg-primary/10 text-primary shadow-sm' : 'text-foreground/75 hover:bg-primary/10 hover:text-primary'}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-foreground/60'}`} />
                    <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-8 space-y-4 border-t border-border pt-5 text-sm">
            <div className={`rounded-2xl border border-border bg-muted/40 px-4 py-3 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t('signedInAs')}</p>
              <p className="mt-2 break-words text-sm text-foreground">{user?.email}</p>
            </div>
            <div className={`flex items-center gap-2 ${collapsed ? 'lg:justify-center' : ''}`}>
              <button
                type="button"
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-foreground/75 transition hover:bg-primary/10 hover:text-primary ${collapsed ? 'lg:justify-center lg:px-3' : ''}`}
                title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                <span className={collapsed ? 'lg:hidden' : ''}>{isDarkTheme ? 'Light' : 'Dark'}</span>
              </button>
              <button type="button" onClick={handleStockLogout} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-foreground/75 transition hover:bg-primary/10 hover:text-primary ${collapsed ? 'lg:justify-center lg:px-3' : ''}`} title={t('logout')} aria-label={t('logout')}>
                <LogOut className="h-4 w-4" />
                <span className={collapsed ? 'lg:hidden' : ''}>{t('logout')}</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="border-t border-border bg-card px-4 py-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>{t('footerTitle')} • {t('footerUpdated')}: {new Date().toLocaleString()}</p>
        </footer>
      </div>
    </div>
  );
}
