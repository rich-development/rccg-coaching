"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AccessBadge, AccessControls } from "@/components/access-controls";
import { useCan } from "@/components/role";
import { Badge, Button, Empty, Field, Input, Loading, PageTitle, Panel, Select, Tabs, useAct } from "@/components/ui";
import { dateTime, shortDate, words } from "@/lib/format";

type Role = "admin" | "staff";

export default function AccessPage() {
  const allowed = useCan("access");
  const data = useQuery(api.access.overview, allowed ? {} : "skip");
  const activity = useQuery(api.settings.activity, allowed ? { limit: 150 } : "skip");
  const addMember = useMutation(api.access.addMember);
  const setRole = useMutation(api.access.setMemberRole);
  const setPermissions = useMutation(api.access.setRolePermissions);
  const { act, busy } = useAct();
  const [tab, setTab] = useState("clients");
  const [person, setPerson] = useState({ name: "", email: "", role: "staff" as Role });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("with");

  if (!allowed) return <Empty>Your role does not include managing access.</Empty>;
  if (!data) return <Loading />;
  const isOwner = data.viewerRole === "owner";
  const shownClients = data.clients
    .filter((c) => (filter === "all" ? true : filter === "with" ? c.access !== "none" : c.access === filter))
    .filter((c) => `${c.fullName} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
  const toggle = (role: Role, key: string, on: boolean) => {
    const next = on ? [...data.roles[role], key] : data.roles[role].filter((p) => p !== key);
    return act(() => setPermissions({ role, permissions: next }), "Permissions updated");
  };

  return (
    <div>
      <PageTitle title="Access" sub="Who can sign in, what each role can do, and which clients can use their portal. Changes take effect right away and are recorded below." />
      {!data.clerkConfigured && (
        <p className="mb-5 rounded-md border border-clay/40 bg-clay-50 px-4 py-3 text-sm text-clay">
          CLERK_SECRET_KEY is not set on this Convex deployment. Invitation emails cannot be sent and ending access will not close open sign-ins until it is added.
        </p>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "clients", label: "Clients" },
          { key: "team", label: "Team" },
          { key: "roles", label: "Roles and permissions" },
          { key: "history", label: "History" },
        ]}
      />

      {tab === "clients" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="max-w-xs" aria-label="Search clients" />
            <Select aria-label="Filter by access" value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto">
              <option value="with">Everyone given access</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
              <option value="none">No access yet</option>
              <option value="all">Everyone</option>
            </Select>
          </div>
          {shownClients.length === 0 ? (
            <Empty>{data.clients.length === 0 ? "No client records yet." : "No one matches. Try the “No access yet” filter to invite someone."}</Empty>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
              {shownClients.map((c) => (
                <li key={c._id} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3.5">
                  <div className="min-w-56 flex-1">
                    <Link href={`/coach/clients/${c._id}`} className="text-sm font-medium underline-offset-2 hover:underline">{c.fullName}</Link>
                    <div className="text-[13px] text-soft">{c.email}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-soft">
                      <AccessBadge state={c.access} invitationSent={!!c.inviteSentAt} />
                      {c.archived && <Badge>Record archived</Badge>}
                      {c.inviteSentAt && c.access === "invited" && <span>Invited {shortDate(c.inviteSentAt)}</span>}
                      {c.accessChangedAt && c.access !== "invited" && c.access !== "none" && <span>Since {shortDate(c.accessChangedAt)}</span>}
                    </div>
                    {c.accessNote && <div className="mt-1 text-[13px] text-soft">{c.accessNote}</div>}
                  </div>
                  <AccessControls kind="client" id={c._id} state={c.access} signedIn={c.signedIn} name={c.fullName.split(" ")[0]} disabled={c.archived} invitationSent={!!c.inviteSentAt} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-[13px] text-soft">
            Pausing blocks her portal on her next click and keeps everything in place. Ending also signs her out everywhere. Neither one changes her coaching package: pause an engagement on her record if you need that.
          </p>
        </div>
      )}

      {tab === "team" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
          <div className="space-y-5">
            <Panel title="Owners">
              {data.owners.length === 0 ? (
                <Empty>No owner has signed in yet.</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.owners.map((o) => (
                    <li key={o._id} className="flex flex-wrap items-center gap-x-3">
                      <span className="font-medium">{o.name}</span>
                      <span className="text-soft">{o.email}</span>
                      <Badge tone="ink">Owner</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[13px] text-soft">
                Owners can do everything and cannot be locked out from this page. They are set in the Clerk dashboard, on the user, with public metadata {"{ \"role\": \"owner\" }"}. Keep this list short.
              </p>
            </Panel>
            <Panel title="Admins and staff">
              {data.members.length === 0 ? (
                <Empty>No team members yet.</Empty>
              ) : (
                <ul className="-mx-4 -my-4 divide-y divide-line">
                  {data.members.map((m) => {
                    const self = m._id === data.viewerMemberId;
                    const locked = self || (m.role === "admin" && !isOwner);
                    return (
                      <li key={m._id} className="flex flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3.5">
                        <div className="min-w-52 flex-1">
                          <div className="text-sm font-medium">{m.name}{self && <span className="ml-2 font-normal text-soft">(you)</span>}</div>
                          <div className="text-[13px] text-soft">{m.email}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <AccessBadge state={m.status} invitationSent={!!m.inviteSentAt} />
                            <Select aria-label={`Role for ${m.name}`} className="!w-auto !py-1 text-[13px]" value={m.role} disabled={busy || locked} onChange={(e) => act(() => setRole({ id: m._id, role: e.target.value as Role }), "Role changed")}>
                              <option value="staff">Staff</option>
                              <option value="admin" disabled={!isOwner}>Admin</option>
                            </Select>
                          </div>
                          {m.accessNote && <div className="mt-1 text-[13px] text-soft">{m.accessNote}</div>}
                        </div>
                        {locked ? (
                          <span className="text-[13px] text-soft">{self ? "You cannot change your own access." : "Only an owner can manage admins."}</span>
                        ) : (
                          <AccessControls kind="member" id={m._id} state={m.status} signedIn={m.signedIn} name={m.name.split(" ")[0]} invitationSent={!!m.inviteSentAt} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
          <Panel title="Add a team member">
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act(() => addMember(person), "Added. Send the invitation when you are ready.")) setPerson({ name: "", email: "", role: "staff" });
              }}
            >
              <Field label="Name"><Input required value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} maxLength={120} /></Field>
              <Field label="Sign-in email"><Input required type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} maxLength={200} /></Field>
              <Field label="Role">
                <Select value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value as Role })}>
                  <option value="staff">Staff</option>
                  <option value="admin" disabled={!isOwner}>Admin{isOwner ? "" : " (owners only)"}</option>
                </Select>
              </Field>
              <Button type="submit" tone="primary" disabled={busy}>Add to team</Button>
              <p className="text-[13px] text-soft">Adding someone does not email them. Click Send invitation on their row when you are ready.</p>
            </form>
          </Panel>
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-5">
          <div className="overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-[13px] text-soft">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Permission</th>
                  <th className="w-24 px-4 py-2.5 text-center font-medium">Owner</th>
                  <th className="w-24 px-4 py-2.5 text-center font-medium">Admin</th>
                  <th className="w-24 px-4 py-2.5 text-center font-medium">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-4 py-3">
                    <div className="font-medium">Day-to-day work</div>
                    <div className="text-[13px] text-soft">Client records, discovery, bookings, commitments, workbook, assessments, messages, co-working.</div>
                  </td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="px-4 py-3 text-center"><input type="checkbox" checked disabled aria-label="Always included" /></td>
                  ))}
                </tr>
                {data.catalog.map((p) => (
                  <tr key={p.key}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.label}</div>
                      <div className="text-[13px] text-soft">{p.detail}</div>
                    </td>
                    <td className="px-4 py-3 text-center"><input type="checkbox" checked disabled aria-label={`Owner: ${p.label}`} /></td>
                    {(["admin", "staff"] as Role[]).map((role) => (
                      <td key={role} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1d4a43]"
                          aria-label={`${role}: ${p.label}`}
                          checked={data.roles[role].includes(p.key)}
                          disabled={busy || (role === "admin" && !isOwner)}
                          onChange={(e) => toggle(role, p.key, e.target.checked)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Panel title="How this works">
            <ul className="space-y-2 text-sm">
              <li>Permissions belong to the role, so everyone with that role gets the same access. A change here applies to them on their next click.</li>
              <li>Only an owner can change what admins can do, or add, change, or remove an admin.</li>
              <li>Nobody can change their own access, and an admin cannot give staff a permission the admin role does not have.</li>
              <li>Clients never get any of these. A client only ever sees her own portal.</li>
            </ul>
          </Panel>
        </div>
      )}

      {tab === "history" && (
        <Panel title="Activity history">
          {!activity || activity.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a._id} className="flex flex-wrap gap-x-4">
                  <span className="w-44 shrink-0 text-[13px] text-soft">{dateTime(a.at)}</span>
                  <span className="min-w-0 flex-1">{a.summary}</span>
                  <span className="text-[13px] text-faint">{a.actor} ({words(a.actorRole)})</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
