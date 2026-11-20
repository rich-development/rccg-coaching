/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// A stand-in for Clerk's Backend API. The app asks it who each sign-in is.
type FakeUser = { email: string; verified: boolean; owner?: boolean };
let clerk: Record<string, FakeUser> = {};
let clerkCalls: string[] = [];
const who = (id: string) => ({ subject: id, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${id}` });
const COACH = who("user_coach");
const STAFF = who("user_staff");
const ANA = who("user_ana");
const BEA = who("user_bea");

function fakeClerk(url: string | URL | Request, init?: RequestInit): Response {
  const path = String(url).replace("https://api.clerk.com/v1", "");
  clerkCalls.push(`${init?.method ?? "GET"} ${path}`);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const user = path.match(/^\/users\/(user_\w+)$/);
  if (user) {
    const u = clerk[user[1]];
    if (!u) return json({ errors: [{ code: "resource_not_found" }] }, 404);
    return json({
      id: user[1],
      first_name: u.email.split("@")[0],
      primary_email_address_id: "e1",
      email_addresses: [{ id: "e1", email_address: u.email, verification: { status: u.verified ? "verified" : "unverified" } }],
      public_metadata: u.owner ? { role: "owner" } : {},
    });
  }
  if (path === "/invitations") return json({ id: "inv_1" });
  if (path.startsWith("/sessions?")) return json([{ id: "sess_1" }, { id: "sess_2" }]);
  if (/^\/sessions\/sess_\d\/revoke$/.test(path)) return json({ status: "revoked" });
  return json({}, 500);
}

type Session = { action: (fn: never, args: never) => Promise<unknown>; query: (fn: never, args: never) => Promise<unknown> };
/** Signs in: the app checks with Clerk, then reports the role it gave. */
async function roleOf(session: unknown): Promise<string> {
  const s = session as Session;
  await s.action(api.users.sync as never, {} as never);
  return ((await s.query(api.users.me as never, {} as never)) as { role: string }).role;
}

const SECRET_NOTE = "PRIVATE-NOTE-do-not-leak";
const SECRET_DRAFT = "DRAFT-RECAP-do-not-leak";
const SECRET_TRANSCRIPT = "TRANSCRIPT-do-not-leak";
const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  process.env.CLERK_SECRET_KEY = "sk_test_fake";
  clerkCalls = [];
  clerk = {
    user_coach: { email: "tamika@example.com", verified: true, owner: true },
    user_staff: { email: "helper@example.com", verified: true },
    user_ana: { email: "ana@example.com", verified: true },
    user_bea: { email: "bea@example.com", verified: true },
  };
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => fakeClerk(url, init));
  delete process.env.ANTHROPIC_API_KEY;
});

async function setup() {
  const t = convexTest(schema, modules);
  const coach = t.withIdentity(COACH);
  await coach.action(api.users.sync, {});
  const mk = async (name: string, email: string) => {
    const clientId = await coach.mutation(api.clients.create, { fullName: name, preferredName: name, email });
    await coach.mutation(api.access.setClientAccess, { id: clientId, access: "active" });
    const engagementId = await coach.mutation(api.engagements.create, { clientId, serviceKey: "structure", startDate: TODAY });
    await coach.mutation(api.engagements.setPermissions, { id: engagementId, recordingPermission: "granted", transcriptionPermission: "granted", aiPermission: "granted" });
    const sessionId = await coach.mutation(api.sessions.schedule, { engagementId, scheduledAt: Date.now() - 3600_000, format: "virtual", meetLink: "https://meet.google.com/abc" });
    await coach.mutation(api.sessions.saveNotes, { id: sessionId, obstacle: `${SECRET_NOTE} ${name}` });
    await coach.mutation(api.sessions.saveRecapDraft, { id: sessionId, draft: `${SECRET_DRAFT} ${name}` });
    await coach.mutation(api.sessions.attachTranscript, { id: sessionId, text: `${SECRET_TRANSCRIPT} ${name}` });
    const actionId = await coach.mutation(api.actions.create, { clientId, sessionId, title: `Action for ${name}`, owner: "client", dueDate: TODAY });
    await coach.mutation(api.actions.create, { clientId, sessionId, title: `Hidden coach task for ${name}`, owner: "coach", visibleToClient: false });
    const worksheetId = await coach.mutation(api.worksheets.assign, { clientId, templateKey: "starting_point" });
    const assessmentId = await coach.mutation(api.assessments.assign, { clientId, kind: "checkin" });
    await coach.mutation(api.messages.send, { clientId, body: `Hello ${name}` });
    return { clientId, engagementId, sessionId, actionId, worksheetId, assessmentId };
  };
  const ana = await mk("Ana", "ana@example.com");
  const bea = await mk("Bea", "bea@example.com");
  const asAna = t.withIdentity(ANA);
  const asBea = t.withIdentity(BEA);
  expect(await roleOf(asAna)).toBe("client");
  expect(await roleOf(asBea)).toBe("client");
  return { t, coach, ana, bea, asAna, asBea };
}

describe("sign-in and roles", () => {
  test("nobody signed in can use coach, portal, or report functions", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.clients.list, {})).rejects.toThrow();
    await expect(t.query(api.portal.home, {})).rejects.toThrow();
    await expect(t.query(api.reports.overview, { from: 0, to: Date.now(), today: TODAY })).rejects.toThrow();
    await expect(t.query(api.settings.get, {})).rejects.toThrow();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("sharing the owner email does not make someone an owner", async () => {
    const t = convexTest(schema, modules);
    clerk.user_x = { email: "tamika@example.com", verified: true }; // same email, not marked owner in Clerk
    const fake = t.withIdentity(who("user_x"));
    expect(await roleOf(fake)).toBe("none");
    await expect(fake.query(api.clients.list, {})).rejects.toThrow();
  });

  test("a stranger with no client record gets nothing", async () => {
    const { t } = await setup();
    clerk.user_s = { email: "nobody@example.com", verified: true };
    const stranger = t.withIdentity(who("user_s"));
    expect(await roleOf(stranger)).toBe("none");
    await expect(stranger.query(api.portal.home, {})).rejects.toThrow();
    await expect(stranger.query(api.clients.list, {})).rejects.toThrow();
  });

  test("a client's email must be verified before her portal links", async () => {
    const t = convexTest(schema, modules);
    const coach = t.withIdentity(COACH);
    await coach.action(api.users.sync, {});
    const id = await coach.mutation(api.clients.create, { fullName: "Cee", preferredName: "Cee", email: "cee@example.com" });
    await coach.mutation(api.access.setClientAccess, { id, access: "active" });
    clerk.user_c = { email: "cee@example.com", verified: false };
    const unverified = t.withIdentity(who("user_c"));
    expect(await roleOf(unverified)).toBe("none");
  });

  test("a second sign-in cannot take over a linked client record", async () => {
    const { t, asAna } = await setup();
    clerk.user_ana2 = { email: "ana@example.com", verified: true };
    const imposter = t.withIdentity(who("user_ana2"));
    expect(await roleOf(imposter)).toBe("none");
    await expect(imposter.query(api.portal.home, {})).rejects.toThrow();
    expect((await asAna.query(api.portal.home, {})).preferredName).toBe("Ana");
  });

  test("turning off portal access locks the client out right away", async () => {
    const { coach, ana, asAna } = await setup();
    await coach.mutation(api.access.setClientAccess, { id: ana.clientId, access: "paused" });
    await expect(asAna.query(api.portal.home, {})).rejects.toThrow();
  });
});

describe("client portal isolation", () => {
  test("a client sees only her own shared material, never private notes, drafts, or transcripts", async () => {
    const { asAna } = await setup();
    const everything = JSON.stringify([
      await asAna.query(api.portal.home, {}),
      await asAna.query(api.portal.recaps, {}),
      await asAna.query(api.portal.messages, {}),
    ]);
    expect(everything).toContain("Action for Ana");
    expect(everything).not.toContain("Bea");
    expect(everything).not.toContain(SECRET_NOTE);
    expect(everything).not.toContain(SECRET_DRAFT);
    expect(everything).not.toContain(SECRET_TRANSCRIPT);
    expect(everything).not.toContain("Hidden coach task");
  });

  test("a client cannot open or change another client's records", async () => {
    const { asAna, bea } = await setup();
    expect(await asAna.query(api.portal.worksheet, { id: bea.worksheetId })).toBeNull();
    expect(await asAna.query(api.portal.assessment, { id: bea.assessmentId })).toBeNull();
    await expect(asAna.mutation(api.portal.updateAction, { id: bea.actionId, status: "completed" })).rejects.toThrow();
    await expect(asAna.mutation(api.portal.saveWorksheet, { id: bea.worksheetId, responses: {}, submit: true })).rejects.toThrow();
    await expect(asAna.mutation(api.portal.submitAssessment, { id: bea.assessmentId, answers: { completed: "x", obstacle: "y", next: "z" } })).rejects.toThrow();
  });

  test("a client cannot call any coach function", async () => {
    const { asAna, ana, bea } = await setup();
    await expect(asAna.query(api.clients.list, {})).rejects.toThrow();
    await expect(asAna.query(api.clients.get, { id: bea.clientId })).rejects.toThrow();
    await expect(asAna.query(api.clients.get, { id: ana.clientId })).rejects.toThrow();
    await expect(asAna.query(api.sessions.workspace, { id: ana.sessionId })).rejects.toThrow();
    await expect(asAna.query(api.messages.thread, { clientId: bea.clientId })).rejects.toThrow();
    await expect(asAna.query(api.briefs.prep, { sessionId: ana.sessionId, today: TODAY })).rejects.toThrow();
    await expect(asAna.mutation(api.clients.exportRecord, { id: ana.clientId })).rejects.toThrow();
    await expect(asAna.mutation(api.access.setClientAccess, { id: bea.clientId, access: "active" })).rejects.toThrow();
    await expect(asAna.mutation(api.engagements.recordPayment, { id: ana.engagementId, status: "paid", amountPaidCents: 69500 })).rejects.toThrow();
    await expect(asAna.query(api.dashboard.today, { dayStart: 0, dayEnd: 1, today: TODAY })).rejects.toThrow();
    await expect(asAna.query(api.coworking.list, {})).rejects.toThrow();
    await expect(asAna.mutation(api.access.addMember, { email: "ana@example.com", name: "Ana", role: "admin" })).rejects.toThrow();
  });

  test("a message reference to someone else's record is dropped", async () => {
    const { asAna, bea, coach, ana } = await setup();
    await asAna.mutation(api.portal.sendMessage, { body: "hi", ref: { type: "action", id: bea.actionId, label: "peek" } });
    const thread = await coach.query(api.messages.thread, { clientId: ana.clientId });
    expect(thread!.messages.at(-1)!.ref).toBeUndefined();
  });

  test("a recap reaches the client only after approval, and placeholders block approval", async () => {
    const { coach, ana, asAna } = await setup();
    expect((await asAna.query(api.portal.home, {})).latestRecap).toBeNull();
    await expect(coach.mutation(api.sessions.approveRecap, { id: ana.sessionId, body: "Hi [Name], great work." })).rejects.toThrow();
    await coach.mutation(api.sessions.approveRecap, { id: ana.sessionId, body: "Hi Ana, great work." });
    expect((await asAna.query(api.portal.home, {})).latestRecap!.body).toBe("Hi Ana, great work.");
  });
});

describe("staff limits", () => {
  test("staff can run operations but cannot see private notes, transcripts, drafts, reports, or exports", async () => {
    const { t, coach, ana } = await setup();
    await coach.mutation(api.access.addMember, { email: "helper@example.com", name: "Helper", role: "staff" });
    const staff = t.withIdentity(STAFF);
    expect(await roleOf(staff)).toBe("staff");
    expect((await staff.query(api.clients.list, {})).length).toBe(2);
    const ws = await staff.query(api.sessions.workspace, { id: ana.sessionId });
    const dump = JSON.stringify([ws, await staff.query(api.clients.get, { id: ana.clientId })]);
    expect(dump).not.toContain(SECRET_NOTE);
    expect(dump).not.toContain(SECRET_DRAFT);
    expect(dump).not.toContain(SECRET_TRANSCRIPT);
    await expect(staff.mutation(api.sessions.saveNotes, { id: ana.sessionId, obstacle: "x" })).rejects.toThrow();
    await expect(staff.mutation(api.sessions.approveRecap, { id: ana.sessionId, body: "x" })).rejects.toThrow();
    await expect(staff.query(api.briefs.prep, { sessionId: ana.sessionId, today: TODAY })).rejects.toThrow();
    await expect(staff.query(api.reports.overview, { from: 0, to: Date.now(), today: TODAY })).rejects.toThrow();
    await expect(staff.mutation(api.clients.exportRecord, { id: ana.clientId })).rejects.toThrow();
    await expect(staff.mutation(api.access.setClientAccess, { id: ana.clientId, access: "paused" })).rejects.toThrow();
    await expect(staff.mutation(api.access.addMember, { email: "x@example.com", name: "x", role: "staff" })).rejects.toThrow();
    await coach.mutation(api.access.setMemberStatus, { id: (await coach.query(api.access.overview, {})).members[0]._id, status: "paused" });
    await expect(staff.query(api.clients.list, {})).rejects.toThrow();
  });
});

describe("engagement rules", () => {
  test("session balance: completed and counted misses use a session, reschedules do not", async () => {
    const { coach, ana } = await setup();
    const balance = async () => (await coach.query(api.clients.get, { id: ana.clientId }))!.engagements[0].balance;
    expect(await balance()).toMatchObject({ included: 4, used: 0, scheduled: 1, remaining: 4 });
    await coach.mutation(api.sessions.setStatus, { id: ana.sessionId, status: "completed" });
    expect(await balance()).toMatchObject({ used: 1, remaining: 3 });
    const s2 = await coach.mutation(api.sessions.schedule, { engagementId: ana.engagementId, scheduledAt: Date.now() + 1e6, format: "virtual" });
    await coach.mutation(api.sessions.setStatus, { id: s2, status: "rescheduled" });
    expect(await balance()).toMatchObject({ used: 1, remaining: 3, scheduled: 0 });
    const s3 = await coach.mutation(api.sessions.schedule, { engagementId: ana.engagementId, scheduledAt: Date.now() + 2e6, format: "virtual" });
    await coach.mutation(api.sessions.setStatus, { id: s3, status: "missed", countsAgainstBalance: false });
    expect(await balance()).toMatchObject({ used: 1, remaining: 3 });
    await coach.mutation(api.sessions.setStatus, { id: s3, status: "missed", countsAgainstBalance: true });
    expect(await balance()).toMatchObject({ used: 2, remaining: 2 });
  });

  test("cannot book more sessions than the package includes", async () => {
    const { coach, ana } = await setup();
    for (let i = 0; i < 3; i++) {
      await coach.mutation(api.sessions.schedule, { engagementId: ana.engagementId, scheduledAt: Date.now() + (i + 1) * 1e6, format: "virtual" });
    }
    await expect(coach.mutation(api.sessions.schedule, { engagementId: ana.engagementId, scheduledAt: Date.now() + 9e6, format: "virtual" })).rejects.toThrow();
  });

  test("editing a service does not change an existing client's agreed terms", async () => {
    const { coach, ana } = await setup();
    const svc = (await coach.query(api.library.services, {})).find((s) => s.key === "structure")!;
    await coach.mutation(api.library.saveService, { id: svc._id, name: svc.name, priceCents: 99900, priceNote: "$999", sessionsIncluded: 6, sessionMinutes: 60, durationWeeks: 8, supportTerms: "New terms", description: svc.description, active: true });
    const e = (await coach.query(api.clients.get, { id: ana.clientId }))!.engagements[0];
    expect(e.priceCents).toBe(69500);
    expect(e.sessionsIncluded).toBe(4);
    expect(e.supportTerms).toBe("One brief email check-in each week.");
  });

  test("no more than three client actions per session", async () => {
    const { coach, ana } = await setup();
    await coach.mutation(api.actions.create, { clientId: ana.clientId, sessionId: ana.sessionId, title: "two", owner: "client" });
    await coach.mutation(api.actions.create, { clientId: ana.clientId, sessionId: ana.sessionId, title: "three", owner: "client" });
    await expect(coach.mutation(api.actions.create, { clientId: ana.clientId, sessionId: ana.sessionId, title: "four", owner: "client" })).rejects.toThrow();
  });

  test("the payment step cannot be checked off without a confirmed payment", async () => {
    const { coach, ana } = await setup();
    await expect(coach.mutation(api.engagements.toggleChecklist, { id: ana.engagementId, key: "payment", done: true })).rejects.toThrow();
    await coach.mutation(api.engagements.recordPayment, { id: ana.engagementId, status: "paid", amountPaidCents: 69500 });
    const e = (await coach.query(api.clients.get, { id: ana.clientId }))!.engagements[0];
    expect(e.checklist.find((c) => c.key === "payment")!.done).toBe(true);
  });

  test("links must be http or https", async () => {
    const { coach, ana } = await setup();
    await expect(
      coach.mutation(api.sessions.update, { id: ana.sessionId, scheduledAt: Date.now(), durationMinutes: 60, format: "virtual", meetLink: "javascript:alert(1)" }),
    ).rejects.toThrow();
  });
});

describe("transcripts and AI permissions", () => {
  test("a transcript cannot be attached without transcription permission", async () => {
    const { coach, ana } = await setup();
    await coach.mutation(api.engagements.setPermissions, { id: ana.engagementId, recordingPermission: "granted", transcriptionPermission: "declined", aiPermission: "granted" });
    await expect(coach.mutation(api.sessions.attachTranscript, { id: ana.sessionId, text: "hello" })).rejects.toThrow();
  });

  test("AI context is refused when AI is off or the client has not agreed, and is de-identified when allowed", async () => {
    const { t, coach, ana } = await setup();
    const asCoach = t.withIdentity(COACH);
    const args = { sessionId: ana.sessionId, kind: "recap" as const, today: TODAY };
    await expect(asCoach.query(internal.briefs.aiContext, args)).rejects.toThrow(); // AI off by default
    const s = await coach.query(api.settings.get, {});
    await coach.mutation(api.settings.update, {
      coachName: s.coachName, businessName: s.businessName, timeZone: s.timeZone, responseWindow: s.responseWindow, supportChannel: s.supportChannel,
      discoveryLink: s.discoveryLink, schedulingLink: s.schedulingLink, assessmentsLink: s.assessmentsLink, officeAddress: s.officeAddress,
      weeklySessionCapacity: s.weeklySessionCapacity, aiEnabled: true,
    });
    await coach.mutation(api.sessions.saveNotes, { id: ana.sessionId, questionsAndDecisions: "Ana decided to email ana@example.com customers." });
    const ctxOk = await asCoach.query(internal.briefs.aiContext, args);
    expect(ctxOk.context).not.toContain("Ana");
    expect(ctxOk.context).not.toContain("ana@example.com");
    expect(ctxOk.context).toContain("[Client]");
    expect(ctxOk.context).toContain(SECRET_TRANSCRIPT); // both permissions granted
    await coach.mutation(api.engagements.setPermissions, { id: ana.engagementId, recordingPermission: "granted", transcriptionPermission: "declined", aiPermission: "granted" });
    expect((await asCoach.query(internal.briefs.aiContext, args)).context).not.toContain(SECRET_TRANSCRIPT);
    await coach.mutation(api.engagements.setPermissions, { id: ana.engagementId, recordingPermission: "granted", transcriptionPermission: "granted", aiPermission: "declined" });
    await expect(asCoach.query(internal.briefs.aiContext, args)).rejects.toThrow();
    await expect(asCoach.action(api.ai.draft, args)).rejects.toThrow(); // no API key
  });
});

describe("co-working", () => {
  test("public page hides the meeting link, registration respects capacity, and there is no transcript path", async () => {
    const { t, coach } = await setup();
    const id = await coach.mutation(api.coworking.create, {
      title: "Focus", startsAt: Date.now() + 86400_000, timeZone: "America/New_York", durationMinutes: 120,
      format: "virtual", meetLink: "https://meet.google.com/secret-room", capacity: 1, priceCents: 2500,
    });
    const session = (await coach.query(api.coworking.get, { id }))!.session;
    await expect(t.mutation(api.coworking.publicRegister, { slug: session.slug, name: "Dee", email: "dee@example.com" })).rejects.toThrow(); // still a draft
    expect(await t.query(api.coworking.publicInfo, { slug: session.slug })).toBeNull();
    await coach.mutation(api.coworking.update, {
      id, title: "Focus", startsAt: session.startsAt, timeZone: session.timeZone, durationMinutes: 120,
      format: "virtual", meetLink: "https://meet.google.com/secret-room", capacity: 1, priceCents: 2500, status: "open",
    });
    const info = await t.query(api.coworking.publicInfo, { slug: session.slug });
    expect(JSON.stringify(info)).not.toContain("secret-room");
    const first = await t.mutation(api.coworking.publicRegister, { slug: session.slug, name: "Dee", email: "dee@example.com" });
    expect(first.status).toBe("registered");
    expect(JSON.stringify(first)).not.toContain("secret-room");
    const again = await t.mutation(api.coworking.publicRegister, { slug: session.slug, name: "Dee", email: "DEE@example.com" });
    expect(again.status).toBe("registered");
    const second = await t.mutation(api.coworking.publicRegister, { slug: session.slug, name: "Eve", email: "eve@example.com" });
    expect(second.status).toBe("waitlist");
    const bot = await t.mutation(api.coworking.publicRegister, { slug: session.slug, name: "Bot", email: "bot@example.com", website: "http://spam" });
    expect(bot.status).toBe("registered");
    expect((await coach.query(api.coworking.get, { id }))!.roster.length).toBe(2);
    // Registering never creates a coaching client.
    expect((await coach.query(api.clients.list, {})).some((c) => c.email === "dee@example.com")).toBe(false);
    // Structural check: the transcripts table can only point at one-on-one sessions.
    const fields = schema.tables.transcripts.validator.fields;
    expect(Object.keys(fields).sort()).toEqual(["attachedAt", "clientId", "sessionId", "source", "text"]);
    expect(fields.sessionId.tableName).toBe("sessions");
    expect(Object.keys(schema.tables.coworkingRegistrations.validator.fields)).not.toContain("transcript");
    expect(Object.keys(schema.tables.coworkingSessions.validator.fields)).not.toContain("transcript");
  });
});

describe("first-release acceptance check", () => {
  test("one full coaching cycle without re-entering decisions", async () => {
    const t = convexTest(schema, modules);
    const coach = t.withIdentity(COACH);
    await coach.action(api.users.sync, {});
    const clientId = await coach.mutation(api.clients.create, { fullName: "Ana Lee", preferredName: "Ana", email: "ana@example.com" });
    await coach.mutation(api.access.setClientAccess, { id: clientId, access: "active" });
    const engagementId = await coach.mutation(api.engagements.create, { clientId, serviceKey: "structure", startDate: TODAY, goal: "Hold five customer conversations" });
    // Assign intake
    const intakeId = await coach.mutation(api.assessments.assign, { clientId, kind: "intake", engagementId });
    const ana = t.withIdentity(ANA);
    await ana.action(api.users.sync, {});
    await ana.mutation(api.portal.submitAssessment, {
      id: intakeId,
      answers: { preferred_name: "Ana", stage: "Starting", outcome: "A clear offer", obstacle: "Pricing", tried: "Posting", hours: "5", resources: "Friends", limits: "Evenings" },
    });
    // Prepare for meeting 1
    const s1 = await coach.mutation(api.sessions.schedule, { engagementId, scheduledAt: Date.now() - 7 * 86400_000, format: "virtual", meetLink: "https://meet.google.com/one" });
    const prep1 = await coach.query(api.briefs.prep, { sessionId: s1, today: TODAY });
    expect(prep1.obstacles.some((o) => o.text.includes("Pricing") && o.source.startsWith("Intake"))).toBe(true);
    expect(prep1.questions.length).toBe(3);
    // Coach, agree on action, approve recap
    await coach.mutation(api.sessions.savePriority, { id: s1, priority: "Get clear on the offer" });
    const actionId = await coach.mutation(api.actions.create, { clientId, sessionId: s1, title: "Hold five customer conversations", owner: "client", dueDate: TODAY, doneLooksLike: "Five conversations with notes" });
    await coach.mutation(api.sessions.setStatus, { id: s1, status: "completed" });
    await coach.mutation(api.sessions.approveRecap, { id: s1, body: "Hi Ana, you decided to hold five customer conversations." });
    // Client sees commitments and recap, then sends an update
    const home = await ana.query(api.portal.home, {});
    expect(home.actions.map((a) => a.title)).toEqual(["Hold five customer conversations"]);
    expect(home.latestRecap!.body).toContain("five customer conversations");
    expect(home.engagement!.balance).toMatchObject({ included: 4, used: 1, remaining: 3 });
    await ana.mutation(api.portal.updateAction, { id: actionId, status: "in_progress", clientNote: "Completed two" });
    await ana.mutation(api.portal.sendMessage, { body: "Explaining my offer was difficult." });
    // Prepare for meeting 2: the brief surfaces the plan, the progress, and the message, each with a source
    const s2 = await coach.mutation(api.sessions.schedule, { engagementId, scheduledAt: Date.now() + 3600_000, format: "virtual" });
    const prep2 = await coach.query(api.briefs.prep, { sessionId: s2, today: TODAY });
    expect(prep2.lastPlan[0].text).toContain("five customer conversations");
    expect(prep2.lastPlan[0].source).toContain("Approved recap");
    expect(prep2.commitments[0].title).toBe("Hold five customer conversations");
    expect(prep2.changed.some((c) => c.text.includes("Completed two"))).toBe(true);
    expect(prep2.changed.some((c) => c.text.includes("Explaining my offer was difficult") && c.source.startsWith("Message"))).toBe(true);
    // The morning view knows a reply is owed
    const dash = await coach.query(api.dashboard.today, { dayStart: Date.now() - 3600_000, dayEnd: Date.now() + 86400_000, today: TODAY });
    expect(dash.attention.some((a) => a.kind === "Message")).toBe(true);
    expect(dash.appointments.some((a) => a._id === s2)).toBe(true);
    // Reports and export work
    const report = await coach.query(api.reports.overview, { from: 0, to: Date.now() + 86400_000, today: TODAY });
    expect(report.revenue.byService[0]).toMatchObject({ service: "Start With Structure", count: 1 });
    const exported = await coach.mutation(api.clients.exportRecord, { id: clientId });
    expect(exported.sessions.length).toBe(2);
  });

  test("sample data loads and clears cleanly", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.seed.demo, {})).toContain("Loaded");
    const coach = t.withIdentity(COACH);
    await coach.action(api.users.sync, {});
    expect((await coach.query(api.clients.list, {})).length).toBe(4);
    const renee = (await coach.query(api.clients.list, {})).find((c) => c.preferredName === "Renee")!;
    const detail = (await coach.query(api.clients.get, { id: renee._id }))!;
    const next = detail.sessions.find((s) => s.status === "scheduled")!;
    const prep = await coach.query(api.briefs.prep, { sessionId: next._id, today: TODAY });
    expect(prep.changed.some((c) => c.text.includes("explaining my offer was difficult"))).toBe(true);
    await t.mutation(internal.seed.clearDemo, {});
    expect((await coach.query(api.clients.list, {})).length).toBe(0);
  });
});

describe("access management", () => {
  test("invite, pause, restore, and end a client's access", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(COACH);
    await owner.action(api.users.sync, {});
    const id = await owner.mutation(api.clients.create, { fullName: "Ana Lee", preferredName: "Ana", email: "ana@example.com" });
    const ana = t.withIdentity(ANA);
    // Before any invitation she gets nothing, even with a verified matching email.
    expect(await roleOf(ana)).toBe("none");
    // Invite: only this click sends an email.
    expect(clerkCalls.some((c) => c === "POST /invitations")).toBe(false);
    const invited = await owner.action(api.access.invite, { kind: "client", id, origin: "https://coaching.example.com" });
    expect(invited.note).toContain("Invitation email sent");
    expect(clerkCalls.filter((c) => c === "POST /invitations").length).toBe(1);
    const state = async () => (await owner.query(api.access.overview, {})).clients.find((c) => c._id === id)!;
    expect((await state()).access).toBe("invited");
    expect(await roleOf(ana)).toBe("client");
    expect((await state()).access).toBe("active");
    // Pause: blocked on the very next request, with no new sign-in needed.
    await owner.mutation(api.access.setClientAccess, { id, access: "paused" });
    await expect(ana.query(api.portal.home, {})).rejects.toThrow();
    expect((await ana.query(api.users.me, {}))!.blocked).toBe("paused");
    // Restore.
    await owner.mutation(api.access.setClientAccess, { id, access: "active" });
    expect((await ana.query(api.portal.home, {})).preferredName).toBe("Ana");
    // End: blocked, signed out everywhere in Clerk, record kept.
    const ended = await owner.action(api.access.end, { kind: "client", id });
    expect(ended.note).toContain("2 active sign-ins closed");
    expect(clerkCalls.filter((c) => /^POST \/sessions\/sess_\d\/revoke$/.test(c)).length).toBe(2);
    await expect(ana.query(api.portal.home, {})).rejects.toThrow();
    expect(await roleOf(ana)).toBe("none"); // signing in again does not bring access back
    expect((await ana.query(api.users.me, {}))!.blocked).toBe("ended");
    expect((await owner.query(api.clients.get, { id }))!.client.fullName).toBe("Ana Lee");
  });

  test("permissions follow the role and change right away", async () => {
    const { t, coach: owner, ana } = await setup();
    const memberId = await owner.mutation(api.access.addMember, { email: "helper@example.com", name: "Helper", role: "staff" });
    const staff = t.withIdentity(STAFF);
    expect(await roleOf(staff)).toBe("staff");
    // Default staff: payments yes, private coaching material no.
    await staff.mutation(api.engagements.recordPayment, { id: ana.engagementId, status: "paid", amountPaidCents: 69500 });
    await expect(staff.mutation(api.sessions.saveNotes, { id: ana.sessionId, obstacle: "x" })).rejects.toThrow();
    await owner.mutation(api.access.setRolePermissions, { role: "staff", permissions: ["coaching"] });
    await staff.mutation(api.sessions.saveNotes, { id: ana.sessionId, obstacle: "now allowed" });
    await expect(staff.mutation(api.engagements.recordPayment, { id: ana.engagementId, status: "paid", amountPaidCents: 1 })).rejects.toThrow();
    // Promote to admin: everything, including the Access page.
    await owner.mutation(api.access.setMemberRole, { id: memberId, role: "admin" });
    expect((await staff.query(api.users.me, {}))!.role).toBe("admin");
    expect((await staff.query(api.access.overview, {})).members.length).toBe(1);
    // Pause the team member: locked out at once.
    await owner.mutation(api.access.setMemberStatus, { id: memberId, status: "paused" });
    await expect(staff.query(api.clients.list, {})).rejects.toThrow();
    expect((await staff.query(api.users.me, {}))!.blocked).toBe("paused");
  });

  test("nobody can raise their own access, and only owners manage admins", async () => {
    const { t, coach: owner } = await setup();
    const adminId = await owner.mutation(api.access.addMember, { email: "helper@example.com", name: "Helper", role: "admin" });
    const admin = t.withIdentity(STAFF);
    expect(await roleOf(admin)).toBe("admin");
    // An admin can manage staff and clients...
    const staffId = await admin.mutation(api.access.addMember, { email: "new@example.com", name: "New", role: "staff" });
    await admin.mutation(api.access.setMemberStatus, { id: staffId, status: "paused" });
    // ...but cannot touch herself, other admins, or the admin role.
    await expect(admin.mutation(api.access.setMemberRole, { id: adminId, role: "staff" })).rejects.toThrow();
    await expect(admin.mutation(api.access.setMemberStatus, { id: adminId, status: "paused" })).rejects.toThrow();
    await expect(admin.action(api.access.end, { kind: "member", id: adminId })).rejects.toThrow();
    await expect(admin.mutation(api.access.addMember, { email: "x@example.com", name: "X", role: "admin" })).rejects.toThrow();
    await expect(admin.mutation(api.access.setMemberRole, { id: staffId, role: "admin" })).rejects.toThrow();
    await expect(admin.mutation(api.access.setRolePermissions, { role: "admin", permissions: [] })).rejects.toThrow();
    // An admin without a permission cannot hand it to staff.
    await owner.mutation(api.access.setRolePermissions, { role: "admin", permissions: ["access"] });
    await expect(admin.mutation(api.access.setRolePermissions, { role: "staff", permissions: ["reports"] })).rejects.toThrow();
    // Staff without the access permission cannot open the Access page at all.
    await owner.mutation(api.access.setMemberRole, { id: adminId, role: "staff" });
    await expect(admin.query(api.access.overview, {})).rejects.toThrow();
  });

  test("the owner mark comes only from Clerk and is rechecked", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(COACH);
    expect(await roleOf(owner)).toBe("owner");
    clerk.user_coach.owner = false; // removed in the Clerk dashboard
    expect(await roleOf(owner)).toBe("none");
    await expect(owner.query(api.clients.list, {})).rejects.toThrow();
  });

  test("without the Clerk key nobody is let in, and the reason is reported", async () => {
    delete process.env.CLERK_SECRET_KEY;
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(COACH);
    const result = await owner.action(api.users.sync, {});
    expect(result.ok).toBe(false);
    expect(result.problem).toContain("CLERK_SECRET_KEY");
    expect((await owner.query(api.users.me, {}))!.role).toBe("none");
    await expect(owner.query(api.clients.list, {})).rejects.toThrow();
  });
});

describe("automation that removes admin work", () => {
  test("invite assigns intake, intake fills the record, and the checklist checks itself", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(COACH);
    await owner.action(api.users.sync, {});
    const id = await owner.mutation(api.clients.create, { fullName: "Ana Lee", preferredName: "Ana", email: "ana@example.com" });
    await owner.action(api.access.invite, { kind: "client", id });
    const ana = t.withIdentity(ANA);
    expect(await roleOf(ana)).toBe("client");
    const engagementId = await owner.mutation(api.engagements.create, { clientId: id, serviceKey: "structure", startDate: TODAY });
    const home = await ana.query(api.portal.home, {});
    const intake = home.assessments.find((a) => a.kind === "intake")!;
    expect(home.assessments.filter((a) => a.kind === "intake").length).toBe(1); // not assigned twice
    expect(home.worksheets.map((w) => w.title)).toEqual(["Your starting point"]); // first page, automatically
    await ana.mutation(api.portal.submitAssessment, {
      id: intake._id,
      answers: { preferred_name: "Annie", business: "Lee Bakes", stage: "Pivoting", outcome: "Three wholesale accounts", obstacle: "Pricing", tried: "Markets", hours: "8", resources: "A kitchen", limits: "School pickups at 3" },
    });
    const record = (await owner.query(api.clients.get, { id }))!;
    expect(record.client).toMatchObject({ preferredName: "Annie", businessName: "Lee Bakes", stage: "pivoting", goals: "Three wholesale accounts", hoursPerWeek: 8 });
    expect(record.engagements[0].goal).toBe("Three wholesale accounts");
    // She accepts the agreement and answers consent herself.
    await expect(ana.mutation(api.portal.acceptAgreement, { typedName: "Ana", agreed: true })).rejects.toThrow(); // full name needed
    await expect(ana.mutation(api.portal.acceptAgreement, { typedName: "Ana Lee", agreed: false })).rejects.toThrow();
    await ana.mutation(api.portal.acceptAgreement, { typedName: "Ana Lee", agreed: true });
    await ana.mutation(api.portal.answerConsent, { recording: false, transcription: true, ai: true });
    let e = (await owner.query(api.clients.get, { id }))!.engagements[0];
    expect(e.agreementSignature).toBe("Ana Lee");
    expect(e.agreementAcceptedText).toContain("Start With Structure");
    expect(e).toMatchObject({ recordingPermission: "declined", transcriptionPermission: "declined", aiPermission: "granted" });
    // Remaining steps happen through normal work, not checkboxes.
    await owner.mutation(api.engagements.recordPayment, { id: engagementId, status: "paid", amountPaidCents: 69500 });
    await owner.mutation(api.messages.send, { clientId: id, body: "Welcome, Annie." });
    await owner.mutation(api.assessments.markReviewed, { id: intake._id });
    for (let i = 0; i < 4; i++) await owner.mutation(api.sessions.schedule, { engagementId, scheduledAt: Date.now() + (i + 1) * 86400_000, format: "virtual" });
    e = (await owner.query(api.clients.get, { id }))!.engagements[0];
    expect(e.checklist.filter((c) => !c.done).map((c) => c.key)).toEqual([]);
    expect(e.status).toBe("active");
  });

  test("approving a recap closes the session and queues the next page; check-ins go out on schedule; renew is one click", async () => {
    const { t, coach: owner, ana, asAna } = await setup();
    await owner.mutation(api.sessions.approveRecap, { id: ana.sessionId, body: "Hi Ana, good session." });
    const detail = (await owner.query(api.clients.get, { id: ana.clientId }))!;
    expect(detail.sessions.find((s) => s._id === ana.sessionId)!.status).toBe("completed");
    // The first page is still open, so no second page is stacked on top of it.
    expect(detail.worksheets.filter((w) => w.engagementId === ana.engagementId).length).toBe(1);
    // Daily job: active engagement, started today, so the first check-in is not due yet.
    await t.run(async (ctx) => {
      await ctx.db.patch(ana.engagementId, { status: "active", startDate: new Date(Date.now() - 8 * 86400_000).toISOString().slice(0, 10) });
      const mine = await ctx.db.query("assessments").withIndex("by_client", (q) => q.eq("clientId", ana.clientId)).collect();
      for (const a of mine) if (a.kind === "checkin") await ctx.db.delete(a._id);
    });
    expect(await t.mutation(internal.automation.daily, {})).toBe(1);
    expect(await t.mutation(internal.automation.daily, {})).toBe(0); // not again while one is waiting
    expect((await asAna.query(api.portal.home, {})).assessments.filter((a) => a.kind === "checkin" && a.status === "assigned").length).toBe(1);
    await owner.mutation(api.engagements.setAutomation, { id: ana.engagementId, off: true });
    await t.run(async (ctx) => {
      const mine = await ctx.db.query("assessments").withIndex("by_client", (q) => q.eq("clientId", ana.clientId)).collect();
      for (const a of mine) if (a.kind === "checkin") await ctx.db.delete(a._id);
    });
    expect(await t.mutation(internal.automation.daily, {})).toBe(0); // switched off for her
    const nextId = await owner.mutation(api.engagements.renew, { id: ana.engagementId });
    const after = (await owner.query(api.clients.get, { id: ana.clientId }))!.engagements;
    expect(after.find((x) => x._id === ana.engagementId)!.status).toBe("completed");
    expect(after.find((x) => x._id === nextId)).toMatchObject({ cycle: 2, priceCents: 69500, aiPermission: "granted" });
  });

  test("the public inquiry form only creates an inquiry and never reveals who is on file", async () => {
    const { t, coach: owner } = await setup();
    const first = await t.mutation(api.clients.publicInquiry, { name: "Dee Jones", email: "Dee@Example.com", stage: "starting", message: "I want to open a salon." });
    const repeat = await t.mutation(api.clients.publicInquiry, { name: "Ana Again", email: "ana@example.com", message: "Hello" });
    const bot = await t.mutation(api.clients.publicInquiry, { name: "Bot", email: "bot@example.com", website: "http://spam" });
    expect([first, repeat, bot]).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    const list = await owner.query(api.clients.list, {});
    expect(list.length).toBe(3); // Ana, Bea, and Dee. No duplicate Ana, no bot.
    const dee = list.find((c) => c.email === "dee@example.com")!;
    expect(dee).toMatchObject({ pipelineStage: "inquiry", access: "none" });
    await expect(t.mutation(api.clients.publicInquiry, { name: "X", email: "not-an-email" })).rejects.toThrow();
  });

  test("files: a client sees only her own shared files, never private ones", async () => {
    const { t, coach: owner, ana, bea, asAna, asBea } = await setup();
    const store = () => t.run(async (ctx) => await ctx.storage.store(new Blob(["hello"], { type: "text/plain" })));
    await owner.mutation(api.files.save, { clientId: ana.clientId, storageId: await store(), name: "Shared plan.txt", visibility: "shared" });
    await owner.mutation(api.files.save, { clientId: ana.clientId, storageId: await store(), name: "PRIVATE coach file.txt", visibility: "private" });
    await asAna.mutation(api.portal.saveFile, { storageId: await store(), name: "My price list.txt" });
    expect((await asAna.query(api.portal.files, {})).map((f) => f.name).sort()).toEqual(["My price list.txt", "Shared plan.txt"]);
    expect(await asBea.query(api.portal.files, {})).toEqual([]);
    const mine = await asAna.query(api.portal.files, {});
    // She can remove her own upload but not one Tamika added.
    await expect(asAna.mutation(api.portal.removeFile, { id: mine.find((f) => f.name === "Shared plan.txt")!._id })).rejects.toThrow();
    await asAna.mutation(api.portal.removeFile, { id: mine.find((f) => f.name === "My price list.txt")!._id });
    await expect(asBea.mutation(api.portal.removeFile, { id: mine.find((f) => f.name === "Shared plan.txt")!._id })).rejects.toThrow();
    await expect(asAna.query(api.files.list, { clientId: bea.clientId })).rejects.toThrow();
    // Staff see shared files but not private ones.
    await owner.mutation(api.access.addMember, { email: "helper@example.com", name: "Helper", role: "staff" });
    const staff = t.withIdentity(STAFF);
    expect(await roleOf(staff)).toBe("staff");
    expect((await staff.query(api.files.list, { clientId: ana.clientId })).files.map((f) => f.name)).toEqual(["Shared plan.txt"]);
    await expect(staff.mutation(api.files.save, { clientId: ana.clientId, storageId: await store(), name: "x", visibility: "private" })).rejects.toThrow();
    // Pausing her access cuts off the file list too.
    await owner.mutation(api.access.setClientAccess, { id: ana.clientId, access: "paused" });
    await expect(asAna.query(api.portal.files, {})).rejects.toThrow();
  });

  test("the Library can grow: new service, workbook page, template, and guide", async () => {
    const { coach: owner, ana } = await setup();
    await owner.mutation(api.library.addService, { name: "Finish What You Started", kind: "package", priceCents: 45000, priceNote: "$450", sessionsIncluded: 3, sessionMinutes: 60, durationWeeks: 4, supportTerms: "One email check-in.", description: "Three sessions to finish one project." });
    const svc = (await owner.query(api.library.services, {})).find((s) => s.name === "Finish What You Started")!;
    await owner.mutation(api.library.addWorksheet, { title: "Name your offer", intro: "Short answers.", fields: [{ key: "", label: "What do you sell?", type: "long" }, { key: "", label: "Price", type: "short" }] });
    const page = (await owner.query(api.library.worksheets, {})).find((w) => w.title === "Name your offer")!;
    expect(new Set(page.fields.map((f) => f.key)).size).toBe(2);
    await owner.mutation(api.library.saveServiceAutomation, { id: svc._id, worksheetOrder: [page.key, "not_a_page"], checkinEveryDays: 10 });
    expect((await owner.query(api.library.services, {})).find((s) => s._id === svc._id)!.worksheetOrder).toEqual([page.key]);
    await owner.mutation(api.worksheets.assign, { clientId: ana.clientId, templateKey: page.key });
    await owner.mutation(api.library.addTemplate, { name: "Nudge", subject: "Quick nudge", body: "Hi [Name], how is [agreed action] going?" });
    expect((await owner.query(api.library.templates, {})).some((x) => x.name === "Nudge")).toBe(true);
    expect((await owner.query(api.library.guideList, {})).length).toBe(5);
    await owner.mutation(api.library.saveGuide, { title: "My opening script", body: "Start with one win." });
    await owner.mutation(api.library.saveGuide, { key: "scope", title: "Keeping scope clear", body: "Rewritten." });
    const guides = await owner.query(api.library.guideList, {});
    expect(guides.length).toBe(6);
    expect(guides.find((g) => g.key === "scope")!.body).toBe("Rewritten.");
  });
});
