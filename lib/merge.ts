import { dateTime, isoLabel } from "@/lib/format";

export type MergeFacts = {
  goal: string | null;
  service: string | null;
  nextAt: number | null;
  nextWhere: string | null;
  support: string | null;
  channel: string;
  priority: string | null;
  clientActions: { title: string; dueDate: string | null; doneLooksLike: string | null }[];
  coachActions: string[];
  coachFirstName: string;
};

const zone = () => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
};

/**
 * Fills the [blanks] in a template from the client's record. Anything the
 * record does not know stays as a highlighted blank for Tamika to fill in.
 */
export function fillTemplate(body: string, name: string, m: MergeFacts): string {
  const actions = m.clientActions.map((a) => `- ${a.title}${a.dueDate ? `, by ${isoLabel(a.dueDate)}` : ""}${a.doneLooksLike ? `. Finished looks like: ${a.doneLooksLike}` : ""}`);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const known: [RegExp, string | null][] = [
    [/\[name\]/gi, name],
    [/\[goal\]/gi, m.goal ? lower(m.goal.replace(/\.$/, "")) : null],
    [/\[service and included sessions\]/gi, m.service],
    [/\[date, time and time zone\]/gi, m.nextAt ? `${dateTime(m.nextAt)} ${zone()}`.trim() : null],
    [/\[link or location\]/gi, m.nextWhere],
    [/\[(client )?folder\]/gi, "the Files section of your portal"],
    [/\[scope, channel and response window\]/gi, m.support ? lower(m.support.replace(/\.$/, "")) : null],
    [/\[agreed contact channel\]/gi, m.channel.toLowerCase()],
    [/\[priority\]/gi, m.priority ? lower(m.priority) : null],
    [/\[agreed action\]/gi, m.clientActions[0] ? lower(m.clientActions[0].title) : null],
    [/\[action, due date and what finished looks like\]/gi, actions.length ? `\n${actions.join("\n")}\n` : null],
    [/\[tamika[’']s agreed follow-up\]/gi, m.coachActions.length ? m.coachActions.map(lower).join(", and ") : null],
  ];
  let out = body;
  for (const [pattern, value] of known) if (value) out = out.replace(pattern, value);
  return out;
}
