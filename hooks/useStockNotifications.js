'use client';

import { useState, useCallback, useEffect } from 'react';

const PUSH_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function pushSupported() {
  return Boolean(PUSH_KEY) && typeof window !== 'undefined'
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// The push service wants the VAPID key as raw bytes, not base64url text.
function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function patchNotifications(body) {
  return fetch('/api/stock/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Subscribe this device (idempotent: same endpoint, same row) and tell the server who it belongs to. */
async function syncPushSubscription() {
  const registration = await navigator.serviceWorker.register('/push-sw.js');
  const subscription = (await registration.pushManager.getSubscription())
    || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_KEY) }));
  await patchNotifications({ action: 'subscribePush', subscription: subscription.toJSON() });
}

/** Signing out: this device stops getting the previous user's alerts. */
export async function forgetPushOnThisDevice() {
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await patchNotifications({ action: 'unsubscribePush', endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  } catch {
    // Signing out must not wait on this.
  }
}

export function useStockNotifications({ user, accessApproved }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState(null);
  const [notificationUpdating, setNotificationUpdating] = useState(false);
  // 'unsupported' | 'default' (not asked yet) | 'granted' | 'denied'
  const [pushPermission, setPushPermission] = useState('unsupported');

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
      const response = await patchNotifications({ action: 'markAllRead' });

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
      const response = await patchNotifications({ action: 'markRead', id: notificationId });

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

  // Must run from a tap: that is when Android and iOS show the permission prompt.
  const enablePush = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') await syncPushSubscription();
    } catch (err) {
      setNotificationError(err.message);
    }
  }, []);

  // Depend on the user's stable ID, not the object reference.
  // This prevents the interval from being torn down and restarted when
  // useAuthUser produces a new user object for the same account.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!accessApproved || !userId) {
      return;
    }

    loadNotifications();

    if (pushSupported()) {
      setPushPermission(Notification.permission);
      // Re-sync every session: push services rotate endpoints, and another
      // person may have used this device before.
      if (Notification.permission === 'granted') syncPushSubscription().catch(() => {});
    }

    // A hidden tab doesn't poll; it catches up the moment it's shown again.
    const intervalId = setInterval(() => {
      if (!document.hidden) loadNotifications({ silent: true });
    }, 60000);
    const onVisible = () => {
      if (!document.hidden) loadNotifications({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessApproved, userId, loadNotifications]);

  // The app icon's badge, where the platform has one (desktop, iOS home screen).
  // Android shows a dot for alerts in the tray instead and ignores this.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (unreadCount > 0 ? navigator.setAppBadge(unreadCount) : navigator.clearAppBadge()).catch(() => {});
  }, [unreadCount]);

  return {
    notificationOpen,
    setNotificationOpen,
    notifications,
    unreadCount,
    notificationLoading,
    notificationError,
    notificationUpdating,
    markAllNotificationsRead,
    handleNotificationNavigate,
    pushPermission,
    enablePush,
  };
}
