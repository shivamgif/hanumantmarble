"use client";

import { useEffect } from "react";

export default function PWAInstall() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // public/sw.js serves /_next/static/ cache-first. Production chunk names
    // change with their content, so that is safe there. In development they
    // keep one name while the code under them changes, so the worker kept
    // serving copies from before an edit: new components with stale
    // translations, fixes that never arrived. Development runs with no worker
    // and removes any one a previous visit left behind.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered with scope:", registration.scope);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  }, []);

  return null;
}
