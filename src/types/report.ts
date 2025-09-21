export type Issue = {
  level: "critical" | "warning" | "info" | string;
  kind: string;
  msg: string;
  fix?: string;
};

export type Result = {
  name: string;
  version: string;
  license?: string;
  latest?: string;
  issues: Issue[];
  size?: number; // Size in bytes
};

export type Report = {
  score: "A" | "B" | "C";
  count: number;
  total: number;
  isLimited: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  projectLicense?: string;
  topLicenses?: Array<{ license: string; count: number }>;
  results: Result[];
};
