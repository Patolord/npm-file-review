/**
 * Types for sponsored package alternatives system
 */

export type SponsoredPackage = {
  name: string;
  competitorPackage: string;
  description: string;
  npmUrl: string;
  githubUrl?: string;
  sponsorName: string;
  isActive: boolean;
};

export type CompetitorMapping = {
  competitorPackage: string;
  alternatives: SponsoredPackage[];
  reason:
    | "security"
    | "performance"
    | "license"
    | "maintenance"
    | "bundle-size"
    | "features";
  priority: "high" | "medium" | "low"; // How prominently to display
};

export type SponsorConfig = {
  mappings: CompetitorMapping[];
  enabled: boolean;
  displayStyle: "banner" | "inline" | "sidebar";
};
