"use client";

import { useEffect } from "react";

// No service worker. public/sw.js is gitignored, so production never had one:
// registering it only cost a 404 (a not-found render) on every page load. The
// files a worker would cache, /_next/static/, already ship with a one-year
// immutable Cache-Control, and Chrome no longer needs a worker to install the
// PWA. This removes any worker a dev session or old deploy left behind.
export default function PWAInstall() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      if (!registrations.length) return;
      registrations.forEach((registration) => registration.unregister());
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
    });
  }, []);

  return null;
}
