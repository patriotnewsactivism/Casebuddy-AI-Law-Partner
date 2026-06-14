
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex schema for CaseBuddy cloud sync.
 *
 * Setup:
 * 1. npm install convex
 * 2. npx convex dev   (authenticate and deploy — creates convex.json)
 * 3. Add VITE_CONVEX_URL=https://your-deployment.convex.cloud to .env.local
 * 4. Wrap App in <ConvexProvider> (see convex/client.ts)
 *
 * Until configured, the app falls back to localStorage seamlessly.
 */

export default defineSchema({
  cases: defineTable({
    userId: v.string(),
    title: v.string(),
    client: v.string(),
    status: v.string(),
    opposingCounsel: v.string(),
    judge: v.string(),
    nextCourtDate: v.string(),
    summary: v.string(),
    winProbability: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  trialSessions: defineTable({
    userId: v.string(),
    caseId: v.string(),
    phase: v.string(),
    mode: v.string(),
    date: v.string(),
    duration: v.number(),
    transcript: v.array(v.object({
      sender: v.string(),
      text: v.string(),
      timestamp: v.number(),
    })),
    score: v.optional(v.number()),
  }).index("by_user", ["userId"]).index("by_case", ["caseId"]),

  witnessPrepPackages: defineTable({
    userId: v.string(),
    caseId: v.optional(v.string()),
    witnessName: v.string(),
    witnessRole: v.string(),
    relationship: v.string(),
    prepData: v.any(),
    generatedAt: v.number(),
  }).index("by_user", ["userId"]),

  consultationSessions: defineTable({
    userId: v.string(),
    specialistId: v.string(),
    messages: v.array(v.object({
      role: v.string(),
      text: v.string(),
      timestamp: v.number(),
    })),
    caseId: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]).index("by_specialist", ["specialistId"]),
});
