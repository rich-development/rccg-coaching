"use client";

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge, Button, Panel, useNotice, Visibility } from "@/components/ui";
import { errorMessage, shortDate } from "@/lib/format";

const MAX_BYTES = 20 * 1024 * 1024;

type FileRow = { _id: string; name: string; size: number; uploadedBy: "team" | "client"; uploaderName: string; createdAt: number; url: string | null };

const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

/** Sends one file to storage and returns its storage id. */
async function sendFile(uploadUrl: string, file: File): Promise<Id<"_storage">> {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!response.ok) throw new Error("upload failed");
  return ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
}

export function FileList({
  files,
  onUpload,
  onRemove,
  canRemove,
  empty,
  addLabel,
}: {
  files: FileRow[];
  onUpload: (file: File) => Promise<void>;
  onRemove?: (id: string) => Promise<unknown>;
  canRemove?: (f: FileRow) => boolean;
  empty: string;
  addLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const notice = useNotice();
  const [busy, setBusy] = useState(false);
  const pick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (file.size > MAX_BYTES) {
          notice(`${file.name} is too big. The limit is 20 MB.`, "error");
          continue;
        }
        await onUpload(file);
      }
      notice(list.length === 1 ? "File added" : "Files added");
    } catch (e) {
      notice(errorMessage(e), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div>
      {files.length === 0 ? (
        <p className="text-sm text-soft">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {files.map((f) => (
            <li key={f._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-pine underline underline-offset-2">{f.name}</a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              )}
              <span className="text-[13px] text-soft">{sizeLabel(f.size)}, {f.uploaderName}, {shortDate(f.createdAt)}</span>
              {onRemove && (!canRemove || canRemove(f)) && (
                <button type="button" className="text-[13px] text-clay underline underline-offset-2" onClick={() => window.confirm(`Remove ${f.name}?`) && onRemove(f._id).catch((e) => notice(errorMessage(e), "error"))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
      <div className="mt-3">
        <Button small disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : addLabel}</Button>
      </div>
    </div>
  );
}

/** The team's view of one client's files: shared with her, and private. */
export function ClientFiles({ clientId, clientName }: { clientId: Id<"clients">; clientName: string }) {
  const data = useQuery(api.files.list, { clientId });
  const uploadUrl = useMutation(api.files.uploadUrl);
  const save = useMutation(api.files.save);
  const remove = useMutation(api.files.remove);
  const upload = (visibility: "shared" | "private") => async (file: File) => {
    const storageId = await sendFile(await uploadUrl({}), file);
    await save({ clientId, storageId, name: file.name, visibility });
  };
  const rows = data?.files ?? [];
  return (
    <Panel title="Files">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">Shared with {clientName}</h3>
        <Visibility who="shared" />
      </div>
      <FileList files={rows.filter((f) => f.visibility === "shared")} onUpload={upload("shared")} onRemove={(id) => remove({ id: id as Id<"files"> })} empty="Nothing shared yet. She can add files from her portal too." addLabel="Add a shared file" />
      {data?.canSeePrivate && (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
            <h3 className="text-[13px] font-semibold">Private coach files</h3>
            <Badge tone="ink">Only you see this</Badge>
          </div>
          <FileList files={rows.filter((f) => f.visibility === "private")} onUpload={upload("private")} onRemove={(id) => remove({ id: id as Id<"files"> })} empty="No private files." addLabel="Add a private file" />
        </>
      )}
      <p className="mt-3 text-[13px] text-soft">No folders to create or share. Up to 20 MB per file.</p>
    </Panel>
  );
}

/** The client's own shared files, in her portal. */
export function PortalFiles() {
  const files = useQuery(api.portal.files, {});
  const uploadUrl = useMutation(api.portal.fileUploadUrl);
  const save = useMutation(api.portal.saveFile);
  const remove = useMutation(api.portal.removeFile);
  if (!files) return null;
  return (
    <Panel title="Your files">
      <FileList
        files={files}
        onUpload={async (file) => {
          const storageId = await sendFile(await uploadUrl({}), file);
          await save({ storageId, name: file.name });
        }}
        onRemove={(id) => remove({ id: id as Id<"files"> })}
        canRemove={(f) => f.uploadedBy === "client"}
        empty="No files yet. Add anything you want Tamika to see before your next session."
        addLabel="Add a file"
      />
      <p className="mt-3 text-[13px] text-soft">Only you and Tamika can see these. Please leave out passwords, account numbers, and customer details.</p>
    </Panel>
  );
}
