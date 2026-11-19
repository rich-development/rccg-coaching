import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Data model for the Tamika Rich coaching platform.
 *
 * Security notes that shape this schema:
 * - Private coach notes, transcripts, and AI briefs live in their own tables
 *   (sessionNotes, transcripts, aiBriefs). No client-facing function reads them.
 * - Co-working has no transcript table and no link to the transcripts table.
 *   That is on purpose. Do not add one.
 * - An engagement stores a snapshot of the agreed terms, so editing a service
 *   later never changes what an existing client agreed to.
 */

export const stage = v.union(
  v.literal("starting"),
  v.literal("starting_over"),
  v.literal("pivoting"),
);

export const pipelineStage = v.union(
  v.literal("inquiry"),
  v.literal("discovery_booked"),
  v.literal("discovery_done"),
  v.literal("recommended"),
  v.literal("enrolled"),
  v.literal("follow_up_later"),
  v.literal("referred_out"),
  v.literal("not_proceeding"),
  v.literal("alumni"),
);

/** Portal or team access. "none" means access was never given. */
export const accessStatus = v.union(
  v.literal("invited"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("ended"),
);

export const permission = v.union(
  v.literal("not_asked"),
  v.literal("granted"),
  v.literal("declined"),
);

export const paymentStatus = v.union(
  v.literal("unpaid"),
  v.literal("partial"),
  v.literal("paid"),
  v.literal("refunded"),
  v.literal("waived"),
);

export const engagementStatus = v.union(
  v.literal("onboarding"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const sessionStatus = v.union(
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("rescheduled"),
  v.literal("missed"),
  v.literal("cancelled"),
);

export const transcriptStatus = v.union(
  v.literal("not_permitted"),
  v.literal("pending"),
  v.literal("ready"),
  v.literal("unavailable"),
);

export const actionStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("revised"),
  v.literal("dropped"),
);

export const threadStatus = v.union(
  v.literal("needs_reply"),
  v.literal("waiting_on_client"),
  v.literal("resolved"),
);

export const fieldDef = v.object({
  key: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("short"),
    v.literal("long"),
    v.literal("number"),
    v.literal("choice"),
    v.literal("table"),
  ),
  help: v.optional(v.string()),
  optional: v.optional(v.boolean()),
  choices: v.optional(v.array(v.string())),
  columns: v.optional(v.array(v.string())),
  rows: v.optional(v.array(v.string())),
  rowCount: v.optional(v.number()),
});

export const refDef = v.object({
  type: v.union(
    v.literal("session"),
    v.literal("worksheet"),
    v.literal("action"),
    v.literal("assessment"),
  ),
  id: v.string(),
  label: v.string(),
});

export default defineSchema({
  // One row per Clerk sign-in. Email, verification, and the owner flag are
  // written only by users.sync, from Clerk's own records.
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    name: v.optional(v.string()),
    isOwner: v.boolean(),
    syncedAt: v.number(),
    clientId: v.optional(v.id("clients")),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // Team members managed on the Access page. Owners are marked in Clerk.
  members: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("staff")),
    status: accessStatus,
    userId: v.optional(v.id("users")),
    inviteSentAt: v.optional(v.number()),
    accessNote: v.optional(v.string()),
    addedAt: v.number(),
  }).index("by_email", ["email"]),

  // Which permissions each role has. Missing row means the defaults.
  rolePermissions: defineTable({
    role: v.union(v.literal("admin"), v.literal("staff")),
    permissions: v.array(v.string()),
  }).index("by_role", ["role"]),

  settings: defineTable({
    key: v.literal("main"),
    coachName: v.string(),
    businessName: v.string(),
    timeZone: v.string(),
    responseWindow: v.string(),
    supportChannel: v.string(),
    discoveryLink: v.string(),
    schedulingLink: v.string(),
    assessmentsLink: v.string(),
    officeAddress: v.string(),
    weeklySessionCapacity: v.number(),
    aiEnabled: v.boolean(),
  }).index("by_key", ["key"]),

  services: defineTable({
    key: v.string(),
    name: v.string(),
    kind: v.union(
      v.literal("discovery"),
      v.literal("single"),
      v.literal("package"),
      v.literal("monthly"),
      v.literal("coworking"),
    ),
    priceCents: v.number(),
    priceNote: v.string(),
    sessionsIncluded: v.number(),
    sessionMinutes: v.number(),
    durationWeeks: v.optional(v.number()),
    supportTerms: v.string(),
    description: v.string(),
    trackNote: v.string(),
    active: v.boolean(),
    sort: v.number(),
  }).index("by_key", ["key"]),

  clients: defineTable({
    fullName: v.string(),
    preferredName: v.string(),
    email: v.string(), // lowercase
    phone: v.optional(v.string()),
    businessName: v.optional(v.string()),
    businessIdea: v.optional(v.string()),
    stage: v.optional(stage),
    goals: v.optional(v.string()),
    constraints: v.optional(v.string()),
    communicationPrefs: v.optional(v.string()),
    accessibility: v.optional(v.string()),
    source: v.optional(v.string()),
    pipelineStage,
    pipelineChangedAt: v.number(),
    // Discovery record
    discoveryAt: v.optional(v.number()),
    discoveryNeed: v.optional(v.string()),
    discoveryOutcome: v.optional(v.string()),
    discoveryReadiness: v.optional(v.string()),
    hoursPerWeek: v.optional(v.number()),
    recommendedServiceKey: v.optional(v.string()),
    recommendationReason: v.optional(v.string()),
    decisionNote: v.optional(v.string()),
    referralNote: v.optional(v.string()),
    // Coach follow-up reminder (for Tamika, not a measure of the client)
    followUpAction: v.optional(v.string()),
    followUpDate: v.optional(v.string()), // YYYY-MM-DD
    // Folders
    sharedFolderUrl: v.optional(v.string()),
    privateFolderUrl: v.optional(v.string()), // never sent to the portal
    // Portal
    access: v.union(v.literal("none"), accessStatus),
    accessChangedAt: v.optional(v.number()),
    inviteSentAt: v.optional(v.number()),
    accessNote: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    interestedInCoaching: v.optional(v.boolean()),
    archived: v.boolean(),
    createdAt: v.number(),
    enrolledAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_pipeline", ["pipelineStage"])
    .index("by_user", ["userId"]),

  engagements: defineTable({
    clientId: v.id("clients"),
    serviceKey: v.string(),
    // Snapshot of agreed terms
    serviceName: v.string(),
    priceCents: v.number(),
    sessionsIncluded: v.number(),
    sessionMinutes: v.number(),
    supportTerms: v.string(),
    supportChannel: v.string(),
    responseWindow: v.string(),
    scopeNote: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: engagementStatus,
    pausedOn: v.optional(v.string()),
    pauseReason: v.optional(v.string()),
    cycle: v.number(),
    previousEngagementId: v.optional(v.id("engagements")),
    // Payment (confirmed directly; no automatic billing implied)
    paymentArrangement: v.string(),
    paymentStatus,
    amountPaidCents: v.number(),
    paymentLink: v.optional(v.string()),
    paymentVerifiedAt: v.optional(v.number()),
    paymentNote: v.optional(v.string()),
    // Agreement
    agreementStatus: v.union(
      v.literal("not_sent"),
      v.literal("sent"),
      v.literal("signed"),
    ),
    agreementUrl: v.optional(v.string()),
    // Permissions tracked separately
    recordingPermission: permission,
    transcriptionPermission: permission,
    aiPermission: permission,
    permissionsUpdatedAt: v.optional(v.number()),
    // Goal and observable measure
    goal: v.optional(v.string()),
    measureName: v.optional(v.string()),
    measureStart: v.optional(v.string()),
    measureTarget: v.optional(v.string()),
    measureActual: v.optional(v.string()),
    // Onboarding checklist
    checklist: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        done: v.boolean(),
        doneAt: v.optional(v.number()),
      }),
    ),
    // Completion review
    completedOn: v.optional(v.string()),
    startingPoint: v.optional(v.string()),
    currentResult: v.optional(v.string()),
    nowIndependent: v.optional(v.string()),
    next30Plan: v.optional(v.string()),
    supportChoice: v.optional(v.string()),
    renewalDecision: v.optional(
      v.union(
        v.literal("undecided"),
        v.literal("renewing"),
        v.literal("not_renewing"),
      ),
    ),
    createdAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status"]),

  sessions: defineTable({
    clientId: v.id("clients"),
    engagementId: v.id("engagements"),
    number: v.number(),
    scheduledAt: v.number(),
    durationMinutes: v.number(),
    format: v.union(v.literal("virtual"), v.literal("in_person")),
    meetLink: v.optional(v.string()),
    location: v.optional(v.string()),
    status: sessionStatus,
    countsAgainstBalance: v.boolean(),
    statusNote: v.optional(v.string()),
    // Agreed in session, shared with the client
    priority: v.optional(v.string()),
    // Recap: the draft is coach-only, recapShared is what the client sees
    recapDraft: v.optional(v.string()),
    recapShared: v.optional(v.string()),
    recapApprovedAt: v.optional(v.number()),
    transcriptStatus,
    completedAt: v.optional(v.number()),
  })
    .index("by_client", ["clientId", "scheduledAt"])
    .index("by_engagement", ["engagementId", "scheduledAt"])
    .index("by_time", ["scheduledAt"]),

  // PRIVATE: coach-only. Never read by portal functions or staff.
  sessionNotes: defineTable({
    sessionId: v.id("sessions"),
    clientId: v.id("clients"),
    progressSince: v.optional(v.string()),
    outcomeAgreed: v.optional(v.string()),
    questionsAndDecisions: v.optional(v.string()),
    obstacle: v.optional(v.string()),
    coachFollowUp: v.optional(v.string()),
    interpretation: v.optional(v.string()),
    prepQuestions: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"]),

  // PRIVATE: one-on-one coaching sessions only. Coach-only.
  transcripts: defineTable({
    sessionId: v.id("sessions"),
    clientId: v.id("clients"),
    source: v.string(),
    text: v.string(),
    attachedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"]),

  actions: defineTable({
    clientId: v.id("clients"),
    engagementId: v.optional(v.id("engagements")),
    sessionId: v.optional(v.id("sessions")),
    title: v.string(),
    owner: v.union(v.literal("client"), v.literal("coach")),
    // Coach follow-ups can be kept private
    visibleToClient: v.boolean(),
    dueDate: v.optional(v.string()),
    doneLooksLike: v.optional(v.string()),
    obstacle: v.optional(v.string()),
    smallerStep: v.optional(v.string()),
    status: actionStatus,
    evidence: v.optional(v.string()),
    clientNote: v.optional(v.string()),
    revisedFromId: v.optional(v.id("actions")),
    reviewNote: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_client", ["clientId"])
    .index("by_session", ["sessionId"])
    .index("by_status", ["status"]),

  worksheetTemplates: defineTable({
    key: v.string(),
    title: v.string(),
    page: v.string(),
    intro: v.string(),
    fields: v.array(fieldDef),
    active: v.boolean(),
    sort: v.number(),
  }).index("by_key", ["key"]),

  worksheetAssignments: defineTable({
    clientId: v.id("clients"),
    engagementId: v.optional(v.id("engagements")),
    templateKey: v.string(),
    title: v.string(),
    intro: v.string(),
    fields: v.array(fieldDef), // copy of the master at assignment time
    responses: v.record(v.string(), v.string()),
    status: v.union(
      v.literal("assigned"),
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("reviewed"),
    ),
    linkUrl: v.optional(v.string()),
    note: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    coachComment: v.optional(v.string()),
    assignedAt: v.number(),
    submittedAt: v.optional(v.number()),
  }).index("by_client", ["clientId"]),

  assessments: defineTable({
    clientId: v.id("clients"),
    engagementId: v.optional(v.id("engagements")),
    kind: v.union(
      v.literal("intake"),
      v.literal("checkin"),
      v.literal("midpoint"),
      v.literal("completion"),
      v.literal("feedback"),
    ),
    title: v.string(),
    questions: v.array(fieldDef),
    answers: v.record(v.string(), v.string()),
    status: v.union(v.literal("assigned"), v.literal("completed")),
    externalUrl: v.optional(v.string()), // Rich Assessments link
    resultUrl: v.optional(v.string()),
    assignedAt: v.number(),
    completedAt: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
  }).index("by_client", ["clientId", "assignedAt"]),

  threads: defineTable({
    clientId: v.id("clients"),
    status: threadStatus,
    lastMessageAt: v.number(),
    lastFrom: v.union(v.literal("client"), v.literal("coach")),
    unreadForCoach: v.number(),
    unreadForClient: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status", "lastMessageAt"]),

  messages: defineTable({
    threadId: v.id("threads"),
    clientId: v.id("clients"),
    from: v.union(v.literal("client"), v.literal("coach")),
    authorName: v.string(),
    body: v.string(),
    ref: v.optional(refDef),
    createdAt: v.number(),
  }).index("by_thread", ["threadId", "createdAt"]),

  messageTemplates: defineTable({
    key: v.string(),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    sort: v.number(),
  }).index("by_key", ["key"]),

  coworkingSessions: defineTable({
    slug: v.string(),
    title: v.string(),
    startsAt: v.number(),
    timeZone: v.string(),
    durationMinutes: v.number(),
    format: v.union(v.literal("virtual"), v.literal("in_person")),
    location: v.optional(v.string()),
    meetLink: v.optional(v.string()), // shared privately with registrants only
    capacity: v.number(),
    priceCents: v.number(),
    paymentLink: v.optional(v.string()),
    instructions: v.string(),
    cancellationTerms: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("closed"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_time", ["startsAt"]),

  coworkingRegistrations: defineTable({
    sessionId: v.id("coworkingSessions"),
    name: v.string(),
    email: v.string(),
    clientId: v.optional(v.id("clients")),
    status: v.union(
      v.literal("registered"),
      v.literal("waitlist"),
      v.literal("cancelled"),
    ),
    paymentStatus,
    attended: v.optional(v.boolean()),
    chosenTask: v.optional(v.string()),
    reportedProgress: v.optional(v.string()), // only what she expressly reports
    interestedInCoaching: v.optional(v.boolean()),
    registeredAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_email", ["email"]),

  feedback: defineTable({
    clientId: v.id("clients"),
    engagementId: v.optional(v.id("engagements")),
    mostUseful: v.optional(v.string()),
    improve: v.optional(v.string()),
    canDoNow: v.optional(v.string()),
    anythingElse: v.optional(v.string()),
    submittedAt: v.number(),
  }).index("by_client", ["clientId"]),

  // Permission is separate from feedback and tied to an exact quote.
  testimonials: defineTable({
    clientId: v.id("clients"),
    quote: v.string(),
    attribution: v.string(),
    placements: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("requested"),
      v.literal("granted"),
      v.literal("declined"),
    ),
    requestedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_client", ["clientId"]),

  // PRIVATE: coach-only AI drafts. Always reviewed before anything is shared.
  aiBriefs: defineTable({
    clientId: v.id("clients"),
    sessionId: v.id("sessions"),
    kind: v.union(v.literal("prep"), v.literal("recap")),
    content: v.string(),
    sources: v.array(v.string()),
    missing: v.array(v.string()),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),

  activity: defineTable({
    at: v.number(),
    actor: v.string(),
    actorRole: v.string(),
    action: v.string(),
    summary: v.string(),
    clientId: v.optional(v.id("clients")),
    entity: v.optional(v.string()),
  })
    .index("by_time", ["at"])
    .index("by_client", ["clientId", "at"]),
});
