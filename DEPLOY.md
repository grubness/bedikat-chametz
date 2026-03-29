# Bedikat Chametz — Complete Deployment Guide
### Created by Shimon Rosenberg
### לע״נ יוסף ישראל בן שמעון מאיר ז״ל

---

## Overview

This guide walks you from zero to a live, shareable app in about 30 minutes.
You will end up with a URL like `bedikat-chametz.vercel.app` that any family
member can open on their phone — no App Store, no download required.

**Total cost at family scale: $0/year**
(Firebase free tier + Vercel free tier covers hundreds of families easily)

---

## What You Need (all free accounts)

| Service | Purpose | Free tier |
|---------|---------|-----------|
| [GitHub](https://github.com) | Stores your code | Unlimited public repos |
| [Firebase](https://firebase.google.com) | Real-time database + push notifications | 1GB DB, 10GB bandwidth/month |
| [Vercel](https://vercel.com) | Hosts the app, auto-deploys | Unlimited hobby projects |

---

## PART 1 — Firebase Setup (~10 min)

### 1.1 Create the Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project**
3. Name it: `bedikat-chametz`
4. Disable Google Analytics (not needed)
5. Click **Create project**

### 1.2 Add a Web App

1. On the project overview, click the **< / >** (Web) icon
2. Register app nickname: `bedikat-chametz-web`
3. **Do NOT** check "Also set up Firebase Hosting" (we're using Vercel)
4. Copy the `firebaseConfig` object — you'll need it in step 1.5

### 1.3 Enable Realtime Database

1. In the left sidebar → **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose your region (us-central1 is fine)
4. Select **Start in test mode** → Enable
5. Your database URL will look like:
   `https://bedikat-chametz-default-rtdb.firebaseio.com`

### 1.4 Set Security Rules

In Realtime Database → **Rules** tab, paste this and click Publish:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read":  true,
        ".write": true,
        "pieces": {
          "$pieceId": {
            ".validate": "newData.hasChildren(['number', 'hidden', 'found'])"
          }
        }
      }
    }
  }
}
```

> **Note:** These rules allow access by room code (like a shared password).
> This is appropriate for a family app. For a public launch, add Firebase Auth.

### 1.5 Enable Cloud Messaging (Push Notifications)

1. Left sidebar → **Build** → **Cloud Messaging**
2. Click **Generate key pair** under Web Push certificates
3. Copy the **Key pair** string — this is your VAPID key

### 1.6 Paste Config Into the App

Open `src/firebase.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",          // from step 1.2
  authDomain:        "bedikat-chametz.firebaseapp.com",
  databaseURL:       "https://bedikat-chametz-default-rtdb.firebaseio.com",
  projectId:         "bedikat-chametz",
  storageBucket:     "bedikat-chametz.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123...",
};

export const VAPID_KEY = "BNa8..."; // from step 1.5
```

Also paste the **same** `firebaseConfig` into `public/firebase-messaging-sw.js`
(the service worker needs it too for background notifications).

---

## PART 2 — GitHub Setup (~5 min)

### 2.1 Create a Repository

1. Go to https://github.com/new
2. Repository name: `bedikat-chametz`
3. Set to **Public** (required for Vercel free tier)
4. Click **Create repository**

### 2.2 Push Your Code

In your terminal, from the project folder:

```bash
git init
git add .
git commit -m "Initial commit — Bedikat Chametz v3"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bedikat-chametz.git
git push -u origin main
```

---

## PART 3 — Vercel Deployment (~5 min)

### 3.1 Connect Vercel to GitHub

1. Go to https://vercel.com → Sign up with GitHub
2. Click **Add New Project**
3. Import your `bedikat-chametz` repository
4. Vercel auto-detects Vite — click **Deploy**

That's it. Your app is live at `bedikat-chametz.vercel.app` in ~90 seconds.

### 3.2 Every Future Update

Push to GitHub → Vercel auto-redeploys. Zero manual work.

```bash
git add .
git commit -m "update: ..."
git push
```

### 3.3 Custom Domain (optional)

In Vercel → Settings → Domains → Add `bedikat.yourdomain.com`
If you want something memorable, domains cost ~$12/year at Namecheap or Google Domains.

---

## PART 4 — Share the App

### How families join:

1. Send them the URL: `https://bedikat-chametz.vercel.app`
2. On iPhone: tap Share → **Add to Home Screen** → it works like a native app
3. On Android: tap the browser menu → **Install app**

### Share a room:

1. Admin opens the app → **Create Room**
2. A 5-letter code appears (e.g. `RNST4`)
3. Text it to family: *"Open bedikat-chametz.vercel.app and join room RNST4"*
4. Family members tap **Join Room**, enter the code — they're synced instantly

---

## PART 5 — Costs & Sustainability

### Firebase Free Tier (Spark Plan)

| Resource | Free limit | Estimated usage (100 families) |
|----------|------------|--------------------------------|
| DB storage | 1 GB | ~50 MB |
| DB bandwidth | 10 GB/month | ~200 MB (only active ~2 weeks/year) |
| Simultaneous connections | 100 | ~20 peak |

**Verdict: Free forever at community scale.**

If usage ever exceeds free limits, upgrade to **Blaze (pay-as-you-go)**:
estimated $1–5/year for thousands of families due to the seasonal nature.

### Vercel Free Tier

100 GB bandwidth/month, unlimited deployments. More than enough.

---

## PART 6 — Optional Nominal Fee (to offset costs + tzedakah)

If you'd like to invite voluntary contributions:

### Option A: Buy Me a Coffee (easiest)
1. Sign up at https://buymeacoffee.com
2. Set up a page: "Support Bedikat Chametz — help cover server costs"
3. Add the link to the app's splash screen

### Option B: Stripe Payment Link (more professional)
1. Create a Stripe account at https://stripe.com
2. Dashboard → **Payment Links** → Create a $1.99 one-time link
3. Label it: "Support the Mitzvah — voluntary contribution"
4. Add it to the app footer

### Suggested framing (add to splash screen):
```
This app is free for all families.
If it added joy to your Bedikat Chametz,
a small contribution helps cover server costs. 🕯
[Support →]
```

No paywall. No tracking. All voluntary.

---

## PART 7 — Troubleshooting

| Problem | Fix |
|---------|-----|
| "Room not found" on join | Check the 5-letter code — codes are case-insensitive |
| Photos not saving | Firebase has a 10MB write limit. The app compresses photos to ~200KB automatically |
| Push notifications not working | iOS requires the app to be "Added to Home Screen" first |
| GPS very inaccurate indoors | Expected — use the photo clue for final approach |
| App not updating after code push | Hard-refresh (Cmd+Shift+R) or clear browser cache |

---

## File Structure Reference

```
bedikat-chametz/
├── index.html                    # App entry point
├── vite.config.js                # Build config + PWA
├── package.json                  # Dependencies
├── src/
│   ├── main.jsx                  # React mount point
│   ├── App.jsx                   # Full app (UI + logic)
│   └── firebase.js               # Firebase config + DB helpers
└── public/
    ├── firebase-messaging-sw.js  # Push notification service worker
    ├── candle-192.png            # App icon (add your own 192x192 image)
    └── candle-512.png            # App icon (add your own 512x512 image)
```

---

## App Icons

You need two PNG icon files for the PWA:
- `public/candle-192.png` — 192×192 px
- `public/candle-512.png` — 512×512 px

Simple option: use https://favicon.io/emoji-favicons/ → search "candle" → download and resize.

---

*Chag Kasher v'Sameach* 🍷
