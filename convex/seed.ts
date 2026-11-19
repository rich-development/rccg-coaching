import { internalMutation } from "./_generated/server";
import { ensureDefaults } from "./settings";
import { ASSESSMENT_KINDS, COWORKING_INSTRUCTIONS, OFFICE_ADDRESS, checklistFor } from "./lib/defaults";
import { postMessage } from "./lib/threads";

/**
 * Loads FICTIONAL sample data so the app can be explored before real clients
 * are added. Every person here is made up and uses an example.com email.
 *
 *   npx convex run seed:demo      load the samples (only into an empty app)
 *   npx convex run seed:clearDemo remove them again
 *
 * Internal only: it cannot be called from a browser.
 */

const DAY = 86400_000;
const HOUR = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureDefaults(ctx);
    const existing = await ctx.db.query("clients").first();
    if (existing) return "Skipped: this app already has client records.";
    const now = Date.now();
    const at = (days: number, hour = 15) => {
      const d = new Date(now + days * DAY);
      d.setUTCHours(hour, 0, 0, 0);
      return d.getTime();
    };
    const service = async (key: string) =>
      (await ctx.db
        .query("services")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique())!;
    const done = (kind: string, undone: string[] = []) =>
      checklistFor(kind).map((c) => ({ ...c, done: !undone.includes(c.key), doneAt: undone.includes(c.key) ? undefined : now - 20 * DAY }));

    // 1. Renee: the full sample engagement from the acceptance check.
    const structure = await service("structure");
    const renee = await ctx.db.insert("clients", {
      fullName: "Renee Alvarez (sample)",
      preferredName: "Renee",
      email: "renee.sample@example.com",
      businessName: "Second Bloom Florals",
      businessIdea: "Event and subscription flowers for small offices",
      stage: "starting",
      goals: "Land her first three paying office subscriptions",
      constraints: "Works full time. About six hours a week, mostly evenings.",
      communicationPrefs: "Email. Short messages are best.",
      source: "Co-working session",
      pipelineStage: "enrolled",
      pipelineChangedAt: now - 21 * DAY,
      discoveryAt: now - 24 * DAY,
      discoveryNeed: "Has the skill and a few interested contacts, but no clear offer or routine.",
      discoveryOutcome: "A clear offer and a weekly rhythm she can keep.",
      hoursPerWeek: 6,
      recommendedServiceKey: "structure",
      recommendationReason: "Several connected organization needs: offer, pricing, and a weekly routine.",
      portalEnabled: true,
      archived: false,
      createdAt: now - 28 * DAY,
      enrolledAt: now - 21 * DAY,
    });
    const reneeEng = await ctx.db.insert("engagements", {
      clientId: renee,
      serviceKey: "structure",
      serviceName: structure.name,
      priceCents: structure.priceCents,
      sessionsIncluded: 4,
      sessionMinutes: 60,
      supportTerms: structure.supportTerms,
      supportChannel: "Email",
      responseWindow: "Within two business days",
      startDate: iso(now - 14 * DAY),
      endDate: iso(now + 28 * DAY),
      status: "active",
      cycle: 1,
      paymentArrangement: "Two payments of $347.50",
      paymentStatus: "partial",
      amountPaidCents: 34750,
      paymentVerifiedAt: now - 15 * DAY,
      agreementStatus: "signed",
      recordingPermission: "granted",
      transcriptionPermission: "granted",
      aiPermission: "granted",
      goal: "Describe the offer clearly and hold five customer conversations",
      measureName: "Customer conversations held",
      measureStart: "0",
      measureTarget: "5",
      measureActual: "2",
      checklist: done("package"),
      createdAt: now - 21 * DAY,
    });
    const intake = ASSESSMENT_KINDS.intake;
    await ctx.db.insert("assessments", {
      clientId: renee,
      engagementId: reneeEng,
      kind: "intake",
      title: intake.title,
      questions: intake.questions.map((q) => ({ ...q })),
      answers: {
        preferred_name: "Renee",
        business: "Second Bloom Florals",
        stage: "Starting",
        outcome: "I want to stop guessing and know what I am offering and to whom.",
        obstacle: "I freeze when someone asks what I charge.",
        tried: "Posted on social media and did two free arrangements for friends.",
        hours: "6",
        resources: "Ten years arranging flowers for church events. A cousin who manages an office park.",
        limits: "Full-time job and two kids. Evenings only.",
      },
      status: "completed",
      assignedAt: now - 20 * DAY,
      completedAt: now - 18 * DAY,
      reviewedAt: now - 17 * DAY,
    });
    const s1 = await ctx.db.insert("sessions", {
      clientId: renee,
      engagementId: reneeEng,
      number: 1,
      scheduledAt: at(-13),
      durationMinutes: 60,
      format: "virtual",
      meetLink: "https://meet.google.com/sample-one",
      status: "completed",
      countsAgainstBalance: true,
      priority: "Get clear on the offer",
      recapShared:
        "Hi Renee, today we focused on getting clear on your offer. You decided to start with weekly office arrangements for small offices. Your next action is to hold five customer conversations and ask what they would want from a flower subscription. I’ll send you the one-page business worksheet. Let me know if I misunderstood a decision or commitment.\nTamika",
      recapDraft: "",
      recapApprovedAt: now - 13 * DAY + 2 * HOUR,
      transcriptStatus: "unavailable",
      completedAt: at(-13) + HOUR,
    });
    await ctx.db.insert("sessionNotes", {
      sessionId: s1,
      clientId: renee,
      progressSince: "First meeting.",
      outcomeAgreed: "Choose one offer to test.",
      questionsAndDecisions: "Explored who already asks her for help. She chose small offices over weddings.",
      obstacle: "Pricing makes her anxious. She changes the subject when it comes up.",
      interpretation: "My interpretation: she may be underpricing to avoid the conversation.",
      updatedAt: now - 13 * DAY,
    });
    await ctx.db.insert("actions", {
      clientId: renee,
      engagementId: reneeEng,
      sessionId: s1,
      title: "Hold five customer conversations about a flower subscription",
      owner: "client",
      visibleToClient: true,
      dueDate: iso(now - 1 * DAY),
      doneLooksLike: "Five conversations, with notes on what each person wanted",
      status: "in_progress",
      clientNote: "Finished two so far.",
      createdAt: now - 13 * DAY,
    });
    await ctx.db.insert("actions", {
      clientId: renee,
      engagementId: reneeEng,
      sessionId: s1,
      title: "Send Renee the one-page business worksheet",
      owner: "coach",
      visibleToClient: true,
      dueDate: iso(now - 12 * DAY),
      status: "completed",
      completedAt: now - 12 * DAY,
      createdAt: now - 13 * DAY,
    });
    const onePage = (await ctx.db
      .query("worksheetTemplates")
      .withIndex("by_key", (q) => q.eq("key", "one_page"))
      .unique())!;
    await ctx.db.insert("worksheetAssignments", {
      clientId: renee,
      engagementId: reneeEng,
      templateKey: onePage.key,
      title: onePage.title,
      intro: onePage.intro,
      fields: onePage.fields,
      responses: {
        who: "Small offices with 5 to 20 people that want the front desk to look cared for.",
        need: "They want fresh flowers without having to think about it.",
      },
      status: "draft",
      assignedAt: now - 12 * DAY,
    });
    const checkin = ASSESSMENT_KINDS.checkin;
    await ctx.db.insert("assessments", {
      clientId: renee,
      engagementId: reneeEng,
      kind: "checkin",
      title: checkin.title,
      questions: checkin.questions.map((q) => ({ ...q })),
      answers: {
        completed: "Two of the five conversations.",
        obstacle: "I got stuck explaining what the subscription includes.",
        next: "Three more conversations by Friday.",
      },
      status: "completed",
      assignedAt: now - 6 * DAY,
      completedAt: now - 4 * DAY,
    });
    await postMessage(ctx, renee, "coach", "Tamika Rich", "Hi Renee, checking in on your customer conversations. What did you complete? What is getting in the way? A brief reply is fine.\nTamika");
    await postMessage(ctx, renee, "client", "Renee", "I did two. Honestly, explaining my offer was difficult. I kept rambling about flowers and never got to what they would actually get each week.");
    await ctx.db.insert("sessions", {
      clientId: renee,
      engagementId: reneeEng,
      number: 2,
      scheduledAt: at(0, 21),
      durationMinutes: 60,
      format: "virtual",
      meetLink: "https://meet.google.com/sample-two",
      status: "scheduled",
      countsAgainstBalance: true,
      transcriptStatus: "pending",
    });

    // 2. Denise: Keep Moving, near the end of a monthly cycle.
    const keep = await service("keep_moving");
    const denise = await ctx.db.insert("clients", {
      fullName: "Denise Okafor (sample)",
      preferredName: "Denise",
      email: "denise.sample@example.com",
      businessName: "Okafor Bookkeeping",
      stage: "pivoting",
      goals: "Move from hourly clients to three monthly retainers",
      source: "Referral",
      pipelineStage: "enrolled",
      pipelineChangedAt: now - 80 * DAY,
      discoveryAt: now - 85 * DAY,
      recommendedServiceKey: "structure",
      followUpAction: "Ask Denise about renewing for next month",
      followUpDate: iso(now + 1 * DAY),
      portalEnabled: false,
      archived: false,
      createdAt: now - 90 * DAY,
      enrolledAt: now - 80 * DAY,
    });
    const deniseFirst = await ctx.db.insert("engagements", {
      clientId: denise,
      serviceKey: "structure",
      serviceName: structure.name,
      priceCents: 69500,
      sessionsIncluded: 4,
      sessionMinutes: 60,
      supportTerms: structure.supportTerms,
      supportChannel: "Email",
      responseWindow: "Within two business days",
      startDate: iso(now - 78 * DAY),
      endDate: iso(now - 36 * DAY),
      status: "completed",
      cycle: 1,
      paymentArrangement: "Paid in full",
      paymentStatus: "paid",
      amountPaidCents: 69500,
      paymentVerifiedAt: now - 79 * DAY,
      agreementStatus: "signed",
      recordingPermission: "declined",
      transcriptionPermission: "declined",
      aiPermission: "declined",
      goal: "Write and use a client onboarding checklist",
      measureName: "New clients onboarded with the checklist",
      measureStart: "0",
      measureTarget: "3",
      measureActual: "3",
      checklist: done("package"),
      completedOn: iso(now - 36 * DAY),
      startingPoint: "Every new client was handled differently.",
      currentResult: "One written checklist, used three times.",
      nowIndependent: "Can onboard a client without rebuilding the steps.",
      next30Plan: "Offer a monthly retainer to two existing hourly clients.",
      renewalDecision: "renewing",
      createdAt: now - 80 * DAY,
    });
    for (let i = 0; i < 4; i++) {
      await ctx.db.insert("sessions", {
        clientId: denise,
        engagementId: deniseFirst,
        number: i + 1,
        scheduledAt: at(-77 + [0, 7, 21, 35][i]),
        durationMinutes: 60,
        format: "virtual",
        status: "completed",
        countsAgainstBalance: true,
        priority: ["Clarify the starting point", "Choose priorities", "Make onboarding repeatable", "Review progress"][i],
        recapShared: "Sample recap.",
        recapApprovedAt: at(-77 + [0, 7, 21, 35][i]) + HOUR,
        transcriptStatus: "not_permitted",
        completedAt: at(-77 + [0, 7, 21, 35][i]) + HOUR,
      });
    }
    const deniseKeep = await ctx.db.insert("engagements", {
      clientId: denise,
      serviceKey: "keep_moving",
      serviceName: keep.name,
      priceCents: 29500,
      sessionsIncluded: 2,
      sessionMinutes: 45,
      supportTerms: keep.supportTerms,
      supportChannel: "Email",
      responseWindow: "Within two business days",
      startDate: iso(now - 24 * DAY),
      endDate: iso(now + 4 * DAY),
      status: "active",
      cycle: 1,
      previousEngagementId: deniseFirst,
      paymentArrangement: "Paid at the start of each monthly cycle. No automatic billing.",
      paymentStatus: "paid",
      amountPaidCents: 29500,
      paymentVerifiedAt: now - 24 * DAY,
      agreementStatus: "signed",
      recordingPermission: "declined",
      transcriptionPermission: "declined",
      aiPermission: "declined",
      goal: "Offer a monthly retainer to two existing hourly clients",
      measureName: "Retainer offers made",
      measureStart: "0",
      measureTarget: "2",
      measureActual: "1",
      checklist: done("monthly"),
      createdAt: now - 25 * DAY,
    });
    await ctx.db.insert("sessions", {
      clientId: denise,
      engagementId: deniseKeep,
      number: 1,
      scheduledAt: at(-20),
      durationMinutes: 45,
      format: "virtual",
      status: "completed",
      countsAgainstBalance: true,
      priority: "Draft the retainer offer",
      transcriptStatus: "not_permitted",
      completedAt: at(-20) + HOUR,
    });
    await ctx.db.insert("sessions", {
      clientId: denise,
      engagementId: deniseKeep,
      number: 2,
      scheduledAt: at(2, 17),
      durationMinutes: 45,
      format: "virtual",
      meetLink: "https://meet.google.com/sample-three",
      status: "scheduled",
      countsAgainstBalance: true,
      transcriptStatus: "not_permitted",
    });
    await ctx.db.insert("actions", {
      clientId: denise,
      engagementId: deniseKeep,
      title: "Send the retainer offer to the second client",
      owner: "client",
      visibleToClient: true,
      dueDate: iso(now + 1 * DAY),
      doneLooksLike: "Offer emailed with price and start date",
      status: "open",
      createdAt: now - 20 * DAY,
    });

    // 3. Pipeline: one new inquiry, one discovery done with a recommendation.
    await ctx.db.insert("clients", {
      fullName: "Carla Mendez (sample)",
      preferredName: "Carla",
      email: "carla.sample@example.com",
      businessIdea: "Mobile notary service",
      stage: "starting_over",
      source: "Instagram",
      pipelineStage: "inquiry",
      pipelineChangedAt: now - 2 * DAY,
      followUpAction: "Invite Carla to book a discovery call",
      followUpDate: iso(now),
      portalEnabled: false,
      archived: false,
      createdAt: now - 2 * DAY,
    });
    await ctx.db.insert("clients", {
      fullName: "Joy Whitaker (sample)",
      preferredName: "Joy",
      email: "joy.sample@example.com",
      businessName: "Whitaker Home Organizing",
      stage: "starting",
      source: "Referral",
      pipelineStage: "recommended",
      pipelineChangedAt: now - 3 * DAY,
      discoveryAt: now - 3 * DAY,
      discoveryNeed: "Wants help pricing one package before a home show next month.",
      discoveryOutcome: "A priced package she can say out loud.",
      hoursPerWeek: 4,
      recommendedServiceKey: "next_step",
      recommendationReason: "One contained challenge.",
      followUpAction: "Send Joy the written details for Your Next Step",
      followUpDate: iso(now - 1 * DAY),
      portalEnabled: false,
      archived: false,
      createdAt: now - 9 * DAY,
    });

    // 4. Co-working: one past session with attendance, one open for registration.
    const past = await ctx.db.insert("coworkingSessions", {
      slug: "sample-co-working-past",
      title: "Saturday co-working (sample)",
      startsAt: at(-10, 14),
      timeZone: "America/New_York",
      durationMinutes: 120,
      format: "in_person",
      location: OFFICE_ADDRESS,
      capacity: 8,
      priceCents: 2500,
      instructions: COWORKING_INSTRUCTIONS,
      status: "completed",
      createdAt: now - 30 * DAY,
    });
    const people: [string, string, boolean, string, boolean][] = [
      ["Renee Alvarez (sample)", "renee.sample@example.com", true, "Price list draft", false],
      ["Tasha Greene (sample)", "tasha.sample@example.com", true, "Set up a booking page", true],
      ["Monique Bell (sample)", "monique.sample@example.com", false, "", false],
    ];
    for (const [name, email, attended, task, interested] of people) {
      await ctx.db.insert("coworkingRegistrations", {
        sessionId: past,
        name,
        email,
        status: "registered",
        paymentStatus: "paid",
        attended,
        chosenTask: task || undefined,
        reportedProgress: attended ? "Finished a first draft" : undefined,
        interestedInCoaching: interested,
        registeredAt: now - 20 * DAY,
      });
    }
    const upcoming = await ctx.db.insert("coworkingSessions", {
      slug: "sample-co-working-next",
      title: "Virtual co-working (sample)",
      startsAt: at(9, 23),
      timeZone: "America/New_York",
      durationMinutes: 120,
      format: "virtual",
      meetLink: "https://meet.google.com/sample-group",
      capacity: 8,
      priceCents: 2500,
      instructions: COWORKING_INSTRUCTIONS,
      status: "open",
      createdAt: now - 3 * DAY,
    });
    await ctx.db.insert("coworkingRegistrations", {
      sessionId: upcoming,
      name: "Tasha Greene (sample)",
      email: "tasha.sample@example.com",
      status: "registered",
      paymentStatus: "unpaid",
      registeredAt: now - 1 * DAY,
    });
    return "Loaded fictional sample data.";
  },
});

/** Removes every record tied to the sample people, and nothing else. */
export const clearDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const clients = (await ctx.db.query("clients").collect()).filter((c) => c.email.endsWith(".sample@example.com"));
    const tables = ["engagements", "actions", "worksheetAssignments", "feedback", "testimonials", "sessionNotes", "transcripts"] as const;
    for (const c of clients) {
      for (const table of tables) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_client", (q) => q.eq("clientId", c._id))
          .collect();
        for (const r of rows) await ctx.db.delete(r._id);
      }
      for (const s of await ctx.db.query("sessions").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) {
        for (const b of await ctx.db.query("aiBriefs").withIndex("by_session", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(b._id);
        await ctx.db.delete(s._id);
      }
      for (const a of await ctx.db.query("assessments").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) await ctx.db.delete(a._id);
      for (const t of await ctx.db.query("threads").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) {
        for (const m of await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadId", t._id)).collect()) await ctx.db.delete(m._id);
        await ctx.db.delete(t._id);
      }
      for (const a of await ctx.db.query("activity").withIndex("by_client", (q) => q.eq("clientId", c._id)).collect()) await ctx.db.delete(a._id);
      await ctx.db.delete(c._id);
    }
    for (const s of await ctx.db.query("coworkingSessions").collect()) {
      if (!s.slug.startsWith("sample-co-working")) continue;
      for (const r of await ctx.db.query("coworkingRegistrations").withIndex("by_session", (q) => q.eq("sessionId", s._id)).collect()) await ctx.db.delete(r._id);
      await ctx.db.delete(s._id);
    }
    return `Removed ${clients.length} sample clients and the sample co-working sessions.`;
  },
});
