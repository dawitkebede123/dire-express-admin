# Dire Express Admin

Desktop dashboard for approving post-trial broker loads and viewing agent referral scores.

The app is a **static** Next.js export. Firebase Hosting serves `out/`. There is no Next.js server, no API routes, no Cloud Functions, and no App Hosting. The Spark plan can host it.

Every dashboard read and write uses the Firebase JS client as the signed-in admin. Realtime Database security rules allow or reject those calls. The Firebase Admin SDK is used only by the local scripts in `scripts/`.

The project is **dire-express**:

- Auth domain: `dire-express.firebaseapp.com`
- Database: `https://dire-express-default-rtdb.firebaseio.com`

Firestore, Cloud Storage, and Cloud Functions are not used. Media stays in Realtime Database as base64 chunks.

## Firebase console setup

1. Authentication → Sign-in method: enable **Email/Password**. Phone OTP is for the mobile app (about 10 SMS/day on Spark). This dashboard signs in with email and password.
2. Realtime Database is already at the URL above. Do not create a Firestore database.
3. No web app is registered yet. From a machine logged into the Firebase CLI:

```bash
npx firebase login
npx firebase apps:create web "Dire Express Admin" --project dire-express
npx firebase apps:sdkconfig web <APP_ID> --project dire-express
```

4. Copy `.env.example` to `.env`. Fill `NEXT_PUBLIC_FIREBASE_*` from that SDK config. Those values are inlined by `npm run build`, so they must be set before `npm run deploy` as well as before `npm run dev`.
5. Project settings → Service accounts → Generate new private key. Save the JSON outside the repo and set `FIREBASE_SERVICE_ACCOUNT_PATH` to that file. The hosted site never reads it. `npm run db:migrate` and `npm run db:seed` do.

## Deploy

```bash
npm install
npm run deploy
```

`deploy` builds the static export, then runs `firebase deploy --only hosting,database --project dire-express`. Hosting serves `out/` with `trailingSlash`. Database rules are published from `database.rules.json`.

That rules deploy **replaces** the live Realtime Database rules. This file keeps the mobile rules and adds admin list access. Read the diff before the first deploy.

Local UI only (still talks to Firebase from the browser; nothing here is deployed):

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Admin accounts

`admins/{uid}` stays a boolean `true`. The mobile app's rules check that flag, and this repo does not replace it.

`adminUsers/{uid}` sits beside it and holds the dashboard profile:

| Field | Value |
| --- | --- |
| `name` | Display name |
| `email` | Address the person types |
| `phone` | Optional |
| `role` | `superadmin` or `admin` |
| `active` | `true` or `false` |
| `createdAt` | Epoch milliseconds |

Sign-in is Firebase Auth email/password. The app then reads `adminUsers/{uid}` and `admins/{uid}`. The profile must exist with `active === true`, and the flag must be `true`. Otherwise the client signs out and shows `not an admin`. Dashboard routes redirect to `/login` until that check passes.

Only an already-active admin can write `adminUsers`. A user can read their own entry, including when it is inactive. The first profile is created by the seed script (Admin SDK), because the rules will not let someone grant themselves access.

An imported Postgres `ADMIN` user is stored as `adminUsers.role = "admin"`. `npm run db:seed` uses `ADMIN_ROLE` (default `superadmin`) for a new profile and does not downgrade an existing `superadmin` or `admin`. Seeding sets `active` back to `true`.

Deactivating the profile (`active: false`) blocks the new list rules and the dashboard. Per-record mobile rules still honor `admins/{uid} === true` until that flag is cleared. The seed script sets both nodes together. There is no client write on `admins/{uid}`.

## Import Postgres, then seed the first admin

The import reads the current Postgres database (about 57 users and loads) and writes Realtime Database. It creates Firebase Auth users as `<role>.<uid>@users.direexpress.app`, imports the existing bcrypt hashes (`auth.importUsers`, algorithm `BCRYPT`), and fills `loginIndex` so the typed email still resolves. Re-running replaces those same record ids and does not delete other ids. Counters only move upward.

```bash
npm run db:migrate -- --dry-run
npm run db:migrate
npm run db:seed
```

`db:seed` creates `/settings` (`freeLoadLimit` 3, `basePrice` 50, `pricePerKm` 1) when that node is missing. It will not turn a broker, driver, or customer into an admin.

Demo admin after seeding: `admin@direexpress.com` / `password123`.

Receipt images and POD files are copied into `media/{mediaId}/meta` and `mediaChunks/{mediaId}/{i}` when the bytes are an allowed image or PDF under 5 MB. Anything else (including SVG) keeps its original URL. The browser assembles `rtdb-media://` chunks itself. A leftover `/path` is loaded from `NEXT_PUBLIC_MAIN_APP_URL` when that variable was set at build time.

## Data model

Document ids for people are Firebase Auth uids (the old Postgres user id). Broker, driver, and customer profiles are not separate ids.

| Path | Contents |
| --- | --- |
| `users/{uid}` | `name`, `phone`, `role` (`BROKER` \| `DRIVER` \| `CUSTOMER` \| `ADMIN`), `email`, `authEmail`, `locale`, `imageUrl`, `createdAt` |
| `adminUsers/{uid}` | Dashboard profile. See above. Does not replace `admins/{uid}`. |
| `brokers/{uid}` | `agentId`, `company`, `referredByEmail`, optional `branding` |
| `drivers/{uid}` | `brokerId`, plate, vehicle, capacity, truck image, `isAvailable` |
| `customers/{uid}` | `brokerId`, `company`, `address` |
| `brokerDrivers/{brokerUid}/{driverUid}` | Directory card (`nameLower`, `phone`, …) |
| `brokerCustomers/{brokerUid}/{customerUid}` | Directory card |
| `agentCodes/{code}` | Broker uid. `code` is 6 digits. |
| `loginIndex/{sha256}/{ROLE}` | `sha256("e:<email>")` or `sha256("p:2519…")` → auth email. Public per key. |
| `loads/{loadId}` | Load fields, `customerSnap` / `driverSnap`, `receiptReview`, `pod` |
| `userLoads/{uid}/{loadId}` | `broker`, `customer`, `driver`, or `invited` |
| `counters/loadRef` | Last reference sequence |
| `counters/users/{uid}` | Free-tier loads created |
| `counters/devices/{deviceId}` | Per-device free-tier count |
| `notifications/{uid}/{id}` | `type`, `title`, `body`, `read`, `createdAt`, `from`, `loadId` |
| `liveLocations/{uid}` | Latest GPS point (`lat`, `lng`, `at`) |
| `locationHistory/{loadId}/{id}` | GPS history for a load |
| `media/{mediaId}/meta` | `ownerUid`, `kind`, `mime`, `size`, `chunkCount`, `createdAt` |
| `mediaChunks/{mediaId}/{i}` | Base64 chunk, raw size ≤ 261120 bytes |
| `settings` | `freeLoadLimit`, `basePrice`, `pricePerKm` |
| `settings/payment` | `{ phoneNumber, updatedAt, updatedBy }`. Public read. `updatedAt` is `ServerValue.TIMESTAMP`. |
| `admins/{uid}` | `true`. The mobile rules' admin check. |
| `demoRequests/{id}` | Landing-page leads (`email`, `source`, `createdAt`, `readAt`) |

`users.role` of `ADMIN` is the mobile user role. `adminUsers.role` is only `superadmin` or `admin`.

`receiptReview` is `{ state: "pending" | "approved" | "rejected", reviewedAt, reviewedBy, rejectionReason }`. Approving sets the load to `CREATED`. Rejecting sets it to `CANCELLED`. Both writes are one client `update()` of `loads/{id}/status`, `loads/{id}/receiptReview`, `loads/{id}/updatedAt`, and `notifications/{brokerUid}/{id}` (`from` is the admin uid). Copy is Amharic when `users/{broker}/locale` is `am`.

## Rules

Existing mobile checks stay on `admins/{uid} === true`. That includes load writes, settings writes, and reads of a known id. `settings/payment` is publicly readable. An admin with `adminUsers/{uid}/active === true` or `admins/{uid} === true` can write `{ phoneNumber, updatedAt, updatedBy }`. `phoneNumber` is 7–20 characters from digits, spaces, `+`, and `-`.

New **list** reads also require `adminUsers/{uid}/active === true`. They cover `users`, `brokers`, `drivers`, `customers`, `brokerDrivers`, `brokerCustomers`, `loads` (full read, while a broker can still query `orderByChild('brokerId').equalTo(auth.uid)`), `userLoads`, `notifications`, `liveLocations`, `locationHistory`, `admins`, `adminUsers`, and `demoRequests`.

`demoRequests` is not part of the mobile app. Dashboard admins can read and write it. Mark-read sets `readAt`. The public landing page cannot write this node until that page is updated; this app shows rows the import copied.

A user can read `adminUsers/{their uid}` and `admins/{their uid}`. Only an active admin can write `adminUsers`. Nobody can write `admins/{uid}` from the client.

Spark limits that matter here: 1 GB stored, 10 GB downloaded per month, and 100 simultaneous connections. The overview downloads `users`, `brokers`, `loads`, `demoRequests`, and `settings` once per session. Media is base64, so it is about 1.33× the file size.
