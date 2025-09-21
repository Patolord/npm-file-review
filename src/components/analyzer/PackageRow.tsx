"use client";

import {
  AlertTriangle,
  ExternalLink,
  FileText,
  Info,
  Pin,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSponsoredAlternatives } from "@/hooks/useSponsors";
import type { Dep } from "@/lib/lockfile";
import { analyzeVersionRange, getRiskBadge } from "@/lib/versionRange";
import type { Result } from "@/types/report";

function getLicenseIcon(license?: string) {
  if (!license) {
    return (
      <span className="text-gray-400" title="No license specified">
        <FileText className="h-3 w-3" />
      </span>
    );
  }

  const licenseUpper = license.toUpperCase();

  // Permissive licenses - ✅ Safe & flexible
  if (
    licenseUpper.includes("MIT") ||
    licenseUpper.includes("ISC") ||
    licenseUpper.includes("BSD") ||
    licenseUpper.includes("APACHE") ||
    licenseUpper.includes("ZLIB")
  ) {
    return (
      <span
        className="text-green-600 text-xs font-bold"
        title={`${license} - ✅ Safe & flexible (Permissive)`}
      >
        ✅
      </span>
    );
  }

  // Public Domain - ◻️ No restrictions
  if (
    licenseUpper.includes("CC0") ||
    licenseUpper.includes("UNLICENSE") ||
    licenseUpper.includes("PUBLIC DOMAIN")
  ) {
    return (
      <span
        className="text-blue-600 text-xs font-bold"
        title={`${license} - ◻️ No restrictions (Public Domain)`}
      >
        ◻️
      </span>
    );
  }

  // Copyleft (Strong) - ⚠️ Share-alike obligations
  if (licenseUpper.includes("GPL") || licenseUpper.includes("AGPL")) {
    return (
      <span
        className="text-orange-600 text-xs font-bold"
        title={`${license} - ⚠️ Share-alike obligations (Strong Copyleft)`}
      >
        ⚠️
      </span>
    );
  }

  // Copyleft (Weak) - ⚠️ Share-alike obligations
  if (
    licenseUpper.includes("LGPL") ||
    licenseUpper.includes("MPL") ||
    licenseUpper.includes("EPL")
  ) {
    return (
      <span
        className="text-yellow-600 text-xs font-bold"
        title={`${license} - ⚠️ Share-alike obligations (Weak Copyleft)`}
      >
        ⚠️
      </span>
    );
  }

  // Proprietary / Custom - 🔒 Restricted
  if (
    licenseUpper.includes("PROPRIETARY") ||
    licenseUpper.includes("COMMERCIAL") ||
    licenseUpper.includes("ALL RIGHTS RESERVED") ||
    licenseUpper.includes("EULA") ||
    licenseUpper.includes("CUSTOM") ||
    !licenseUpper.match(
      /(MIT|ISC|BSD|APACHE|ZLIB|GPL|LGPL|MPL|EPL|AGPL|CC0|UNLICENSE)/,
    )
  ) {
    return (
      <span
        className="text-red-600 text-xs font-bold"
        title={`${license} - 🔒 Restricted (Proprietary/Custom)`}
      >
        🔒
      </span>
    );
  }

  // Fallback - Unknown
  return (
    <span className="text-gray-500" title={`${license} - Unknown license type`}>
      <FileText className="h-3 w-3" />
    </span>
  );
}

type PackageRowProps = {
  pkg: Result;
  parsedDep?: Dep;
};

export function PackageRow({ pkg, parsedDep }: PackageRowProps) {
  const criticalIssues = pkg.issues.filter(
    (issue) => issue.level === "critical",
  );
  const warningIssues = pkg.issues.filter((issue) => issue.level === "warning");
  const infoIssues = pkg.issues.filter((issue) => issue.level === "info");

  const versionInfo = parsedDep?.requested
    ? analyzeVersionRange(parsedDep.requested)
    : null;

  // Check if this package has any sponsored alternatives (subtle display)
  const sponsoredAlternatives = useSponsoredAlternatives(pkg.name);
  const hasAlternative = sponsoredAlternatives?.alternatives[0];

  return (
    <div>
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code
              className="font-mono text-sm font-semibold truncate"
              title={`${pkg.name}@${pkg.version}`}
            >
              {pkg.name}@{pkg.version}
            </code>
            {pkg.license && (
              <div className="flex items-center gap-1">
                {getLicenseIcon(pkg.license)}
                <span
                  className="text-xs text-muted-foreground"
                  title={`License: ${pkg.license}`}
                >
                  {pkg.license}
                </span>
              </div>
            )}
            {pkg.latest && pkg.latest !== pkg.version && (
              <span
                className="text-xs text-muted-foreground"
                title={`Latest available version: ${pkg.latest}`}
              >
                → {pkg.latest}
              </span>
            )}
            {hasAlternative && (
              <Badge
                variant="outline"
                className="text-xs ml-2 text-blue-600 border-blue-200 bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors"
                title={`Alternative: ${hasAlternative.name} by ${hasAlternative.sponsorName}${hasAlternative.githubUrl ? " • Click to view on GitHub" : ""}`}
                onClick={() => {
                  if (hasAlternative.githubUrl) {
                    window.open(hasAlternative.githubUrl, "_blank");
                  } else {
                    window.open(hasAlternative.npmUrl, "_blank");
                  }
                }}
              >
                try {hasAlternative.name}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Badge>
            )}
          </div>

          {versionInfo && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1">
                <Badge
                  variant={getRiskBadge(versionInfo.risk)}
                  className="text-xs flex items-center gap-1"
                  title={`${versionInfo.description}. ${versionInfo.explanation} Example: ${versionInfo.example} Risk: ${String(versionInfo.risk).replace("-", " ")}`}
                >
                  {versionInfo.symbol === "exact" ? (
                    <>
                      <Pin className="h-3 w-3" aria-hidden="true" />
                    </>
                  ) : (
                    versionInfo.symbol
                  )}
                </Badge>
              </div>
              {parsedDep && (
                <span
                  className="text-xs text-muted-foreground font-mono truncate max-w-32"
                  title={`Requested version range: ${parsedDep.requested}`}
                >
                  requested: {parsedDep.requested}
                </span>
              )}
            </div>
          )}

          {pkg.issues.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {criticalIssues.map((issue, idx) => (
                <Badge
                  key={`crit-${pkg.name}-${idx}`}
                  variant="destructive"
                  className="text-xs cursor-help"
                  title={`Critical Issue: ${issue.msg}${issue.fix ? ` Fix: ${issue.fix}` : ""}`}
                >
                  <Shield className="h-3 w-3 mr-1" aria-hidden="true" />
                  {issue.kind}
                </Badge>
              ))}
              {warningIssues.map((issue, idx) => (
                <Badge
                  key={`warn-${pkg.name}-${idx}`}
                  variant="secondary"
                  className="text-xs cursor-help"
                  title={`Warning: ${issue.msg}${issue.fix ? ` Fix: ${issue.fix}` : ""}`}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                  {issue.kind}
                </Badge>
              ))}
              {infoIssues.map((issue, idx) => (
                <Badge
                  key={`info-${pkg.name}-${idx}`}
                  variant="outline"
                  className="text-xs cursor-help"
                  title={`Information: ${issue.msg}${issue.fix ? ` Suggestion: ${issue.fix}` : ""}`}
                >
                  <Info className="h-3 w-3 mr-1" aria-hidden="true" />
                  {issue.kind}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 ml-3">
          {criticalIssues.length > 0 && (
            <span
              title={`${criticalIssues.length} critical issue${criticalIssues.length > 1 ? "s" : ""}`}
            >
              <Shield className="h-4 w-4 text-red-500" />
            </span>
          )}
          {warningIssues.length > 0 && !criticalIssues.length && (
            <span
              title={`${warningIssues.length} warning${warningIssues.length > 1 ? "s" : ""}`}
            >
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </span>
          )}
          {infoIssues.length > 0 &&
            !criticalIssues.length &&
            !warningIssues.length && (
              <span
                title={`${infoIssues.length} update suggestion${infoIssues.length > 1 ? "s" : ""}`}
              >
                <Info className="h-4 w-4 text-blue-500" />
              </span>
            )}
          {pkg.issues.length === 0 && (
            <span
              className="h-4 w-4 rounded-full bg-green-500 block"
              title="No issues found"
            ></span>
          )}
        </div>
      </div>
    </div>
  );
}
