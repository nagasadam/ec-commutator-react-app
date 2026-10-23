# Deploying: GitHub Pages + free cloud storage

## 0. What you are deploying
A static site (no server). Data lives in the browser (localStorage) and, once you set up
the cloud below, also in Firestore so every device sees the same books. Without any
cloud settings the app still works fully on one device.

## 1. Free storage: which one?
| Option | Free allowance | Catch |
|---|---|---|
| **Firebase Spark (Auth + Firestore)** — built in, recommended | 1 GiB stored, 50k reads / 20k writes per day, no card | Cloud Storage (files) is no longer free, but this app only needs Firestore |
| Supabase free | 500 MB Postgres, 50k users | Projects **pause after a week of inactivity**: bad for a books app you open monthly |

Firebase is already wired in (`src/lib/firebase.js`, `firestore.rules`). One business is
one Firestore document, capped at 1 MiB; the app warns you at ~700 KB. At the demo's record
sizes that is thousands of invoices, so start a new business each financial year.
Everyone you add shares the same books; there is no per-user separation.

## 2. Create the Firebase project (about 10 minutes)
1. console.firebase.google.com > Add project (skip Analytics).
2. Build > **Authentication** > Get started > enable **Email/Password**.
3. Authentication > Users > **Add user** for each person who may use the app.
   (Sign-ups are not offered in the app; this list plus step 5 is the access control.)
4. Build > **Firestore Database** > Create database > production mode > pick a nearby region (e.g. `asia-south1`).
5. In Firestore, create collection `allow` and one document per person whose **document ID is their email** (any field, e.g. `ok: true`).
6. Firestore > Rules > paste the contents of `firestore.rules` > Publish.
   (or: `npm i -g firebase-tools && firebase login && firebase use <project> && firebase deploy --only firestore:rules`)
7. Project settings > Your apps > Web (`</>`) > register app. Copy `apiKey`, `authDomain`, `projectId`, `appId`.
8. Authentication > Settings > **Authorized domains** > add `<your-github-user>.github.io`.

## 3. Run locally
```
npm install
cp .env.example .env.local      # fill in the four values
npm run dev
```
Sign in with one of the users from step 2.3.

## 4. GitHub Pages
1. Create a GitHub repo and push this folder to branch `main`.
2. Settings > Pages > Source: **GitHub Actions**.
3. Settings > Secrets and variables > Actions > **Variables** > add the four `VITE_FIREBASE_*` values from `.env.example`.
4. Push. The workflow runs the unit tests, the browser tests and the build, then publishes to
   `https://<user>.github.io/<repo>/`. (`vite.config.js` uses `base: './'`, so the repo name needs no config.)

The Firebase web config is not a secret; the rules in step 2.6 are what protect your data.
Never commit a service-account key.

## 5. Safety behaviour (what the app does for you)
- Every edit is saved to the device first, then pushed to the cloud a moment later; a toast confirms each step.
- Offline or failing cloud: nothing is lost, the app says so, and retries.
- Two devices editing: changes are merged record by record, never overwritten. If the same record was changed on both, the cloud copy is kept and you are told.
- First sign-in on a device with local-only entries asks "Add them now" or "Discard".
- Closing the tab with unsynced changes warns you; hiding the tab and signing out both flush first.
- Use Manage > **Export all data** for a JSON backup now and then.

## 6. PDF import
The PDF reader (PDF.js 4.4.168) loads from cdnjs the first time someone uploads a PDF, so that needs internet. PDFs are read in the browser and never uploaded or stored.

## 7. Tests
```
npm test            # 62 unit tests (money, GST, stock, ledgers, balance sheet, PDF out/in, backup, sync)
npm run test:e2e    # browser tests against the production build (needs: npx playwright install chromium)
npm run check       # demo business vs the 10 figures in the notes
```
