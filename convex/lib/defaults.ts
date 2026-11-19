/**
 * Starter content taken from the Coaching Starter Kit and Client Workbook.
 * Tamika can edit services, worksheets, and message templates in the app.
 * Editing a master never changes what was already assigned or agreed.
 */

type Field = {
  key: string;
  label: string;
  type: "short" | "long" | "number" | "choice" | "table";
  help?: string;
  optional?: boolean;
  choices?: string[];
  columns?: string[];
  rows?: string[];
  rowCount?: number;
};

const long = (key: string, label: string, help?: string): Field => ({
  key,
  label,
  type: "long",
  ...(help ? { help } : {}),
});
const short = (key: string, label: string, help?: string): Field => ({
  key,
  label,
  type: "short",
  ...(help ? { help } : {}),
});

export const OFFICE_ADDRESS =
  "RCCG office, 1626 Crawfordville Hwy, Suite D, Crawfordville, FL 32327";

export const DEFAULT_SETTINGS = {
  key: "main" as const,
  coachName: "Tamika Rich",
  businessName: "Tamika Rich Coaching",
  timeZone: "America/New_York",
  responseWindow: "Within two business days",
  supportChannel: "Email",
  discoveryLink:
    "https://schedule.richcoachingandconsulting.com/?host=tamika&type=quick-connect",
  schedulingLink: "https://schedule.richcoachingandconsulting.com/?host=tamika",
  assessmentsLink: "",
  officeAddress: OFFICE_ADDRESS,
  weeklySessionCapacity: 8,
  aiEnabled: false,
};

export const DEFAULT_SERVICES = [
  {
    key: "discovery",
    name: "Discovery Call",
    kind: "discovery" as const,
    priceCents: 0,
    priceNote: "Free",
    sessionsIncluded: 1,
    sessionMinutes: 20,
    supportTerms: "No between-session support.",
    description: "20 minutes to understand the need and assess fit.",
    trackNote: "Need, fit, recommendation, and next contact",
    active: true,
    sort: 1,
  },
  {
    key: "next_step",
    name: "Your Next Step",
    kind: "single" as const,
    priceCents: 19500,
    priceNote: "$195",
    sessionsIncluded: 1,
    sessionMinutes: 90,
    supportTerms: "Short written action plan after the session.",
    description: "One 90-minute working session on one challenge.",
    trackNote: "One challenge and a short written action plan",
    active: true,
    sort: 2,
  },
  {
    key: "structure",
    name: "Start With Structure",
    kind: "package" as const,
    priceCents: 69500,
    priceNote: "$695",
    sessionsIncluded: 4,
    sessionMinutes: 60,
    durationWeeks: 6,
    supportTerms: "One brief email check-in each week.",
    description:
      "Four 60-minute sessions over six weeks, an organization plan, and a weekly email check-in.",
    trackNote:
      "Meetings in weeks 1, 2, 4, and 6; progress between meetings; organization plan",
    active: true,
    sort: 3,
  },
  {
    key: "keep_moving",
    name: "Keep Moving",
    kind: "monthly" as const,
    priceCents: 29500,
    priceNote: "$295 per monthly cycle",
    sessionsIncluded: 2,
    sessionMinutes: 45,
    durationWeeks: 4,
    supportTerms: "One brief email check-in between sessions.",
    description:
      "For continuing clients. Two 45-minute sessions per monthly cycle. Does not bill automatically.",
    trackNote: "Goals, sessions remaining, progress, and renewal decision",
    active: true,
    sort: 4,
  },
  {
    key: "coworking",
    name: "Co-working",
    kind: "coworking" as const,
    priceCents: 2500,
    priceNote: "$25 per person",
    sessionsIncluded: 1,
    sessionMinutes: 120,
    supportTerms: "Group work session. Not private coaching.",
    description: "Two-hour facilitated group work session, virtual or in person.",
    trackNote:
      "Registration, payment, attendance, chosen task, and voluntarily reported progress",
    active: true,
    sort: 5,
  },
];

export function checklistFor(kind: string) {
  const all = [
    { key: "terms", label: "Record the service, scope, dates, and payment arrangement" },
    { key: "agreement", label: "Service agreement completed" },
    { key: "payment", label: "Payment confirmed directly" },
    { key: "booking", label: "Included sessions booked" },
    { key: "folders", label: "Private coach folder and separate client folder created" },
    { key: "intake", label: "Intake assigned" },
    { key: "workbook", label: "First worksheet assigned" },
    { key: "welcome", label: "Welcome message sent" },
    { key: "permissions", label: "Recording, transcript, and AI permissions asked" },
    { key: "prep", label: "Intake reviewed and three questions prepared" },
  ];
  const skip: Record<string, string[]> = {
    single: [],
    package: [],
    monthly: ["intake"],
  };
  const omit = skip[kind] ?? [];
  return all
    .filter((item) => !omit.includes(item.key))
    .map((item) => ({ ...item, done: false }));
}

export const INTAKE_QUESTIONS: Field[] = [
  short("preferred_name", "What name would you like me to use?"),
  { ...short("business", "Business name or idea, if any"), optional: true },
  {
    key: "stage",
    label: "Where are you now?",
    type: "choice",
    choices: ["Starting", "Starting over", "Pivoting"],
  },
  long("outcome", "What would make our work together worthwhile?"),
  long("obstacle", "What is your biggest current obstacle?"),
  long("tried", "What have you already tried?"),
  {
    key: "hours",
    label: "How many hours a week can you realistically protect?",
    type: "number",
  },
  long("resources", "What skills, tools, or relationships can you build on?"),
  long(
    "limits",
    "What resource limits or responsibilities should we plan around?",
    "Share only what is useful.",
  ),
  {
    ...long("preferences", "What communication or accessibility preferences would help?"),
    optional: true,
  },
];

export const CHECKIN_QUESTIONS: Field[] = [
  long("completed", "What did you complete since our last check-in?"),
  long("obstacle", "What is getting in the way or needs to change?"),
  long("next", "What is your next action, and when will you complete it?"),
];

export const MIDPOINT_QUESTIONS: Field[] = [
  long("goal_fit", "Is the original goal still the right goal?"),
  long("evidence", "What evidence shows movement?"),
  long("cost", "What is taking more time or resources than expected?"),
  long("simpler", "What should become simpler for the remaining weeks?"),
];

export const COMPLETION_QUESTIONS: Field[] = [
  long("outcome", "What would make the next 30 days worthwhile?"),
  long("obstacle", "What is your biggest current obstacle?"),
  long("changed", "What changed, and what evidence can you point to?"),
  long("independent", "What can you now do more independently?"),
  long("attention", "What still needs attention?"),
  long("support", "What kind of support, if any, would help you continue?"),
];

export const FEEDBACK_QUESTIONS: Field[] = [
  long("most_useful", "What was most useful?"),
  long("improve", "What could I improve?"),
  long("can_do_now", "What can you do now that was harder before?"),
  { ...long("anything_else", "Is there anything else you want me to know?"), optional: true },
];

export const ASSESSMENT_KINDS = {
  intake: { title: "Client intake", questions: INTAKE_QUESTIONS },
  checkin: { title: "Weekly check-in", questions: CHECKIN_QUESTIONS },
  midpoint: { title: "Midpoint review", questions: MIDPOINT_QUESTIONS },
  completion: { title: "Completion review", questions: COMPLETION_QUESTIONS },
  feedback: { title: "Your feedback", questions: FEEDBACK_QUESTIONS },
} as const;

export const DEFAULT_WORKSHEETS: {
  key: string;
  title: string;
  page: string;
  intro: string;
  fields: Field[];
}[] = [
  {
    key: "starting_point",
    title: "Your starting point",
    page: "2",
    intro: "Short, honest answers are best. “I don’t know yet” is a useful starting point.",
    fields: [
      {
        key: "stage",
        label: "Which fits best?",
        type: "choice",
        choices: ["Starting", "Starting over", "Pivoting"],
      },
      long("toward", "What are you working toward and why does it matter to you?"),
      long("working", "What is working already?"),
      long("unclear", "What feels unclear or difficult right now?"),
      long("worthwhile", "What would make the next six weeks worthwhile?"),
      short("time", "How much time can you realistically protect each week?"),
      long("limits", "What responsibilities or limits should your plan respect?"),
    ],
  },
  {
    key: "strengths",
    title: "Experience and strengths",
    page: "3",
    intro:
      "Your experience may come from work, family responsibilities, volunteering, or community life. Describe real examples. You do not need impressive titles to identify useful skills.",
    fields: [
      long("asked", "What do people regularly ask you to help with?"),
      long("situation", "Describe a situation you helped improve"),
      long("did", "What did you personally do and what changed?"),
      long("skills", "Which skills did you use?"),
      long("serve", "How could those skills help the people you want to serve?"),
    ],
  },
  {
    key: "one_page",
    title: "Your business on one page",
    page: "4",
    intro: "Complete this sentence at the end: I help [who] with [need] through [offer].",
    fields: [
      long("who", "Who do you want to serve? Be specific."),
      long("need", "What problem or need do they have?"),
      long("offer", "What will you offer and what will it include?"),
      long("result", "What useful result will you help them work toward?"),
      long("find", "How will people find you and take the next step?"),
      long("price", "What is your proposed price and what assumptions need testing?"),
      long("description", "Your plain language business description"),
    ],
  },
  {
    key: "keep_change",
    title: "Keep, change, stop, start",
    page: "5",
    intro:
      "Use this page before adding more work. If you are starting for the first time, consider habits and commitments from your current life as well as business ideas.",
    fields: [
      long("keep", "Keep: what is useful and worth continuing?"),
      long("change", "Change: what could work better with an adjustment?"),
      long("stop", "Stop: what is consuming resources without serving your goal?"),
      long("start", "Start: what is missing and deserves a small first step?"),
      long("first", "Which one change will you make first and by when?"),
    ],
  },
  {
    key: "resources",
    title: "Resources you can build on",
    page: "6",
    intro:
      "List what is already available before deciding what to buy or add. Include time, skills, relationships, tools, space, and money you have set aside for this work.",
    fields: [
      {
        key: "inventory",
        label: "What you have and what is missing",
        type: "table",
        columns: ["What I already have", "What is truly missing"],
        rows: [
          "Time",
          "Skills",
          "People and relationships",
          "Tools and workspace",
          "Money available for this work",
        ],
      },
      long("reuse", "What can you reuse, simplify, or do manually?"),
      long("help", "Who could help and what specific request will you make?"),
      long("wait", "What can wait until you have more evidence?"),
      long("decision", "One resource decision and its next step"),
    ],
  },
  {
    key: "spending",
    title: "Spending decisions",
    page: "7",
    intro:
      "A planning worksheet for purchases and subscriptions. Record estimates as estimates. It is not an accounting or tax record. Keep account numbers and passwords out of this page.",
    fields: [
      short("available", "Amount you have chosen to make available and the period it covers"),
      {
        key: "items",
        label: "Purchases you are weighing",
        type: "table",
        columns: ["Item", "Cost", "One time or recurring", "Need now or later", "Decision"],
        rowCount: 4,
      },
      long("problem", "What problem would your next purchase solve?"),
      long("simpler", "Could an existing tool or simpler approach solve it?"),
      long("full_cost", "What will the full cost be over the next three months?"),
      long("evidence", "What evidence would make this purchase worthwhile?"),
      long("decision", "Your decision and the date you will review it"),
    ],
  },
  {
    key: "weekly_rhythm",
    title: "Your weekly business rhythm",
    page: "8",
    intro:
      "Start with the hours you can protect. Include customer work, follow-up, planning, and administration. Leave room for unexpected demands.",
    fields: [
      short("hours", "Available business hours per week"),
      {
        key: "week",
        label: "Your week",
        type: "table",
        columns: ["Protected time", "Main purpose", "Minutes"],
        rows: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Weekend, if chosen"],
      },
      long("focus", "What will you do during your most focused work block?"),
      long("followup", "When will you review messages and follow up with people?"),
      long("boundary", "What boundary will help protect this schedule?"),
      long("minimum", "If the week changes, what is the minimum useful action?"),
    ],
  },
  {
    key: "thirty_day",
    title: "Choose your next 30 days",
    page: "9",
    intro:
      "Choose one main goal. Make it observable and small enough to influence within 30 days. Example: write and use a follow-up checklist for every new inquiry.",
    fields: [
      long("goal", "Your main goal and target date"),
      long("start", "Your starting point today"),
      long("evidence", "What evidence will show progress? Include a target if useful."),
      long("p1", "Priority 1 and why it matters"),
      { ...long("p2", "Priority 2, if needed"), optional: true },
      { ...long("p3", "Priority 3, if needed"), optional: true },
      long("later", "What will you intentionally leave for later?"),
    ],
  },
  {
    key: "action_plan",
    title: "Your action plan",
    page: "10",
    intro:
      "Turn your priorities into actions you can schedule. Each action needs an owner, a date, and a clear definition of finished.",
    fields: [
      short("period", "Goal and planning period"),
      {
        key: "actions",
        label: "Up to three actions",
        type: "table",
        columns: [
          "What will happen and who will do it",
          "Due date and what finished looks like",
          "Likely obstacle and a smaller first step",
        ],
        rows: ["Action 1", "Action 2", "Action 3"],
      },
      short("review", "When will you review this plan with Tamika?"),
    ],
  },
  {
    key: "repeatable",
    title: "Make a task repeatable",
    page: "11",
    intro:
      "Choose one task you do repeatedly, such as responding to an inquiry, preparing an order, or welcoming a client. Write the simplest version another person could follow.",
    fields: [
      short("name", "Process name and the event that starts it"),
      long("owner", "Who is responsible and what do they need?"),
      {
        key: "steps",
        label: "Steps",
        type: "table",
        columns: ["What happens", "How you know it is complete"],
        rows: ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"],
      },
      long("missing", "What should happen if something is missing or delayed?"),
      short("test", "When will you test this process?"),
      long("change", "After testing, what would you change?"),
    ],
  },
  {
    key: "session_prep",
    title: "Prepare for your next session",
    page: "12",
    intro: "Complete this briefly before each meeting. Bring unfinished work as well as progress.",
    fields: [
      short("goal", "Session date and current goal"),
      long("committed", "What did you commit to and what happened?"),
      long("proud", "What progress are you proud of?"),
      long("way", "What is getting in the way or has changed?"),
      long("useful", "What would make this session useful?"),
    ],
  },
  {
    key: "progress_review",
    title: "Review your progress",
    page: "13",
    intro:
      "Compare where you began with where you are now. Use examples and evidence. Progress can include a better decision, a useful routine, or a clearer understanding of what needs to change.",
    fields: [
      long("original", "Your original goal and starting point"),
      long("changed", "What changed and what evidence can you point to?"),
      long("independent", "What can you now do more independently?"),
      long("attention", "What still needs attention?"),
      long("next", "Your next 30-day focus and first action"),
      long("support", "What kind of support, if any, would help you continue?"),
    ],
  },
  {
    key: "coworking_plan",
    title: "Co-working task plan",
    page: "14",
    intro:
      "Bring this page to a co-working session. Choose one task that can move forward in two hours. Share only what you are comfortable discussing in a group, and keep customer information private.",
    fields: [
      long("task", "Your task and what finished will look like today"),
      long("ready", "What do you need ready before the session?"),
      long("block1", "First work block: your smallest useful step"),
      long("midpoint", "Midpoint check: what happened and what needs adjusting?"),
      long("block2", "Second work block: your next step"),
      long("closing", "Closing check: what did you accomplish?"),
      long("next", "What comes next and when will you do it?"),
    ],
  },
];

export const DEFAULT_TEMPLATES = [
  {
    key: "welcome",
    name: "Welcome",
    subject: "Welcome, [Name]",
    body: "Hi [Name], I’m looking forward to working with you. We’ll focus on [goal] through [service and included sessions]. Our first meeting is [date, time and time zone] at [link or location]. Please complete your intake and the first worksheet beforehand. Your materials are here: [client folder]. Our agreed between-session support is [scope, channel and response window]. Please refer to your service agreement for payment and scheduling terms. You do not need perfect answers. Bring what you have, and we’ll work from there.\nTamika",
    sort: 1,
  },
  {
    key: "recap",
    name: "Session recap",
    subject: "Recap of our session",
    body: "Hi [Name], today we focused on [priority]. You decided [decision]. Your next actions are: [action, due date and what finished looks like]. I’ll [Tamika’s agreed follow-up]. Our next meeting is [date, time and time zone]. Let me know if I misunderstood a decision or commitment.\nTamika",
    sort: 2,
  },
  {
    key: "checkin",
    name: "Weekly check-in",
    subject: "Checking in",
    body: "Hi [Name], checking in on [agreed action]. What did you complete? What is getting in the way or needs to change? What is your next step, and when will you take it? A brief reply is fine.\nTamika",
    sort: 3,
  },
  {
    key: "missed",
    name: "Missed meeting",
    subject: "We missed you today",
    body: "Hi [Name], we missed you at today’s meeting. Please let me know whether you would like to arrange another time. We’ll follow the scheduling terms in your agreement. You can reach me at [agreed contact channel].\nTamika",
    sort: 4,
  },
  {
    key: "completion",
    name: "Completion",
    subject: "Wrapping up our work together",
    body: "Hi [Name], over our work together you [specific, supported progress]. Your next 30-day focus is [goal], beginning with [action and date]. Your workbook and final plan are in [folder]. I’d appreciate your honest feedback on what helped and what could improve. If you want continued accountability, we can discuss whether Keep Moving is a good fit.\nTamika",
    sort: 5,
  },
];

export const DISCOVERY_GUIDE = [
  {
    minutes: "0 to 3",
    title: "Open the conversation",
    prompts: [
      "Tell me what prompted you to reach out. Are you starting something, starting over, or changing direction?",
    ],
  },
  {
    minutes: "3 to 10",
    title: "Understand the need",
    prompts: [
      "What are you trying to build, and who is it for?",
      "What feels hardest to organize or decide right now?",
      "What have you already tried? What helped?",
      "What would meaningful progress look like over the next six weeks?",
    ],
  },
  {
    minutes: "10 to 15",
    title: "Check readiness and fit",
    prompts: [
      "How much time can you realistically give this each week?",
      "Are you looking for someone to help you think and follow through, or someone to complete the work for you?",
      "What kind of support helps you act? What constraints should we plan around?",
    ],
  },
  {
    minutes: "15 to 20",
    title: "Recommend one next step",
    prompts: [
      "One contained challenge: Your Next Step.",
      "Several connected organization needs: Start With Structure.",
      "Existing plan with a need for continued accountability: Keep Moving.",
      "A task that mainly needs protected work time: co-working.",
      "Based on what you shared, I recommend [service] because [specific need]. It includes [scope] and costs [price]. Would you like the written details so you can decide?",
    ],
  },
];

export const COWORKING_INSTRUCTIONS =
  "Bring one business task you can work on without needing a lot of teaching, plus the files, device, charger, and materials you need. We will name our tasks, work in two quiet blocks with a short break, and share progress at the end. Please respect privacy, share advice only when invited, and keep customer details private. This session is not recorded.";
