# Dire Express Admin

Desktop dashboard for approving post-trial broker loads and viewing agent referral scores.

The mobile app stores data in the Firebase project **dire-express** (Spark plan). This admin app uses that same **Realtime Database** and **Firebase Authentication**. It does not use Firestore, Cloud Storage, or Cloud Functions.

`database.rules.json` is the mobile app's security rules, unchanged. Indexes live in that file (`.indexOn`). Deploying it does not add Firestore.

## Firebase console setup

1. Authentication → Sign-in method: enable **Email/Password** and **Phone**. Phone OTP is for the mobile app (about 10 SMS/day on Spark). Admin sign-in is email and password.
2. Realtime Database is already at `https://dire-express-default-rtdb.firebaseio.com`. Do not create a Firestore database.
3. No web app is registered yet. From a machine logged into the Firebase CLI:

```bash
firebase apps:create web "Dire Express Admin" --project dire-express
firebase apps:sdkconfig web <APP_ID> --project dire-express
```

4. Copy `.env.example` to `.env`. Fill `NEXT_PUBLIC_FIREBASE_*` from the SDK config and set `AUTH_SECRET`. Those `NEXT_PUBLIC_` values are baked in at `npm run build`, so set them before building as well as before `npm run dev`.
5. Project settings → Service accounts → Generate new private key. Put the JSON in `FIREBASE_SERVICE_ACCOUNT` (or point `FIREBASE_SERVICE_ACCOUNT_PATH` at the file). The running app needs it to verify ID tokens and to read lists the rules do not allow. The import and seed scripts use it to copy Postgres and to write `/admins` and `/settings`. Do not commit the key.
6. Rules are already deployed with the mobile app. The copy in this repo is for reference:

```bash
firebase deploy --only database --project dire-express
```

Only do that if you intend to publish this exact file. It will replace the live rules.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Import Postgres, then seed admins

The import reads the current Postgres database (about 57 users and loads) and writes Realtime Database. It creates Firebase Auth users as `<role>.<uid>@users.direexpress.app`, imports the existing bcrypt password hashes (`auth.importUsers`, algorithm `BCRYPT`), and fills `loginIndex` so the typed email still signs in. Re-running replaces those same records with the Postgres snapshot and does not delete other ids. Counters only move upward.

```bash
npm run db:migrate -- --dry-run
npm run db:migrate
npm run db:seed
```

`db:seed` creates `/settings` (`freeLoadLimit` 3, `basePrice` 50, `pricePerKm` 1) when it is missing, and sets `/admins/{uid}` to `true` for `ADMIN_EMAIL`. It will not turn a broker, driver, or customer into an admin.

Demo admin after seeding: `admin@direexpress.com` / `password123`.

Receipt images and POD files are copied into `media/{mediaId}/meta` and `mediaChunks/{mediaId}/{i}` when the bytes are an allowed image or PDF under 5 MB. Anything else (including SVG) keeps its original URL. The viewer still loads those legacy files from `public/` or the main app's `public/` folder.

## Data model

Document ids for people are Firebase Auth uids (the old Postgres user id). Broker, driver, and customer profiles are not separate ids.

| Path | Contents |
| --- | --- |
| `users/{uid}` | `name`, `phone`, `role`, `email`, `authEmail`, `locale`, `imageUrl`, `createdAt` |
| `brokers/{uid}` | `agentId`, `company`, `referredByEmail`, optional `branding` |
| `drivers/{uid}` | `brokerId`, plate, vehicle, capacity, truck image, `isAvailable` |
| `customers/{uid}` | `brokerId`, `company`, `address` |
| `brokerDrivers/{brokerUid}/{driverUid}` | Directory card (`nameLower`, `phone`, …) |
| `brokerCustomers/{brokerUid}/{customerUid}` | Directory card |
| `agentCodes/{code}` | Broker uid. `code` is 6 digits. |
| `loginIndex/{sha256}/{ROLE}` | `sha256("e:<email>")` or `sha256("p:2519…")` → synthetic auth email |
| `loads/{loadId}` | Load fields, `customerSnap` / `driverSnap`, `receiptReview`, `pod` |
| `userLoads/{uid}/{loadId}` | `broker`, `customer`, `driver`, or `invited` |
| `counters/loadRef` | Last reference sequence |
| `counters/users/{uid}` | Free-tier loads created |
| `counters/devices/{deviceId}` | Per-device free-tier count |
| `notifications/{uid}/{id}` | `type`, `title`, `body`, `read`, `createdAt`, `from`, `loadId` |
| `liveLocations/{uid}` | Latest GPS point (`lat`, `lng`, `at`) |
| `locationHistory/{loadId}/{id}` | GPS history for a load |
| `media/{mediaId}/meta` | `ownerUid`, `kind`, `mime`, `size`, `chunkCount`, `createdAt` |
| `mediaChunks/{mediaId}/{i}` | Base64 chunk, ≤ 256 KB raw |
| `settings` | `freeLoadLimit`, `basePrice`, `pricePerKm` |
| `admins/{uid}` | `true`. Only these accounts can open this dashboard. |
| `demoRequests/{id}` | Landing-page leads (`email`, `source`, `createdAt`, `readAt`). Not in the mobile rules. |

`receiptReview` is `{ state: "pending" \| "approved" \| "rejected", reviewedAt, reviewedBy, rejectionReason }`. Approving sets the load to `CREATED`. Rejecting sets it to `CANCELLED`.

## Why some reads use the Admin SDK

Security rules are not filters. A signed-in admin can read `loads/{id}`, `users/{uid}`, and their own `admins/{uid}` flag, but cannot list `/loads`, `/users`, or `/brokers`. Those parent reads are what the overview, pending queue, and agent scores need.

- **Client SDK (signed-in admin):** sign-in, settings writes, and receipt review. Review is one multi-path `update()` of `loads/{id}/status`, `loads/{id}/receiptReview`, `loads/{id}/updatedAt`, and `notifications/{brokerUid}/{id}` (`from` is the admin uid, Amharic when `users/{broker}/locale` is `am`). The rules accept or reject that write.
- **Admin SDK:** server lists, receipt bytes, demo-request mark-read, the Postgres import, and seeding `/admins` and `/settings`. Demo requests have no client rule (the root is denied), so mark-read cannot be done from the browser. New leads will not appear until the landing page writes `demoRequests` itself; this app only shows rows the import copied.

Spark limits that matter here: 1 GB stored, 10 GB downloaded per month, and 100 simultaneous connections. Media is base64, so it is about 1.33× the file size.
