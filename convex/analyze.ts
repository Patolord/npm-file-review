import { v } from "convex/values";
import { action } from "./_generated/server";
// @ts-ignore - semver package exists but types may not be fully resolved in Convex environment
import semver from "semver";

type Issue = { level: "critical" | "warning" | "info"; kind: string; msg: string; fix?: string };
type Result = { name: string; version: string; requested?: string; license?: string; latest?: string; issues: Issue[] };

// OSV (Open Source Vulnerabilities) API integration
type OSVVulnerability = {
  id: string;
  summary: string;
  details?: string;
  aliases?: string[];
  affected: Array<{
    package: {
      ecosystem: string;
      name: string;
    };
    ranges: Array<{
      type: string;
      events: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
  }>;
  severity?: Array<{
    type: string;
    score: string;
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  database_specific?: {
    severity?: string;
    cvss?: any;
  };
};

type OSVQueryResponse = {
  vulns: OSVVulnerability[];
};

// Query OSV API for vulnerabilities (batch processing)
async function queryOSVVulnerabilitiesBatch(packages: Array<{name: string, version: string}>): Promise<Map<string, OSVVulnerability[]>> {
  const results = new Map<string, OSVVulnerability[]>();
  
  // Process in smaller batches to avoid overwhelming the API
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const batch = packages.slice(i, i + BATCH_SIZE);
    
    // Use OSV's batch query endpoint
    try {
      const queries = batch.map(pkg => ({
        package: {
          name: pkg.name,
          ecosystem: "npm"
        },
        version: pkg.version
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ queries }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const batchResults = await response.json() as { results: OSVQueryResponse[] };
        
        // Map results back to packages
        batchResults.results.forEach((result, index) => {
          if (index < batch.length) {
            const pkg = batch[index];
            const key = `${pkg.name}@${pkg.version}`;
            results.set(key, result.vulns || []);
          }
        });
      }
    } catch (error) {
      console.warn(`Failed to query OSV batch:`, error);
      // Set empty results for this batch
      for (const pkg of batch) {
        const key = `${pkg.name}@${pkg.version}`;
        results.set(key, []);
      }
    }
    
    // Small delay between batches to be respectful to the API
    if (i + BATCH_SIZE < packages.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

// Convert OSV vulnerability to our Issue format
function osvToIssue(vuln: OSVVulnerability, packageName: string): Issue {
  // Get CVE ID if available
  const cveId = vuln.aliases?.find(alias => alias.startsWith('CVE-')) || vuln.id;
  
  // Get severity level
  let level: "critical" | "warning" | "info" = "warning";
  if (vuln.severity?.length) {
    const severity = vuln.severity[0];
    if (severity.type === "CVSS_V3" && severity.score) {
      const score = parseFloat(severity.score);
      if (score >= 9.0) level = "critical";
      else if (score >= 7.0) level = "critical";
      else if (score >= 4.0) level = "warning";
      else level = "info";
    }
  } else if (vuln.database_specific?.severity) {
    const severity = vuln.database_specific.severity.toLowerCase();
    if (severity.includes("critical") || severity.includes("high")) level = "critical";
    else if (severity.includes("medium")) level = "warning";
    else level = "info";
  }

  // Get fixed version if available
  let fix: string | undefined;
  const affected = vuln.affected?.find(a => a.package.name === packageName);
  if (affected?.ranges) {
    for (const range of affected.ranges) {
      const fixedEvent = range.events.find(e => e.fixed);
      if (fixedEvent?.fixed) {
        fix = `${packageName}@${fixedEvent.fixed}`;
        break;
      }
    }
  }

  return {
    level,
    kind: "vuln",
    msg: `${cveId}: ${vuln.summary.substring(0, 80)}${vuln.summary.length > 80 ? '...' : ''}`,
    fix
  };
}

// Fallback known vulnerabilities (for when OSV API is unavailable)
const fallbackVulns: Record<string, { range: string; fix: string; msg: string }[]> = {
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

    // Batch query OSV API for vulnerabilities
    let osvVulnMap = new Map<string, OSVVulnerability[]>();
    let vulnSource = "fallback";
    try {
      console.log(`Querying OSV API for vulnerabilities of ${depsToAnalyze.length} packages...`);
      osvVulnMap = await queryOSVVulnerabilitiesBatch(depsToAnalyze);
      vulnSource = "osv";
      console.log(`OSV API returned vulnerability data for ${osvVulnMap.size} packages`);
      
      // Count packages with vulnerabilities
      const vulnCount = Array.from(osvVulnMap.values()).reduce((sum, vulns) => sum + vulns.length, 0);
      console.log(`Found ${vulnCount} total vulnerabilities across all packages`);
    } catch (error) {
      console.warn("Failed to query OSV API for vulnerabilities, falling back to hardcoded data:", error);
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

      // Check vulnerabilities from OSV API (with fallback)
      const packageKey = `${d.name}@${d.version}`;
      const osvVulns = osvVulnMap.get(packageKey);
      
      if (osvVulns && osvVulns.length > 0) {
        // Use OSV vulnerability data
        for (const vuln of osvVulns) {
          res.issues.push(osvToIssue(vuln, d.name));
        }
      } else if (osvVulnMap.size === 0) {
        // OSV API failed completely, use fallback
        const seeds = fallbackVulns[d.name] ?? [];
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
      }
      // If OSV API worked but returned no vulnerabilities, that's good - no vulnerabilities found

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
      vulnSource, // Track whether we used OSV API or fallback data
      results 
    };
  },
});
