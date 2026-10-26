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
| `newsletter/template` | `{ subject, html, updatedAt, updatedBy }`. Admin read and write. `updatedAt` is `ServerValue.TIMESTAMP` and `updatedBy` is `auth.uid`. |
| `newsletter/campaigns/{id}` | One send run: `{ subject, total, sent, failed, createdAt, createdBy }`. `total` is how many recipients were included. A stopped run can have `sent + failed` less than `total`. A Brevo batch writes the same shape. |
| `newsletter/lists/{listId}` | Named subscriber list: `name`, `createdAt`, `createdBy`, optional `brevoListId`. |
| `newsletter/lists/{listId}/subscribers/{id}` | `email`, `name`, `addedAt`, and after a Brevo batch `sentAt` plus `brevoCampaignId`. A spreadsheet import reads every sheet and writes each new subscriber with its own `set()` (20 at a time) because `addedAt` must be the server timestamp. The Brevo API key is not stored here. |

`users.role` of `ADMIN` is the mobile user role. `adminUsers.role` is only `superadmin` or `admin`.

`receiptReview` is `{ state: "pending" | "approved" | "rejected", reviewedAt, reviewedBy, rejectionReason }`. Approving sets the load to `CREATED`. Rejecting sets it to `CANCELLED`. Both writes are one client `update()` of `loads/{id}/status`, `loads/{id}/receiptReview`, `loads/{id}/updatedAt`, and `notifications/{brokerUid}/{id}` (`from` is the admin uid). Copy is Amharic when `users/{broker}/locale` is `am`.

## Newsletter

The Newsletter page (`/newsletter`) edits `newsletter/template` and sends from the signed-in admin's browser. There is no server, no Cloud Function, and no EmailJS. Choose **Brevo** or **Gmail**. After a Brevo API key is saved in this browser, Brevo is the default. Gmail stays available on the other tab.

The built-in template, used when `newsletter/template` is empty and by **Restore default template**, is a short personal letter: a greeting with `{{name}}`, one paragraph, one email-safe button to `https://direexpress.com.et/`, a sign-off, and a small `{{ unsubscribe }}` line. No images. The button background is `#FE6100` and the label is `#011B3C`, the orange and navy sampled from the Dire Express icon at `https://direexpress.com.et/favicon.ico` (this repo has no favicon file). Above that button is a short highlighted note for freight forwarders, in Amharic and English. A template already saved at `newsletter/template` still overrides this default. When that saved HTML is loaded, previewed, or sent, `ደላሎች` is rewritten to `የጭነት አስተላላፊዎች` (the word is plural in each saved sentence), the same note is inserted once if it is missing, the Pro tip cell is removed in both languages (the `[Tip]` / `[ምክር]` block, the "Pro tip" and "ጠቃሚ ምክር" headings, and the driver-permission text), the button label `የድር መተግበሪያውን ይክፈቱ` is renamed to `ድህረ ገፃችንን ይጎብኙ` (still `https://direexpress.com.et/`), and the Google Group label is renamed to `የጎግል ቡድንን ይቀላቀሉ` (still `https://groups.google.com/g/dire-express`). The stat beside the tip cell stays. The built-in personal letter does not contain the old Amharic button label. The next preview and send already include the update. Save stores that updated HTML back into Realtime Database. On preview and on send, orange buttons, the website link, social links, and the unsubscribe link still pick up `#FE6100`.

SheetJS (`xlsx`) reads `.xlsx`, `.xls`, and `.csv` files in the browser. The email column is a header containing "email", otherwise the first column that contains email addresses. A name column, when present, is the whole trimmed cell, including spaces and commas. `{{name}}` and `{{first_name}}` both use that full name. `{{first_name}}` is only a compatibility alias. When the sheet has no name, both placeholders use the mailbox name (the part before `@`, with `.`, `_`, `+`, and `-` turned into spaces).

Download HTML saves the current template. On the Gmail tab, Copy recipients (BCC) copies the valid addresses, separated by commas.

### Brevo

Direct browser calls to `https://api.brevo.com/v3` work. On 2026-10-26, preflight `OPTIONS` from `https://dire-express-admin.web.app` and from `http://localhost:3001` returned `access-control-allow-origin` set to that origin, and allowed `GET, PUT, DELETE, POST, PATCH, OPTIONS` with headers `api-key`, `content-type`, and `accept`. A real `GET /v3/account` with a bad key returned JSON `{"message":"Key not found","code":"unauthorized"}` plus `access-control-allow-origin: *`. The page calls Brevo with `credentials: "omit"` so that wildcard stays readable. There is no proxy.

The API key is typed into the Newsletter page and stored only at `localStorage["dire-express-admin.brevoApiKey"]`. Sender name, sender email, preview text, batch size, test address, and the Brevo/Gmail choice live in a separate localStorage entry and are not secrets. **Forget key** removes the key. It is not written to Realtime Database, source, or `.env`.

What the admin does in Brevo before the first send:

1. Create a v3 API key: Brevo → SMTP & API → [API keys](https://app.brevo.com/settings/keys/api). Paste the whole key into the Newsletter page on the machine that will send. Each browser keeps its own copy.
2. If the key is limited to authorized IPs, open [Authorized IPs](https://app.brevo.com/security/authorised_ips) and add this browser's public IP, or turn the restriction off. A home or mobile connection changes address. The page shows Brevo's message, including the IP it reported, when the block is an unknown IP.
3. Verify the sender. The defaults are the name **Dawit from Dire Express** and **contact@direexpress.com.et**, both editable. Add that address under Senders, domains & IPs and finish SPF and DKIM for `direexpress.com.et`.
4. The campaign API has no field to disable open or click tracking. Turn those off in Brevo's tracking settings before sending if you do not want them. This page sets `mirrorActive` to false so Brevo does not add a mirror link, and `inlineImageActivation` to false so images are not embedded. It does not send `tag`: campaign tags are a Professional and Enterprise feature, and the free plan answers HTTP 405 `method_not_allowed` ("You are not allowed to avail tag option for your campaign"). A/B testing, send-time optimization, IP warmup, and custom UTM fields are left off for the same reason. `{{ unsubscribe }}` is left in the HTML for Brevo to replace. `{{name}}` is sent as the contact attribute `FIRSTNAME` (the full name). The page creates that attribute when it is missing.
5. The free plan is about **300 emails a day**. Pick a batch size (1–300). **Send now** asks for confirmation and shows the recipient count, how many were already sent, and how many remain. It syncs the chosen Realtime Database list into a Brevo list (contacts imported 100 at a time, list created if needed), then creates a separate batch list with only the next unsent subscribers and sends that campaign. `sentAt` and `brevoCampaignId` are written on those subscribers. Come back the next day for the next batch. **Clear send history** marks them unsent so a later letter can include them again. **Send test to me** sends one test and does not mark the list.

Sent campaigns set `header` and `footer` to `<span></span>`. Leaving those fields out makes Brevo store `[DEFAULT_HEADER]` and `[DEFAULT_FOOTER]`, and an account with no custom header or footer shows that bracket text in the email. An empty string is treated the same as leaving the field out. The plain letter has no square brackets. A dark template already saved in Realtime Database still has editorial labels such as `[Headline]`, `[CTA]`, and `[ርዕስ]`, plus tokens such as `{{year}}` and `{{company_address_am}}`. Those labels are removed and those tokens are filled (the year, the send date, and direexpress.com.et) before the campaign is created. `{{ unsubscribe }}` stays so Brevo can replace it. Outlook conditionals and CSS attribute selectors are left in place.

`npm run deploy` publishes `database.rules.json`. The new `newsletter/lists` node is admin-only, same gate as the rest of `newsletter`. No other rule changed. Deploy the rules before saving a list, or Realtime Database rejects the write.

### Google Cloud setup (project dire-express)

1. Google Cloud console → APIs & Services → Library. Enable the **Gmail API** on project **dire-express**.
2. APIs & Services → OAuth consent screen:
   - User type: **External**
   - Publishing status: **Testing**
   - Add the Gmail account that will send the newsletter as a **test user**. In Testing mode only test users can grant access, and the consent screen can stay unpublished.
   - Scopes: `https://www.googleapis.com/auth/gmail.send` (send mail) and `https://www.googleapis.com/auth/userinfo.email` (so the page can show the sender address).
3. APIs & Services → Credentials → Create credentials → **OAuth client ID** → Application type **Web application**.
   - Authorized JavaScript origins:
     - `https://dire-express-admin.web.app`
     - `http://localhost:3000`
   - `npm run dev` listens on port 3001, so add `http://localhost:3001` as well when you send from the local dashboard.
   - No client secret is used. This site is a static export.
4. Put that client ID in `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`. It is inlined by `npm run build`, so set it before `npm run dev` and before `npm run deploy`.

The page loads `https://accounts.google.com/gsi/client` and requests an access token with `google.accounts.oauth2.initTokenClient`. Each recipient is one `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. The body is `{ raw }`, where `raw` is the base64url RFC 2822 message. Each message has one address in To. Sends are spaced about one every 3–5 seconds, with a small random jitter. If Gmail returns 401, the page requests a new token and retries that recipient. **Send test to me** sends one message to the connected Gmail address and does not write a campaign log.

**Gmail daily limit:** a consumer Gmail account can send about **500 messages a day**. Past that, Gmail rejects further sends until the quota resets. The page warns when a list is over 500. Google Workspace limits are higher, but the same throttle and warning still apply.

### Deliverability

Mail from a consumer Gmail account is easy for filters to treat as bulk mail, and that account has a low daily limit. The durable fix is a custom domain on Google Workspace with SPF, DKIM, and DMARC. Ask recipients to mark a wanted message **Not spam** and add the sender to their contacts.

Each sent message is `multipart/alternative`: a `text/plain` part generated by stripping the HTML to readable text, plus the `text/html` part. Both are UTF-8, encoded as quoted-printable or base64. Headers include `From` with the display name (`Dire Express <sender>`), `Reply-To`, `Date`, a unique `Message-ID` on the sender's domain, `MIME-Version`, `List-Unsubscribe` (`mailto:` to the sender with subject `unsubscribe`), and `List-Unsubscribe-Post`. `{{ unsubscribe }}` is replaced with that mailto link. If the template still has no visible unsubscribe line, one is added in the footer. Script tags and external font links are removed on the way out.

The editor warns about spam triggers: an all-caps subject or `!!!`, an email that is mostly one big image, link shorteners, HTML over about 100 KB (Gmail clips messages that large), and images that are not on https.

`newsletter` is admin-only: `adminUsers/{uid}/active === true` or `admins/{uid} === true`. The parent `settings` node is unchanged. There is no `settings/newsletterEmail` node.

## Rules

Existing mobile checks stay on `admins/{uid} === true`. That includes load writes, settings writes, and reads of a known id. `settings/payment` is publicly readable. An admin with `adminUsers/{uid}/active === true` or `admins/{uid} === true` can write `{ phoneNumber, updatedAt, updatedBy }`. `phoneNumber` is 7–20 characters from digits, spaces, `+`, and `-`.

New **list** reads also require `adminUsers/{uid}/active === true`. They cover `users`, `brokers`, `drivers`, `customers`, `brokerDrivers`, `brokerCustomers`, `loads` (full read, while a broker can still query `orderByChild('brokerId').equalTo(auth.uid)`), `userLoads`, `notifications`, `liveLocations`, `locationHistory`, `admins`, `adminUsers`, and `demoRequests`.

`demoRequests` is not part of the mobile app. Dashboard admins can read and write it. Mark-read sets `readAt`. The public landing page cannot write this node until that page is updated; this app shows rows the import copied.

A user can read `adminUsers/{their uid}` and `admins/{their uid}`. Only an active admin can write `adminUsers`. Nobody can write `admins/{uid}` from the client.

Spark limits that matter here: 1 GB stored, 10 GB downloaded per month, and 100 simultaneous connections. The overview downloads `users`, `brokers`, `loads`, `demoRequests`, and `settings` once per session. Media is base64, so it is about 1.33× the file size.
