"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Bar, Button, Empty, Loading, PageTitle, Panel, Select } from "@/components/ui";
import { downloadFile, isoLabel, money, toCsv, todayIso } from "@/lib/format";

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: 3650 },
];

const show = (n: number | null, suffix = "%") => (n === null ? "No data yet" : `${n}${suffix}`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="text-[13px] text-soft">{label}</div>
      <div className="display mt-1 text-[1.75rem] leading-none">{value}</div>
      {note && <div className="mt-1.5 text-[13px] text-soft">{note}</div>}
    </div>
  );
}

function Row({ label, value, max, right, tone }: { label: string; value: number; max: number; right?: string; tone?: "gold" | "pine" | "clay" }) {
  return (
    <div className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 py-1 text-sm">
      <span className="truncate text-soft">{label}</span>
      <Bar value={value} max={max} tone={tone} />
      <span className="text-right tabular-nums">{right ?? value}</span>
    </div>
  );
}

export default function ReportsPage() {
  const [range, setRange] = useState("90");
  const args = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)!.days;
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    return { from: to.getTime() - days * 86400_000, to: to.getTime(), today: todayIso() };
  }, [range]);
  const r = useQuery(api.reports.overview, args);
  const rows = useQuery(api.reports.engagementRows, {});
  if (!r) return <Loading />;
  const f = r.funnel;
  const maxMonth = Math.max(1, ...r.revenue.months.map((m) => m.coachingCents + m.coworkingCents));
  const maxWeek = Math.max(r.capacity.weeklyTarget, ...r.capacity.weeks.map((w) => w.completed + w.scheduled));
  const thisWeek = todayIso();

  return (
    <div>
      <PageTitle
        title="Reports"
        sub="How the practice is doing: who is finding you, who enrolls, how full your calendar is, and whether clients are moving."
        actions={
          <>
            <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value)} className="!w-auto">
              {RANGES.map((x) => (
                <option key={x.key} value={x.key}>{x.label}</option>
              ))}
            </Select>
            <Button disabled={!rows || rows.length === 0} onClick={() => rows && downloadFile(`engagements-${todayIso()}.csv`, toCsv(rows), "text/csv")}>
              Download engagements (CSV)
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Discovery calls that enrolled" value={show(f.discoveryToEnrolled)} note={`${f.enrolled} enrolled from ${f.inquiries} inquiries`} />
        <Stat label="Collected" value={money(r.revenue.collectedCents + r.revenue.coworkingCollectedCents)} note={`${money(r.revenue.outstandingCents)} still due on open engagements`} />
        <Stat label="Sessions clients showed up for" value={show(r.sessionStats.showRate)} note={`${r.sessionStats.completed} completed, ${r.sessionStats.missed} missed`} />
        <Stat label="Commitments completed" value={show(r.followThrough.completionRate)} note={`${r.followThrough.completed} of ${r.followThrough.due} that came due`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Discovery to enrollment">
          <Row label="Inquiries" value={f.inquiries} max={f.inquiries} />
          <Row label="Discovery calls" value={f.discovery} max={f.inquiries} />
          <Row label="Recommended" value={f.recommended} max={f.inquiries} />
          <Row label="Enrolled" value={f.enrolled} max={f.inquiries} tone="pine" />
          <p className="mt-3 text-[13px] text-soft">
            {f.medianDaysToEnroll === null ? "No enrollments in this period yet." : `Typical time from inquiry to enrolled: ${Math.round(f.medianDaysToEnroll)} days.`} {f.followUpLater} set to follow up later, {f.referredOut} referred out, {f.notProceeding} not proceeding.
          </p>
          {f.bySource.length > 0 && (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-[13px] text-soft">
                <tr><th className="py-1 font-medium">How they found you</th><th className="py-1 text-right font-medium">Inquiries</th><th className="py-1 text-right font-medium">Enrolled</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {f.bySource.map((s) => (
                  <tr key={s.source}><td className="py-1.5">{s.source}</td><td className="py-1.5 text-right tabular-nums">{s.inquiries}</td><td className="py-1.5 text-right tabular-nums">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Service uptake and revenue">
          {r.revenue.byService.length === 0 ? (
            <Empty>No engagements started in this period.</Empty>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[13px] text-soft">
                <tr><th className="py-1 font-medium">Service</th><th className="py-1 text-right font-medium">Started</th><th className="py-1 text-right font-medium">Agreed</th><th className="py-1 text-right font-medium">Collected</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.revenue.byService.map((s) => (
                  <tr key={s.service}><td className="py-1.5">{s.service}</td><td className="py-1.5 text-right tabular-nums">{s.count}</td><td className="py-1.5 text-right tabular-nums">{money(s.agreedCents)}</td><td className="py-1.5 text-right tabular-nums">{money(s.collectedCents)}</td></tr>
                ))}
                <tr><td className="py-1.5">Co-working</td><td className="py-1.5 text-right tabular-nums">{r.coworking.sessions}</td><td /><td className="py-1.5 text-right tabular-nums">{money(r.revenue.coworkingCollectedCents)}</td></tr>
              </tbody>
            </table>
          )}
          <h3 className="mb-1 mt-5 text-[13px] font-semibold">Collected by month</h3>
          {r.revenue.months.map((m) => (
            <Row key={m.month} label={isoLabel(`${m.month}-01`).split(" ")[0] + " " + m.month.slice(0, 4)} value={m.coachingCents + m.coworkingCents} max={maxMonth} right={money(m.coachingCents + m.coworkingCents)} />
          ))}
          <p className="mt-2 text-[13px] text-soft">Based on payments you confirmed and recorded. Stripe remains the record of truth.</p>
        </Panel>

        <Panel title="Coaching capacity">
          <p className="mb-3 text-[13px] text-soft">Sessions per week against your target of {r.capacity.weeklyTarget}. Gold is completed, green is booked.</p>
          {r.capacity.weeks.map((w) => {
            const total = w.completed + w.scheduled;
            return (
              <div key={w.weekOf} className="grid grid-cols-[5.5rem_1fr_8rem] items-center gap-3 py-1 text-sm">
                <span className={w.weekOf <= thisWeek ? "text-soft" : "text-faint"}>{isoLabel(w.weekOf)}</span>
                <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-mist">
                  <div className="bg-gold-500" style={{ width: `${(w.completed / maxWeek) * 100}%` }} />
                  <div className="bg-pine" style={{ width: `${(w.scheduled / maxWeek) * 100}%` }} />
                </div>
                <span className="text-right text-[13px] tabular-nums text-soft">{total} of {r.capacity.weeklyTarget}, {w.hours} hr</span>
              </div>
            );
          })}
        </Panel>

        <Panel title="Sessions">
          <Row label="Completed" value={r.sessionStats.completed} max={Math.max(1, r.sessionStats.completed)} tone="pine" />
          <Row label="Recaps shared" value={r.sessionStats.recapsShared} max={Math.max(1, r.sessionStats.completed)} />
          <Row label="Missed" value={r.sessionStats.missed} max={Math.max(1, r.sessionStats.completed)} tone="clay" />
          <Row label="Rescheduled" value={r.sessionStats.rescheduled} max={Math.max(1, r.sessionStats.completed)} />
          <Row label="Cancelled" value={r.sessionStats.cancelled} max={Math.max(1, r.sessionStats.completed)} />
          <h3 className="mb-1 mt-5 text-[13px] font-semibold">Your replies</h3>
          <p className="text-sm">
            {r.responsiveness.medianHours === null ? "No client messages answered in this period." : `Typical reply time: ${r.responsiveness.medianHours < 24 ? `${r.responsiveness.medianHours} hours` : `${Math.round((r.responsiveness.medianHours / 24) * 10) / 10} days`} across ${r.responsiveness.replies} replies.`}{" "}
            <span className="text-soft">Your stated window: {r.responsiveness.agreedWindow.toLowerCase()}.</span>
          </p>
        </Panel>

        <Panel title="Commitment follow-through" className="lg:col-span-2">
          {r.followThrough.byClient.length === 0 ? (
            <Empty>No client commitments came due in this period.</Empty>
          ) : (
            <>
              <p className="mb-3 text-[13px] text-soft">
                Of {r.followThrough.due} commitments that came due: {r.followThrough.completed} completed ({r.followThrough.onTime} on time), {r.followThrough.revised} revised, {r.followThrough.dropped} no longer needed, {r.followThrough.stillOpen} still open. A revised commitment is a healthy sign, not a failure.
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-[13px] text-soft">
                  <tr><th className="py-1 font-medium">Client</th><th className="py-1 text-right font-medium">Came due</th><th className="py-1 text-right font-medium">Completed</th><th className="py-1 text-right font-medium">Revised</th><th className="py-1 text-right font-medium">Still open</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.followThrough.byClient.map((c) => (
                    <tr key={c.clientId}>
                      <td className="py-1.5"><Link href={`/coach/clients/${c.clientId}?tab=actions`} className="underline-offset-2 hover:underline">{c.name}</Link></td>
                      <td className="py-1.5 text-right tabular-nums">{c.due}</td><td className="py-1.5 text-right tabular-nums">{c.completed}</td><td className="py-1.5 text-right tabular-nums">{c.revised}</td><td className={`py-1.5 text-right tabular-nums ${c.open ? "text-clay" : ""}`}>{c.open}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title="Observable client progress" className="lg:col-span-2">
          {r.progress.length === 0 ? (
            <Empty>No progress measures set yet. Add one on a client&rsquo;s engagement.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[38rem] text-left text-sm">
                <thead className="text-[13px] text-soft">
                  <tr><th className="py-1 font-medium">Client</th><th className="py-1 font-medium">What is measured</th><th className="py-1 font-medium">Start</th><th className="py-1 font-medium">Target</th><th className="py-1 font-medium">Actual</th><th className="py-1 font-medium">Engagement</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.progress.map((p, i) => (
                    <tr key={i}>
                      <td className="py-1.5"><Link href={`/coach/clients/${p.clientId}?tab=engagement`} className="underline-offset-2 hover:underline">{p.name}</Link></td>
                      <td className="py-1.5">{p.measure}</td><td className="py-1.5">{p.start}</td><td className="py-1.5">{p.target}</td><td className="py-1.5 font-medium">{p.actual || <span className="font-normal text-faint">Not recorded</span>}</td><td className="py-1.5 text-soft">{p.service} ({p.status})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Co-working">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-[13px] text-soft">Sessions</dt><dd className="display text-xl">{r.coworking.sessions}</dd></div>
            <div><dt className="text-[13px] text-soft">Seats filled</dt><dd className="display text-xl">{show(r.coworking.fillRate)}</dd></div>
            <div><dt className="text-[13px] text-soft">Showed up</dt><dd className="display text-xl">{show(r.coworking.attendanceRate)}</dd></div>
            <div><dt className="text-[13px] text-soft">Came back again</dt><dd className="display text-xl">{r.coworking.repeatAttendees} of {r.coworking.uniqueAttendees}</dd></div>
            <div><dt className="text-[13px] text-soft">Interested in coaching</dt><dd className="display text-xl">{r.coworking.interestedInCoaching}</dd></div>
            <div><dt className="text-[13px] text-soft">Became coaching clients</dt><dd className="display text-xl">{r.coworking.becameClients}</dd></div>
          </dl>
          {r.coworking.waitlist > 0 && <p className="mt-3 text-[13px] text-soft">{r.coworking.waitlist} people were waitlisted. Consider adding a session.</p>}
        </Panel>

        <Panel title="Staying on and speaking up">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-[13px] text-soft">Engagements completed</dt><dd className="display text-xl">{r.retention.completed}</dd></div>
            <div><dt className="text-[13px] text-soft">Chose to continue</dt><dd className="display text-xl">{r.retention.renewing}</dd></div>
            <div><dt className="text-[13px] text-soft">Clients with more than one engagement</dt><dd className="display text-xl">{r.retention.repeatClients} of {r.retention.totalClients}</dd></div>
            <div><dt className="text-[13px] text-soft">Renewal not decided</dt><dd className="display text-xl">{r.retention.undecided}</dd></div>
            <div><dt className="text-[13px] text-soft">Feedback received</dt><dd className="display text-xl">{r.voice.feedbackReceived}</dd></div>
            <div><dt className="text-[13px] text-soft">Testimonials with permission</dt><dd className="display text-xl">{r.voice.testimonialsGranted}{r.voice.testimonialsPending ? `, ${r.voice.testimonialsPending} pending` : ""}</dd></div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
