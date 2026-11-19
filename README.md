# Tamika Rich Coaching Platform

A coaching and client management platform for Tamika's practice: one workspace
for Tamika, one private portal per client, and a public registration page for
co-working sessions.

- **Frontend:** Next.js (App Router), Tailwind CSS
- **Backend:** Convex (database, server functions, real-time updates)
- **Sign-in:** Clerk
- **Hosting:** built for Netlify

## What is in the first release

| Area | What it does |
|---|---|
| Today | Answers two questions each morning: who needs my attention, and what needs to happen next. Every item opens the record where Tamika can act. |
| Clients | One record per person. History carries across packages. Export a full record as JSON. |
| Discovery | Inquiry to decision, with the 20-minute call guide, one recommendation, and a next-contact date. |
| Engagements | Agreed terms saved per client, onboarding checklist, confirmed payments, session balance, pauses, completion review, renewals. |
| Today's Coaching | One screen to prepare, open the Meet link, agree on one priority and up to three actions, keep private notes, attach a permitted transcript, and approve the recap. |
| Preparation brief | Built from the record at no cost. Every line names its source. Optional AI drafting sits on top. |
| Workbook | All 13 workbook pages as masters. Assign one page at a time. Clients save drafts and submit in the portal. |
| Assessments | Intake, weekly check-in, midpoint, completion, feedback. Compare answers to the same question over time. |
| Messages | One private thread per client, a single inbox, statuses, message-to-task, and reviewed templates. |
| Co-working | Sessions, public registration, capacity and waitlist, roster check-in, repeat attendance, coaching interest. No transcript path. |
| Reports | Discovery-to-enrollment, revenue, service uptake, capacity, session outcomes, commitment follow-through, client progress, co-working, retention, reply time. CSV download. |
| Client portal | Her next session and Meet link, commitments, assigned work, approved recaps, messages, session balance, payment link. Nothing else. |

## Setup (about 20 minutes)

Nothing below costs money. Convex, Clerk, and Netlify all have free tiers that
cover this app.

### 1. Install and connect Convex

```bash
npm install
npx convex dev
```

`npx convex dev` signs you in, creates the project, writes
`NEXT_PUBLIC_CONVEX_URL` to `.env.local`, and pushes the backend. It also
regenerates `convex/_generated/`. Commit whatever it changes there.

### 2. Connect Clerk

1. Create a Clerk application (email sign-in is enough).
2. In Clerk, turn on the Convex integration. Copy the **Frontend API URL**.
3. Add the Clerk keys to `.env.local` (see `.env.example`).
4. Tell Convex about Clerk and about Tamika:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR-APP.clerk.accounts.dev
npx convex env set COACH_EMAILS tamika@her-real-email.com
```

`COACH_EMAILS` is what makes someone the coach. It is checked on every request
against a verified email, so nobody can promote themselves from inside the app.
Use a comma to list more than one address. Clerk must require email
verification (it does by default).

### 3. Run it

```bash
npm run dev
```

Sign in with the coach email. The Starter Kit services, workbook pages, and
message templates load on the first coach sign-in.

### 4. Optional: sample data

```bash
npx convex run seed:demo        # load fictional sample clients
npx convex run seed:clearDemo   # remove them
```

Every sample person is made up, labeled "(sample)", and uses an example.com
address. The loader refuses to run if real client records already exist.

### 5. Deploy

On Netlify, set the build command to `npx convex deploy --cmd 'npm run build'`
and add these environment variables: `CONVEX_DEPLOY_KEY` (from the Convex
dashboard), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`. Set `CLERK_JWT_ISSUER_DOMAIN` and
`COACH_EMAILS` on the production Convex deployment too.

### 6. Optional: AI drafting (this one costs money)

AI drafting is off until all of these are true:

```bash
npx convex env set ANTHROPIC_API_KEY sk-ant-...
```

- "Allow AI drafting" is turned on in Settings
- the client has granted AI permission on her engagement
- Tamika clicks the button (it never runs on its own)

Each draft is one API call billed to the Anthropic account behind the key.
Names, business names, emails, and phone numbers are removed before anything is
sent. Without a key, the preparation brief built from the record still works.

## Opening a client's portal

1. Add the client with the email she will sign in with.
2. On her record, turn on portal access.
3. She signs in at the site with that email. Her sign-in links to her record
   the first time, and only if Clerk has verified the email.

## Security model

All access rules live in Convex, in `convex/lib/auth.ts`. The browser is never
trusted.

- **Every function checks who is asking first:** `requireCoach`,
  `requireTeam`, or `requireClient`.
- **Clients can only use `convex/portal.ts`.** Those functions never accept a
  client id. They look up the record that belongs to the signed-in person, and
  they return hand-picked fields.
- **Private material is stored apart.** Session notes, transcripts, and AI
  drafts have their own tables. No portal function reads them. Staff cannot
  read them either.
- **Recaps are drafts until approved.** The client only ever sees the approved
  copy. A recap or message with a `[bracket]` placeholder left in cannot be
  sent.
- **Three separate permissions** per engagement: recording, transcription, AI.
  A transcript cannot be attached without transcription permission. AI cannot
  run without AI permission.
- **Co-working has no transcript path.** There is no table, field, or function
  for one, and AI features never read co-working data.
- **The public registration page** never returns the meeting link or any
  participant's name.
- **Links are validated** as http(s) before they are stored.
- **Activity history** records who did what.
- **No secrets in the repo.** Keys live in `.env.local` (ignored by git), the
  Convex dashboard, and Netlify.

Run the security and acceptance tests any time:

```bash
npm test
```

They cover client-to-client isolation, private notes and transcripts, staff
limits, unverified emails, session balance rules, permission gates, co-working
privacy, and the first-release acceptance check end to end.

## What is linked by hand for now

The brief says to verify integrations before promising automatic sync. In this
release these are links and manual confirmations, and the Today page shows what
still needs a check:

| Tool | Today | Later |
|---|---|---|
| RCCG Scheduling | Book there, then record the session and Meet link here | Sync appointments and statuses |
| Google Meet | Paste the join link. Paste a permitted transcript | Pull links and transcripts automatically |
| Rich Assessments | Link out, or have the client answer in the portal. Record results by hand if needed | Sync assignment and results |
| Stripe | Paste a payment link. Confirm in Stripe, then record it | Webhook-confirmed payment status |
| Email | Templates to copy. No emails are sent by the app | Notification emails with no private details (Resend) |
| Google Drive | Shared and private folder links | Create folders on onboarding |

## Decisions to confirm before enrolling real clients

From the brief. The app supports each choice, but the choices are Tamika's:
payment timing and installments, missed-session and refund rules, unused
sessions, renewal and cancellation terms, contact channel and response window,
and who can access client materials and for how long.

## Project layout

```
app/coach/      Tamika's workspace
app/portal/     Client portal
app/cowork/     Public co-working registration
components/     Shared interface pieces
convex/         Database schema and every server function
convex/lib/     Access control, defaults from the Starter Kit and Workbook
convex/portal.ts            The only functions a client can call
convex/security.test.ts     Security and acceptance tests
scripts/gen-convex-api.mjs  Writes convex/_generated without a deployment
```
