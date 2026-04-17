'use client';

import { useState, useCallback, useEffect } from 'react';

export function useStockNotifications({ user, accessApproved }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [notificationUpdating, setNotificationUpdating] = useState(false);
  const [showNotificationDebug, setShowNotificationDebug] = useState(false);

  const loadNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setNotificationLoading(true);
    }

    try {
      const response = await fetch('/api/stock/notifications?limit=25', { cache: 'no-store' });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load notifications');
      }

      setNotifications(json.notifications || []);
      setUnreadCount(Number(json.unreadCount || 0));
      setNotificationError(null);
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      if (!silent) {
        setNotificationLoading(false);
      }
    }
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    setNotificationUpdating(true);

    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markAllRead' }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to mark notifications read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    } finally {
      setNotificationUpdating(false);
    }
  }, [loadNotifications]);

  const markNotificationRead = useCallback(async (notificationId) => {
    try {
      const response = await fetch('/api/stock/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markRead', id: notificationId }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error || 'Failed to mark notification read');
      }

      await loadNotifications({ silent: true });
    } catch (err) {
      setNotificationError(err.message);
    }
  }, [loadNotifications]);

  const handleNotificationNavigate = useCallback((notification) => {
    if (!notification?.is_read) {
      markNotificationRead(notification.id);
    }
    setNotificationOpen(false);
  }, [markNotificationRead]);

  useEffect(() => {
    if (!accessApproved || !user) {
      return;
    }

    loadNotifications();

    const intervalId = setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);

    return () => clearInterval(intervalId);
  }, [accessApproved, user, loadNotifications]);

  return {
    notificationOpen,
    setNotificationOpen,
    notifications,
    unreadCount,
    notificationLoading,
    notificationError,
    notificationUpdating,
    showNotificationDebug,
    setShowNotificationDebug,
    markAllNotificationsRead,
    handleNotificationNavigate
  };
}
