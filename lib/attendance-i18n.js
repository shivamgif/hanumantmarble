'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/lib/translations';

/**
 * stock.attendance.* in the current language, with {slots} filled from `vars`:
 * t('awayFrom', { branch: 'Kishangarh' }). Shared by the stock attendance
 * screens and the kiosk, which sits outside /stock.
 */
export function useAttendanceText() {
  const { language } = useLanguage();
  return (key, vars) =>
    String(getTranslation(`stock.attendance.${key}`, language)).replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? '');
}
