import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type Detail = NonNullable<FunctionReturnType<typeof api.clients.get>>;
export type Engagement = Detail["engagements"][number];
