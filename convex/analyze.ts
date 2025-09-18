import { action } from "./_generated/server";
import { v } from "convex/values";
// @ts-ignore - semver package exists but types may not be fully resolved in Convex environment
import semver from "semver";

type Issue = { level: "critical" | "warning" | "info"; kind: string; msg: string; fix?: string };
type Result = { name: string; version: string; requested?: string; license?: string; latest?: string; issues: Issue[] };

const knownVulns: Record<string, { range: string; fix: string; msg: string }[]> = {
  minimist: [{ range: "<1.2.6", fix: "1.2.8", msg: "Prototype pollution (CVE-2020-7598). Upgrade recommended." }],
  tar: [{ range: "<4.4.19", fix: "4.4.19", msg: "Path traversal vulnerability (CVE-2021-32804). Upgrade recommended." }],
  "ua-parser-js": [{ range: "<0.7.24", fix: "0.7.24", msg: "Regular Expression Denial of Service (CVE-2020-36313). Upgrade recommended." }],
  "ansi-regex": [{ range: "<5.0.1", fix: "5.0.1", msg: "Regular Expression Denial of Service (CVE-2021-3807). Upgrade recommended." }],
  "node-forge": [{ range: "<1.3.1", fix: "1.3.1", msg: "Prototype pollution vulnerability (CVE-2022-24773). Upgrade recommended." }],
};

// Top packages for typosquatting detection
const topPackages = [
  "react", "react-dom", "next", "express", "lodash", "axios", 
  "typescript", "eslint", "webpack", "vue", "angular", "jquery",
  "moment", "bootstrap", "tailwindcss", "prettier", "jest"
];

// Levenshtein distance implementation for typosquatting detection
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[b.length][a.length];
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs = 5000, headers?: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: headers || {}
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Extract only needed fields from version metadata - don't store the whole response
function extractVersionInfo(versionMeta: any, name: string, version: string) {
  // Normalize license information
  let license = versionMeta?.license || "UNKNOWN";
  
  // Handle complex license objects
  if (typeof license === 'object') {
    if (license.type) {
      license = license.type;
    } else if (Array.isArray(license)) {
      license = license.map(l => l.type || l).join(", ");
    } else {
      license = JSON.stringify(license);
    }
  }
  
  return {
    name,
    version,
    license: license || "UNKNOWN",
    deprecated: !!versionMeta?.deprecated,
    scripts: {
      preinstall: !!versionMeta?.scripts?.preinstall,
      postinstall: !!versionMeta?.scripts?.postinstall,
      install: !!versionMeta?.scripts?.install
    }
  };
}

// Check for license conflicts
function checkLicenseConflict(projectLicense: string, packageLicense: string): { hasConflict: boolean; severity: "warning" | "info"; reason: string } | null {
  if (!projectLicense || !packageLicense || packageLicense === "UNKNOWN") {
    return null;
  }

  const project = projectLicense.toUpperCase();
  const pkg = packageLicense.toUpperCase();

  // High severity conflicts
  if (project.includes("MIT") || project.includes("BSD") || project.includes("APACHE")) {
    if (pkg.includes("GPL") && !pkg.includes("LGPL")) {
      return {
        hasConflict: true,
        severity: "warning",
        reason: `${packageLicense} requires derivatives to be open source, conflicts with ${projectLicense}`
      };
    }
    if (pkg.includes("AGPL")) {
      return {
        hasConflict: true,
        severity: "warning", 
        reason: `${packageLicense} requires network use to trigger copyleft, conflicts with ${projectLicense}`
      };
    }
  }

  // Medium severity - worth noting
  if (project.includes("MIT") && pkg.includes("LGPL")) {
    return {
      hasConflict: false,
      severity: "info",
      reason: `${packageLicense} is compatible but may require attribution/distribution of LGPL portions`
    };
  }

  return null;
}

// Helper function to process items with concurrency limit
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(processor));
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }
  }
  
  return results;
}

export const analyzePackages = action({
  args: {
    deps: v.array(v.object({ name: v.string(), version: v.string(), requested: v.optional(v.string()) })),
    projectLicense: v.optional(v.string()),
  },
  handler: async (_ctx, { deps, projectLicense }) => {
    // Cap analysis to prevent memory issues - analyze first 600 unique packages
    const MAX_PACKAGES = 600;
    const uniqueDeps = deps.reduce((acc, dep) => {
      const key = `${dep.name}@${dep.version}`;
      if (!acc.has(key)) {
        acc.set(key, dep);
      }
      return acc;
    }, new Map<string, typeof deps[0]>());
    
    const depsToAnalyze = Array.from(uniqueDeps.values()).slice(0, MAX_PACKAGES);
    const isLimited = uniqueDeps.size > MAX_PACKAGES;
    
    // Get unique package names for dist-tags
    const uniquePackageNames = [...new Set(depsToAnalyze.map(d => d.name))];
    
    // Fetch dist-tags for all unique packages (tiny responses)
    const distTagsMap = new Map<string, string>();
    const distTagsResults = await processWithConcurrency(
      uniquePackageNames,
      8, // Higher concurrency for tiny dist-tags
      async (name) => {
        try {
          const distTags = await fetchWithTimeout(
            `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`
          );
          return { name, latest: distTags?.latest };
        } catch {
          return { name, latest: null };
        }
      }
    );
    
    for (const result of distTagsResults) {
      if (result.latest) {
        distTagsMap.set(result.name, result.latest);
      }
    }

    // Fetch version-specific metadata (small responses) with controlled concurrency
    const versionInfoResults = await processWithConcurrency(
      depsToAnalyze,
      6, // Lower concurrency for version metadata
      async (dep) => {
        try {
          const versionMeta = await fetchWithTimeout(
            `https://registry.npmjs.org/${encodeURIComponent(dep.name)}/${encodeURIComponent(dep.version)}`
          );
          return extractVersionInfo(versionMeta, dep.name, dep.version);
        } catch {
          return {
            name: dep.name,
            version: dep.version,
            license: "UNKNOWN",
            deprecated: false,
            scripts: { preinstall: false, postinstall: false, install: false },
            __error: true
          };
        }
      }
    );

    // Create lookup map for version info
    const versionInfoMap = new Map<string, any>();
    for (const info of versionInfoResults) {
      versionInfoMap.set(`${info.name}@${info.version}`, info);
    }

    const results: Result[] = [];

    for (const d of depsToAnalyze) {
      const versionKey = `${d.name}@${d.version}`;
      const versionInfo = versionInfoMap.get(versionKey);
      const latest = distTagsMap.get(d.name);
      
      const res: Result = { 
        name: d.name, 
        version: d.version, 
        requested: d.requested, 
        latest,
        license: versionInfo?.license || "UNKNOWN",
        issues: [] 
      };

      if (versionInfo?.__error) {
        res.issues.push({ level: "info", kind: "meta", msg: "Could not fetch metadata" });
        results.push(res);
        continue;
      }

      // Deprecated check
      if (versionInfo?.deprecated) {
        res.issues.push({ level: "warning", kind: "deprecated", msg: "Package deprecated" });
      }

      // Install scripts check (security risk)
      if (versionInfo?.scripts) {
        const scriptTypes = [
          versionInfo.scripts.preinstall && "preinstall",
          versionInfo.scripts.postinstall && "postinstall", 
          versionInfo.scripts.install && "install"
        ].filter(Boolean);
        
        if (scriptTypes.length > 0) {
          res.issues.push({ 
            level: "warning", 
            kind: "scripts", 
            msg: `Has ${scriptTypes.join(", ")} script(s)` 
          });
        }
      }

      // Enhanced license conflict checking
      if (projectLicense && res.license) {
        const conflict = checkLicenseConflict(projectLicense, res.license);
        if (conflict) {
          res.issues.push({ 
            level: conflict.severity, 
            kind: "license", 
            msg: conflict.reason
          });
        }
      }

      // Known vulnerabilities
      const seeds = knownVulns[d.name] ?? [];
      for (const ventry of seeds) {
        if (semver.satisfies(d.version, ventry.range)) {
          res.issues.push({ 
            level: "critical", 
            kind: "vuln", 
            msg: ventry.msg.substring(0, 100), // Keep messages short
            fix: `${d.name}@${ventry.fix}` 
          });
        }
      }

      // Typosquatting detection (reduced false positives)
      for (const topPkg of topPackages) {
        if (levenshteinDistance(d.name, topPkg) === 1 && d.name !== topPkg) {
          const hasIntentionalSuffix = /-(js|ts|node|npm|cli|lib|utils?|core|api)$/i.test(d.name);
          const hasScope = d.name.startsWith('@');
          
          if (!hasIntentionalSuffix && !hasScope) {
            res.issues.push({ 
              level: "warning", 
              kind: "typosquat", 
              msg: `Similar to "${topPkg}"` 
            });
            break;
          }
        }
      }

      // Safe update suggestions
      if (latest && latest !== d.version) {
        const current = semver.valid(d.version);
        const latestValid = semver.valid(latest);
        
        if (current && latestValid) {
          const diff = semver.diff(current, latestValid);
          if (diff === 'patch' || diff === 'minor') {
            let shouldSuggest = true;
            
            if (d.requested) {
              try {
                shouldSuggest = semver.satisfies(latestValid, d.requested);
              } catch {
                shouldSuggest = true;
              }
            }
            
            if (shouldSuggest) {
              res.issues.push({ 
                level: "info", 
                kind: "update", 
                msg: `${diff} update to ${latest}`, 
                fix: `${d.name}@${latest}` 
              });
            }
          }
        }
      }

      results.push(res);
    }

    // Calculate score
    const criticalCount = results.reduce((sum, r) => sum + r.issues.filter(i => i.level === "critical").length, 0);
    const warningCount = results.reduce((sum, r) => sum + r.issues.filter(i => i.level === "warning").length, 0);
    const infoCount = results.reduce((sum, r) => sum + r.issues.filter(i => i.level === "info").length, 0);
    
    let score: "A" | "B" | "C";
    if (criticalCount > 0) {
      score = "C";
    } else if (warningCount > 0) {
      score = "B";
    } else {
      score = "A";
    }

    // Generate license summary
    const licenseSummary = new Map<string, number>();
    for (const result of results) {
      if (result.license && result.license !== "UNKNOWN") {
        licenseSummary.set(result.license, (licenseSummary.get(result.license) || 0) + 1);
      }
    }
    
    const topLicenses = Array.from(licenseSummary.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([license, count]) => ({ license, count }));

    return { 
      score, 
      count: results.length, 
      total: deps.length,
      isLimited,
      criticalCount,
      warningCount,
      infoCount,
      projectLicense,
      topLicenses,
      results 
    };
  },
});
