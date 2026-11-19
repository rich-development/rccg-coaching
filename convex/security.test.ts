/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const COACH = { subject: "coach1", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|coach1", email: "tamika@example.com", emailVerified: true, name: "Tamika Rich" };
const STAFF = { subject: "staff1", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|staff1", email: "helper@example.com", emailVerified: true, name: "Helper" };
const ANA = { subject: "ana1", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|ana1", email: "ana@example.com", emailVerified: true, name: "Ana" };
const BEA = { subject: "bea1", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|bea1", email: "bea@example.com", emailVerified: true, name: "Bea" };

const SECRET_NOTE = "PRIVATE-NOTE-do-not-leak";
const SECRET_DRAFT = "DRAFT-RECAP-do-not-leak";
const SECRET_TRANSCRIPT = "TRANSCRIPT-do-not-leak";
const TODAY = new Date().toISOString().slice(0, 10);

beforeEach(() => {
  process.env.COACH_EMAILS = "tamika@example.com";
  delete process.env.ANTHROPIC_API_KEY;
});

async function setup() {
  const t = convexTest(schema, modules);
  const coach = t.withIdentity(COACH);
  await coach.mutation(api.users.ensure, {});
  const mk = async (name: string, email: string) => {
    const clientId = await coach.mutation(api.clients.create, { fullName: name, preferredName: name, email });
    await coach.mutation(api.clients.setPortalAccess, { id: clientId, enabled: true });
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
  expect((await asAna.mutation(api.users.ensure, {})).role).toBe("client");
  expect((await asBea.mutation(api.users.ensure, {})).role).toBe("client");
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

  test("an unverified email never gets the coach role", async () => {
    const t = convexTest(schema, modules);
    const fake = t.withIdentity({ ...COACH, subject: "x", tokenIdentifier: "https://clerk.test|x", emailVerified: false });
    expect((await fake.mutation(api.users.ensure, {})).role).toBe("none");
    await expect(fake.query(api.clients.list, {})).rejects.toThrow();
  });

  test("a stranger with no client record gets nothing", async () => {
    const { t } = await setup();
    const stranger = t.withIdentity({ ...ANA, subject: "s", tokenIdentifier: "https://clerk.test|s", email: "nobody@example.com" });
    expect((await stranger.mutation(api.users.ensure, {})).role).toBe("none");
    await expect(stranger.query(api.portal.home, {})).rejects.toThrow();
    await expect(stranger.query(api.clients.list, {})).rejects.toThrow();
  });

  test("a client's email must be verified before her portal links", async () => {
    const t = convexTest(schema, modules);
    const coach = t.withIdentity(COACH);
    await coach.mutation(api.users.ensure, {});
    const id = await coach.mutation(api.clients.create, { fullName: "Cee", preferredName: "Cee", email: "cee@example.com" });
    await coach.mutation(api.clients.setPortalAccess, { id, enabled: true });
    const unverified = t.withIdentity({ subject: "c", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|c", email: "cee@example.com", emailVerified: false });
    expect((await unverified.mutation(api.users.ensure, {})).role).toBe("none");
  });

  test("a second sign-in cannot take over a linked client record", async () => {
    const { t, asAna } = await setup();
    const imposter = t.withIdentity({ ...ANA, subject: "ana2", tokenIdentifier: "https://other.test|ana2" });
    expect((await imposter.mutation(api.users.ensure, {})).role).toBe("none");
    await expect(imposter.query(api.portal.home, {})).rejects.toThrow();
    expect((await asAna.query(api.portal.home, {})).preferredName).toBe("Ana");
  });

  test("turning off portal access locks the client out right away", async () => {
    const { coach, ana, asAna } = await setup();
    await coach.mutation(api.clients.setPortalAccess, { id: ana.clientId, enabled: false });
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
    await expect(asAna.mutation(api.clients.setPortalAccess, { id: bea.clientId, enabled: true })).rejects.toThrow();
    await expect(asAna.mutation(api.engagements.recordPayment, { id: ana.engagementId, status: "paid", amountPaidCents: 69500 })).rejects.toThrow();
    await expect(asAna.query(api.dashboard.today, { dayStart: 0, dayEnd: 1, today: TODAY })).rejects.toThrow();
    await expect(asAna.query(api.coworking.list, {})).rejects.toThrow();
    await expect(asAna.mutation(api.settings.addStaff, { email: "ana@example.com", name: "Ana" })).rejects.toThrow();
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
    await coach.mutation(api.settings.addStaff, { email: STAFF.email, name: "Helper" });
    const staff = t.withIdentity(STAFF);
    expect((await staff.mutation(api.users.ensure, {})).role).toBe("staff");
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
    await expect(staff.mutation(api.clients.setPortalAccess, { id: ana.clientId, enabled: false })).rejects.toThrow();
    await expect(staff.mutation(api.settings.addStaff, { email: "x@example.com", name: "x" })).rejects.toThrow();
    await coach.mutation(api.settings.setStaffActive, { id: (await coach.query(api.settings.team, {}))[0]._id, active: false });
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
    expect(JSON.stringify(fields.sessionId.json)).toContain('"sessions"');
    expect(Object.keys(schema.tables.coworkingRegistrations.validator.fields)).not.toContain("transcript");
    expect(Object.keys(schema.tables.coworkingSessions.validator.fields)).not.toContain("transcript");
  });
});

describe("first-release acceptance check", () => {
  test("one full coaching cycle without re-entering decisions", async () => {
    const t = convexTest(schema, modules);
    const coach = t.withIdentity(COACH);
    await coach.mutation(api.users.ensure, {});
    const clientId = await coach.mutation(api.clients.create, { fullName: "Ana Lee", preferredName: "Ana", email: "ana@example.com" });
    await coach.mutation(api.clients.setPortalAccess, { id: clientId, enabled: true });
    const engagementId = await coach.mutation(api.engagements.create, { clientId, serviceKey: "structure", startDate: TODAY, goal: "Hold five customer conversations" });
    // Assign intake
    const intakeId = await coach.mutation(api.assessments.assign, { clientId, kind: "intake", engagementId });
    const ana = t.withIdentity(ANA);
    await ana.mutation(api.users.ensure, {});
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
