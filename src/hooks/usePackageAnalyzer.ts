import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Dep,
  detectFileKind,
  parseNpmLock,
  parsePackageJson,
  parsePnpmLock,
} from "@/lib/lockfile";
import { fetchPackageSizes, groupSmallPackages } from "@/lib/npmRegistry";
import type { Issue, Report, Result } from "@/types/report";
import { api } from "../../convex/_generated/api";

type ParsedData = {
  deps: Dep[];
  projectLicense?: string;
};

export function usePackageAnalyzer() {
  const [packageText, setPackageText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [rawReport, setRawReport] = useState<Report | null>(null); // Store ungrouped results
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFetchingSizes, setIsFetchingSizes] = useState(false);
  const [groupSmallPackagesEnabled, setGroupSmallPackagesEnabled] =
    useState(true);

  // Convex API types are generated at build time
  const analyze = useAction(api.analyze.analyzePackages);

  // Parse dependencies from the text input
  const parsedData = useMemo((): ParsedData | null => {
    if (!packageText.trim()) return null;

    try {
      const kind = detectFileKind("package.json", packageText);
      let deps: Dep[] = [];
      let projectLicense: string | undefined;

      if (kind === "npm-lock") {
        deps = parseNpmLock(packageText);
      } else if (kind === "pnpm-lock") {
        deps = parsePnpmLock(packageText);
      } else {
        // Handle both "pkg-json" and unknown types as package.json
        const parsed = parsePackageJson(packageText);
        deps = parsed.deps;
        projectLicense = parsed.projectLicense;
      }

      return { deps, projectLicense };
    } catch (err) {
      console.warn("Failed to parse package file:", err);
      return null;
    }
  }, [packageText]);

  // Auto-analyze when dependencies are parsed
  useEffect(() => {
    if (!parsedData?.deps.length) {
      setReport(null);
      setError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsAnalyzing(true);
      setError(null);

      try {
        const result = await analyze({
          deps: parsedData.deps,
          projectLicense: parsedData.projectLicense,
        });

        // Set initial report without sizes
        setReport(result as Report);
        setIsAnalyzing(false);

        // Fetch real package sizes in the background
        setIsFetchingSizes(true);
        try {
          const resultsWithSizes = await fetchPackageSizes(result.results);
          const reportWithSizes = {
            ...result,
            results: resultsWithSizes,
          };

          // Store the raw report (ungrouped)
          setRawReport(reportWithSizes as Report);

          // Apply grouping based on current setting
          const finalResults = groupSmallPackagesEnabled
            ? groupSmallPackages(resultsWithSizes)
            : resultsWithSizes;

          setReport({
            ...reportWithSizes,
            results: finalResults,
          } as Report);
        } catch (sizeError) {
          console.warn("Failed to fetch package sizes:", sizeError);
          // Keep the report without sizes rather than failing completely
        } finally {
          setIsFetchingSizes(false);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Analysis error: ${message}`);
        setReport(null);
      } finally {
        setIsAnalyzing(false);
        setIsFetchingSizes(false);
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timeoutId);
  }, [parsedData, analyze, groupSmallPackagesEnabled]);

  // Handle toggling of small package grouping
  useEffect(() => {
    if (rawReport) {
      const finalResults = groupSmallPackagesEnabled
        ? groupSmallPackages(rawReport.results)
        : rawReport.results;

      setReport({
        ...rawReport,
        results: finalResults,
      });
    }
  }, [groupSmallPackagesEnabled, rawReport]);

  const copyAllFixes = useCallback(async () => {
    if (!report) return;

    const fixes = report.results
      .flatMap((r: Result) => r.issues)
      .filter((i: Issue) => i.fix)
      .map((i: Issue) => i.fix as string)
      .join(" ");

    if (fixes) {
      try {
        await navigator.clipboard.writeText(fixes);
      } catch (err) {
        console.error("Failed to copy fixes to clipboard:", err);
      }
    }
  }, [report]);

  return {
    packageText,
    setPackageText,
    report,
    error,
    isAnalyzing,
    isFetchingSizes,
    parsedData,
    copyAllFixes,
    groupSmallPackagesEnabled,
    setGroupSmallPackagesEnabled,
  };
}
