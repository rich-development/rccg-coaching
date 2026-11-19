// Writes convex/_generated/* without needing a Convex deployment.
// `npx convex dev` overwrites these with the official versions, which is fine.
import { readdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = "convex";
const mods = [];
function walk(dir, prefix) {
  for (const f of readdirSync(join(root, dir)).sort()) {
    if (f === "_generated") continue;
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory()) walk(p, prefix + f + "/");
    else if (f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts") && f !== "schema.ts" && f !== "auth.config.ts")
      mods.push(prefix + f.replace(/\.ts$/, ""));
  }
}
walk("", "");
const id = (m) => m.replace(/[\/.]/g, "_");
writeFileSync(join(root, "_generated/api.d.ts"), `/* eslint-disable */
/**
 * Generated \`api\` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`npx convex dev\`.
 * @module
 */

${mods.map((m) => `import type * as ${id(m)} from "../${m}.js";`).join("\n")}

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${mods.map((m) => `  ${JSON.stringify(m)}: typeof ${id(m)};`).join("\n")}
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
`);
writeFileSync(join(root, "_generated/api.js"), `/* eslint-disable */
import { anyApi } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
`);
writeFileSync(join(root, "_generated/dataModel.d.ts"), `/* eslint-disable */
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`);
writeFileSync(join(root, "_generated/server.d.ts"), `/* eslint-disable */
import {
  ActionBuilder,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`);
writeFileSync(join(root, "_generated/server.js"), `/* eslint-disable */
import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;
`);
console.log("generated api for", mods.length, "modules");
