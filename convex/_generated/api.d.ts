/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as actions from "../actions.js";
import type * as ai from "../ai.js";
import type * as assessments from "../assessments.js";
import type * as automation from "../automation.js";
import type * as briefs from "../briefs.js";
import type * as clients from "../clients.js";
import type * as coworking from "../coworking.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as engagements from "../engagements.js";
import type * as feedback from "../feedback.js";
import type * as files from "../files.js";
import type * as lib_agreement from "../lib/agreement.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_automation from "../lib/automation.js";
import type * as lib_balance from "../lib/balance.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_threads from "../lib/threads.js";
import type * as library from "../library.js";
import type * as messages from "../messages.js";
import type * as portal from "../portal.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";
import type * as worksheets from "../worksheets.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  actions: typeof actions;
  ai: typeof ai;
  assessments: typeof assessments;
  automation: typeof automation;
  briefs: typeof briefs;
  clients: typeof clients;
  coworking: typeof coworking;
  crons: typeof crons;
  dashboard: typeof dashboard;
  engagements: typeof engagements;
  feedback: typeof feedback;
  files: typeof files;
  "lib/agreement": typeof lib_agreement;
  "lib/auth": typeof lib_auth;
  "lib/automation": typeof lib_automation;
  "lib/balance": typeof lib_balance;
  "lib/clerk": typeof lib_clerk;
  "lib/defaults": typeof lib_defaults;
  "lib/threads": typeof lib_threads;
  library: typeof library;
  messages: typeof messages;
  portal: typeof portal;
  reports: typeof reports;
  seed: typeof seed;
  sessions: typeof sessions;
  settings: typeof settings;
  users: typeof users;
  worksheets: typeof worksheets;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
