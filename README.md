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
4. Give Convex the same two Clerk values:

```bash
npx convex env set CLERK_FRONTEND_API_URL https://YOUR-APP.clerk.accounts.dev
npx convex env set CLERK_SECRET_KEY sk_test_...
```

5. Mark the owner. In the Clerk dashboard, go to **Users**, click Tamika's
   user (then repeat for yours), scroll down to the **Metadata** section,
   click **Edit** next to **Public**, paste this, and save:

```json
{ "role": "owner" }
```

That is the only access setup outside the app. There are no email lists in
Convex. Because the owner mark lives on the Clerk user, every Convex
deployment that uses this Clerk application recognizes the owner with no
extra step.

Optional: set Clerk's sign-up mode to invitation only, so strangers cannot
create accounts at all. Without it, a stranger can sign up but sees nothing.

### 3. Run it

```bash
npm run dev
```

Sign in as an owner. The Starter Kit services, workbook pages, and message
templates load on the first owner sign-in. If you land on "Your page is not
open yet", open **What the app sees** on that screen. It shows the email
Clerk reported, whether it is verified, whether the owner mark was found, and
the reason access was not given.

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
`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`. Set `CLERK_FRONTEND_API_URL` and
`CLERK_SECRET_KEY` on the production Convex deployment too, plus `SITE_URL`
so invitation links point at the live site.

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

## Managing access

Everything is on the **Access** page (and on each client's record).

| Who | How they get in | Managed where |
|---|---|---|
| Owner | Public metadata `{ "role": "owner" }` on the Clerk user | Clerk dashboard |
| Admin, Staff | Added on the Access page, then invited | In the app |
| Client | Invited from her record or the Access page | In the app |

**Clients:** Send invitation (Clerk emails her, only on that click), Give
access without an email, Pause, Restore, End. Pause blocks her portal on her
next click and keeps everything. End also signs her out everywhere. Her record
is kept either way. Pausing access is separate from pausing an engagement.

**Roles and permissions:** permissions belong to the role. The matrix on the
Access page has six switches: private coaching material, reports and revenue,
payments and agreed terms, export and archive, manage access, settings and
library. Day-to-day work is always included for the team.

**Guardrails:** nobody can change their own access. Only an owner can add,
change, or end an admin, or change what admins can do. An admin cannot give
staff a permission the admin role lacks. Every change is in the history.

## Security model

All access rules live in Convex, in `convex/lib/auth.ts`. The browser is never
trusted.

- **Clerk proves identity. The app asks Clerk directly.** After sign-in,
  `users.sync` calls Clerk's Backend API from the server for the user's
  verified email and owner mark. The only thing read from the sign-in token is
  the Clerk user id, so nothing depends on custom token claims.
- **Every function checks who is asking first:** `requirePermission`,
  `requireTeam`, or `requireClient`. Roles, permissions, and access status
  are read from the database on every request, so changes apply immediately.
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

They cover client-to-client isolation, private notes and transcripts, role
permissions, invite, pause, restore, and end, the guardrails against raising
your own access, unverified emails, session balance rules, consent gates,
co-working privacy, and the first-release acceptance check end to end.

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
convex/lib/     Access control, Clerk server calls, Starter Kit and Workbook defaults
convex/access.ts            Team, roles, permissions, client portal access
convex/portal.ts            The only functions a client can call
convex/security.test.ts     Security and acceptance tests
scripts/gen-convex-api.mjs  Writes convex/_generated without a deployment
```
