import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { bad, can, logActivity, notFound, requireTeam, text } from "./lib/auth";

/**
 * Files kept inside the app, so nobody has to create and share folders.
 *   shared   The client sees these in her portal and can add her own.
 *   private  Only team members with the coaching permission. Never sent to
 *            the portal: no portal function reads a private file.
 * Download links are long random addresses from Convex storage. Anyone who
 * has a link can open that one file, so treat a copied link like the file.
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const visibility = v.union(v.literal("shared"), v.literal("private"));

export const list = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const seePrivate = can(viewer, "coaching");
    const rows = await ctx.db
      .query("files")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .collect();
    const out = [];
    for (const f of rows) {
      if (f.visibility === "private" && !seePrivate) continue;
      out.push({
        _id: f._id,
        name: f.name,
        size: f.size,
        visibility: f.visibility,
        uploadedBy: f.uploadedBy,
        uploaderName: f.uploaderName,
        createdAt: f.createdAt,
        url: await ctx.storage.getUrl(f.storageId),
      });
    }
    return { files: out, canSeePrivate: seePrivate };
  },
});

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireTeam(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { clientId: v.id("clients"), storageId: v.id("_storage"), name: v.string(), visibility },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) notFound("Client");
    if (args.visibility === "private" && !can(viewer, "coaching")) bad("Your role cannot add private coach files.");
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) notFound("Upload");
    if (meta.size > MAX_FILE_BYTES) {
      await ctx.storage.delete(args.storageId);
      bad("That file is too big. The limit is 20 MB.");
    }
    const name = text(args.name, 200, "File name") || "Untitled";
    await ctx.db.insert("files", {
      clientId: args.clientId,
      storageId: args.storageId,
      name,
      size: meta.size,
      contentType: meta.contentType ?? "application/octet-stream",
      visibility: args.visibility,
      uploadedBy: "team",
      uploaderName: viewer.name,
      createdAt: Date.now(),
    });
    await logActivity(ctx, viewer, "file.added", `Added a ${args.visibility} file for ${client.preferredName}: ${name}`, args.clientId);
  },
});

export const remove = mutation({
  args: { id: v.id("files") },
  handler: async (ctx, args) => {
    const viewer = await requireTeam(ctx);
    const f = await ctx.db.get(args.id);
    if (!f) return;
    if (f.visibility === "private" && !can(viewer, "coaching")) notFound("File");
    await ctx.storage.delete(f.storageId);
    await ctx.db.delete(args.id);
    await logActivity(ctx, viewer, "file.removed", `Removed the file ${f.name}`, f.clientId);
  },
});
