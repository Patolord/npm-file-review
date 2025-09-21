/**
 * Simplified hook for Convex-powered sponsored packages
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Get sponsored alternatives for a specific package
 */
export function useSponsoredAlternatives(packageName: string) {
  return useQuery(api.sponsors.getSponsoredAlternatives, { packageName });
}

/**
 * Get all sponsored packages (for admin use)
 */
export function useAllSponsoredPackages() {
  return useQuery(api.sponsors.getAllSponsoredPackages);
}
