import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Sponsored packages table - simple and direct
  sponsoredPackages: defineTable({
    name: v.string(),
    competitorPackage: v.string(), // Which package this replaces
    description: v.string(),
    npmUrl: v.string(),
    githubUrl: v.optional(v.string()),
    sponsorName: v.string(),
    isActive: v.boolean(),
  })
    .index("by_competitor", ["competitorPackage"])
    .index("by_active", ["isActive"]),
});
