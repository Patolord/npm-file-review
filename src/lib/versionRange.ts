export type VersionRangeInfo = {
  symbol: string;
  type: string;
  description: string;
  explanation: string;
  example: string;
  risk: "very-low" | "low" | "medium" | "high" | "very-high" | string;
};

export function analyzeVersionRange(requested: string): VersionRangeInfo {
  const trimmed = requested.trim();

  if (trimmed.startsWith("^")) {
    return {
      symbol: "^",
      type: "caret",
      description: "Compatible with version (minor and patch updates allowed)",
      explanation:
        "Allows updates that do not modify the major version. Safe for new features and bug fixes.",
      example: "^1.2.3 allows 1.2.4, 1.3.0, but not 2.0.0",
      risk: "low",
    };
  }
  if (trimmed.startsWith("~")) {
    return {
      symbol: "~",
      type: "tilde",
      description: "Approximately equivalent (patch updates only)",
      explanation:
        "Allows patch-level changes if a minor version is specified. Most restrictive.",
      example: "~1.2.3 allows 1.2.4, but not 1.3.0",
      risk: "very-low",
    };
  }
  if (trimmed.startsWith(">=")) {
    return {
      symbol: ">=",
      type: "gte",
      description: "Greater than or equal to",
      explanation: "Allows any version greater than or equal to the specified version.",
      example: ">=1.2.3 allows 1.2.3, 1.3.0, 2.0.0, 3.0.0",
      risk: "high",
    };
  }
  if (trimmed.startsWith(">")) {
    return {
      symbol: ">",
      type: "gt",
      description: "Greater than",
      explanation: "Allows any version greater than the specified version.",
      example: ">1.2.3 allows 1.2.4, 1.3.0, 2.0.0",
      risk: "high",
    };
  }
  if (trimmed.includes(" - ")) {
    return {
      symbol: "-",
      type: "range",
      description: "Version range",
      explanation: "Allows versions within the specified range (inclusive).",
      example: "1.2.3 - 2.3.4 allows any version between 1.2.3 and 2.3.4",
      risk: "medium",
    };
  }
  if (trimmed.includes("||")) {
    return {
      symbol: "||",
      type: "or",
      description: "Multiple acceptable ranges",
      explanation: "Allows versions that satisfy any of the specified ranges.",
      example: "^1.0.0 || ^2.0.0 allows 1.x.x or 2.x.x",
      risk: "medium",
    };
  }
  if (trimmed === "latest") {
    return {
      symbol: "latest",
      type: "latest",
      description: "Always use the latest version",
      explanation: "Always installs the most recent version. Can introduce breaking changes.",
      example: "latest always gets the newest available version",
      risk: "very-high",
    };
  }
  if (trimmed === "*") {
    return {
      symbol: "*",
      type: "any",
      description: "Any version",
      explanation: "Allows any version of the package. Highly risky.",
      example: "* allows any version ever published",
      risk: "very-high",
    };
  }
  if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return {
      symbol: "exact",
      type: "exact",
      description: "Exact version pinning",
      explanation: "Uses exactly this version. No automatic updates.",
      example: "1.2.3 only allows exactly version 1.2.3",
      risk: "very-low",
    };
  }
  return {
    symbol: "?",
    type: "complex",
    description: "Complex version pattern",
    explanation: "Custom or complex version specification.",
    example: "Various patterns possible",
    risk: "medium",
  };
}

export function getRiskBadge(
  risk: VersionRangeInfo["risk"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (risk) {
    case "very-low":
    case "low":
      return "default";
    case "medium":
      return "secondary";
    case "high":
    case "very-high":
      return "destructive";
    default:
      return "outline";
  }
}

export function getRiskColor(risk: VersionRangeInfo["risk"]): string {
  switch (risk) {
    case "very-low":
      return "text-green-600";
    case "low":
      return "text-green-500";
    case "medium":
      return "text-yellow-500";
    case "high":
      return "text-orange-500";
    case "very-high":
      return "text-red-500";
    default:
      return "text-gray-500";
  }
}


