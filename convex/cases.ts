
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listCases = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("cases")
      .withIndex("by_user", q => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const upsertCase = mutation({
  args: {
    userId: v.string(),
    caseId: v.string(),
    title: v.string(),
    client: v.string(),
    status: v.string(),
    opposingCounsel: v.string(),
    judge: v.string(),
    nextCourtDate: v.string(),
    summary: v.string(),
    winProbability: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cases")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .filter(q => q.eq(q.field("_id"), args.caseId))
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, { ...args, updatedAt: Date.now() });
    }
    return await ctx.db.insert("cases", { ...args, updatedAt: Date.now() });
  },
});

export const deleteCase = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, { caseId }) => {
    await ctx.db.delete(caseId);
  },
});
