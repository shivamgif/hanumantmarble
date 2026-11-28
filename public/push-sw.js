// Phone and desktop alerts only. No fetch handler: pages and files still come
// straight from the network (see components/PWAInstall.js for why there is no
// caching worker).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const shown = self.registration.showNotification(data.title || 'Nirnay', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Same item, same tag: a newer alert about this dispatch replaces the old
    // one in the tray instead of stacking.
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/stock' },
  });
  const badge = 'setAppBadge' in self.navigator && Number(data.unread) > 0
    ? self.navigator.setAppBadge(Number(data.unread)).catch(() => {})
    : Promise.resolve();
  event.waitUntil(Promise.all([shown, badge]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/stock', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).pathname.startsWith('/stock'));
    if (open) {
      await open.focus();
      return open.navigate(url).catch(() => {});
    }
    return self.clients.openWindow(url);
  })());
});
