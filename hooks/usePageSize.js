import { useState, useEffect } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

export function usePageSize() {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('hanumant_page_size');
      if (stored) {
        setPageSize(Number(stored));
      }
    } catch (e) {}
  }, []);

  const updatePageSize = (newSize) => {
    setPageSize(newSize);
    try {
      localStorage.setItem('hanumant_page_size', String(newSize));
      window.dispatchEvent(new CustomEvent('hanumant_page_size_change', { detail: newSize }));
    } catch (e) {}
  };

  useEffect(() => {
    const handleSync = (e) => setPageSize(e.detail);
    window.addEventListener('hanumant_page_size_change', handleSync);
    return () => window.removeEventListener('hanumant_page_size_change', handleSync);
  }, []);

  return [pageSize, updatePageSize];
}
