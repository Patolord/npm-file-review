import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get sponsored alternatives for a package
export const getSponsoredAlternatives = query({
  args: { packageName: v.string() },
  handler: async (ctx, { packageName }) => {
    // Find sponsored package for this competitor package
    const sponsoredPackage = await ctx.db
      .query("sponsoredPackages")
      .withIndex("by_competitor", (q) => q.eq("competitorPackage", packageName))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!sponsoredPackage) {
      return null;
    }

    // Return in the format expected by the frontend
    return {
      competitorPackage: packageName,
      reason: "bundle-size" as const, // Default reason for now
      priority: "medium" as const, // Default priority
      alternatives: [sponsoredPackage],
    };
  },
});

// Query to get all sponsored packages (for admin)
export const getAllSponsoredPackages = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("sponsoredPackages")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

// Mutation to create a sponsored package
export const createSponsoredPackage = mutation({
  args: {
    name: v.string(),
    competitorPackage: v.string(),
    description: v.string(),
    npmUrl: v.string(),
    githubUrl: v.optional(v.string()),
    sponsorName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sponsoredPackages", {
      ...args,
      isActive: true,
    });
  },
});
