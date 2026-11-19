export const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 });

export const dateTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const timeOnly = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "2026-11-19" -> "Nov 19" */
export function isoLabel(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Today's date in the viewer's own time zone, as YYYY-MM-DD. */
export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { dayStart: start.getTime(), dayEnd: end.getTime(), today: todayIso() };
}

/** For <input type="datetime-local"> */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value: string) => new Date(value).getTime();

export function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export const words = (s: string) => s.replace(/_/g, " ");

export const STAGE_LABEL: Record<string, string> = {
  starting: "Starting",
  starting_over: "Starting over",
  pivoting: "Pivoting",
};

export const PIPELINE: { key: string; label: string }[] = [
  { key: "inquiry", label: "Inquiry" },
  { key: "discovery_booked", label: "Discovery booked" },
  { key: "discovery_done", label: "Discovery done" },
  { key: "recommended", label: "Recommended" },
  { key: "enrolled", label: "Enrolled" },
  { key: "follow_up_later", label: "Follow up later" },
  { key: "referred_out", label: "Referred out" },
  { key: "not_proceeding", label: "Not proceeding" },
  { key: "alumni", label: "Past client" },
];

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return "Something went wrong. Nothing was changed. Try again.";
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    let s = String(v);
    // Stop spreadsheet formulas from running out of exported text.
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
