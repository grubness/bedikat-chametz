// src/firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
//   1. Go to https://console.firebase.google.com
//   2. Create a new project called "bedikat-chametz"
//   3. Add a Web App (the </> icon)
//   4. Copy the firebaseConfig object and paste it below
//   5. In the Firebase Console → Build → Realtime Database → Create database
//      Choose "Start in test mode" (you'll lock it down after with security rules)
//   6. In Firebase Console → Build → Cloud Messaging → Enable and copy your VAPID key
//      into VAPID_KEY below
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, onValue, push, serverTimestamp } from 'firebase/database';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            "AIzaSyAELQrXu-o2uyqeDSDTe5jy9WPJWqxOL3k",
  authDomain:        "bedikatz-chametz.firebaseapp.com",
  databaseURL:       "https://bedikatz-chametz-default-rtdb.firebaseio.com",
  projectId:         "bedikatz-chametz",
  storageBucket:     "bedikatz-chametz.firebasestorage.app",
  messagingSenderId: "1017040590590",
  appId:             "1:1017040590590:web:2381c1ef502d852b6eb7af",
  measurementId:     "G-FM0ZSJK2NP",
};

// ── PASTE YOUR FCM VAPID KEY HERE ─────────────────────────────────────────────
export const VAPID_KEY = "YOUR_VAPID_KEY_FROM_FIREBASE_CONSOLE";

// ─────────────────────────────────────────────────────────────────────────────
const app       = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export let messaging = null;
try { messaging = getMessaging(app); } catch(e) { /* not supported in all envs */ }

// ── Database helpers ──────────────────────────────────────────────────────────

/** Create a new room with 10 blank pieces */
export async function createRoom(roomCode, adminName) {
  const pieces = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      `piece_${i + 1}`,
      {
        number: i + 1, room: '', note: '', photo: null,
        lat: null, lng: null, accuracy: null,
        hidden: false, hiddenBy: '', hiddenAt: '',
        found: false, foundBy: '', foundAt: '',
      }
    ])
  );
  await set(ref(db, `rooms/${roomCode}`), {
    createdAt: serverTimestamp(),
    adminName,
    pieces,
    members: { [sanitizeName(adminName)]: { name: adminName, isAdmin: true, joinedAt: serverTimestamp() } },
    activity: [],
    year: new Date().getFullYear(),
  });
}

/** Join an existing room */
export async function joinRoom(roomCode, userName) {
  const snap = await get(ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error('Room not found');
  await update(ref(db, `rooms/${roomCode}/members/${sanitizeName(userName)}`), {
    name: userName, isAdmin: false, joinedAt: serverTimestamp()
  });
  return snap.val();
}

/** Check if room exists */
export async function roomExists(roomCode) {
  const snap = await get(ref(db, `rooms/${roomCode}`));
  return snap.exists();
}

/** Update a single piece */
export async function updatePiece(roomCode, pieceKey, data) {
  await update(ref(db, `rooms/${roomCode}/pieces/${pieceKey}`), data);
}

/** Add an activity log entry */
export async function logActivity(roomCode, message) {
  await push(ref(db, `rooms/${roomCode}/activity`), {
    message,
    ts: serverTimestamp(),
  });
}

/** Save email → room code mapping for "Find My Room" lookup */
export async function saveEmailRoom(email, roomCode) {
  const key = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await set(ref(db, `email_rooms/${key}`), roomCode);
}

/** Look up a room code by email address */
export async function lookupRoomByEmail(email) {
  const key = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const snap = await get(ref(db, `email_rooms/${key}`));
  return snap.exists() ? snap.val() : null;
}

/** Listen to room in real time — returns unsubscribe fn */
export function subscribeRoom(roomCode, callback) {
  const r = ref(db, `rooms/${roomCode}`);
  const unsub = onValue(r, snap => callback(snap.val()));
  return unsub;
}

/** Save a member's FCM token so we can notify them */
export async function saveFcmToken(roomCode, userName, token) {
  await update(ref(db, `rooms/${roomCode}/members/${sanitizeName(userName)}`), { fcmToken: token });
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
}

// ── Push notification helpers ─────────────────────────────────────────────────

/** Request notification permission and return the FCM token */
export async function requestNotificationPermission() {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch (e) {
    console.warn('FCM token error:', e);
    return null;
  }
}

/** Listen for foreground push messages */
export function onForegroundMessage(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}

// ── Firebase Security Rules (paste into Firebase Console → Realtime DB → Rules)
/*
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read":  "auth == null || auth != null",
        ".write": "auth == null || auth != null",
        "pieces": {
          "$pieceId": {
            ".validate": "newData.hasChildren(['number','hidden','found'])"
          }
        }
      }
    }
  }
}

NOTE: The above rules allow unauthenticated access (fine for a family app with
a shared room code). When you're ready to tighten security, add Firebase Auth
(anonymous or Google) and lock rules to authenticated users only.
*/
