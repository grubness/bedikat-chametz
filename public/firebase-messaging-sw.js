// public/firebase-messaging-sw.js
// This file MUST be in the public/ folder so it can be served from the root.
// ─────────────────────────────────────────────────────────────────────────────
// Push notifications arrive here when the app is in the BACKGROUND or CLOSED.
// ─────────────────────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── PASTE THE SAME firebaseConfig HERE ───────────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyAELQrXu-o2uyqeDSDTe5jy9WPJWqxOL3k",
  authDomain:        "bedikatz-chametz.firebaseapp.com",
  databaseURL:       "https://bedikatz-chametz-default-rtdb.firebaseio.com",
  projectId:         "bedikatz-chametz",
  storageBucket:     "bedikatz-chametz.firebasestorage.app",
  messagingSenderId: "1017040590590",
  appId:             "1:1017040590590:web:2381c1ef502d852b6eb7af",
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification ?? {};
  self.registration.showNotification(title ?? '🕯 Bedikat Chametz', {
    body:  body  ?? 'A piece was found!',
    icon:  icon  ?? '/candle-192.png',
    badge: '/candle-192.png',
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [{ action: 'open', title: 'Open App' }],
  });
});

// Clicking the notification opens the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
