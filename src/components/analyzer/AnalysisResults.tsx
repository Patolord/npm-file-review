"use client";

import { BarChart3, Copy, Group, List, Package, Shield } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Dep } from "@/lib/lockfile";
import type { Issue, Report, Result } from "@/types/report";
import { LicenseSummary } from "./LicenseSummary";
import { PackageRow } from "./PackageRow";
import { TreeMapView } from "./TreeMapView";

type AnalysisResultsProps = {
  report: Report | null;
  isAnalyzing: boolean;
  isFetchingSizes: boolean;
  parsedData: { deps: Dep[]; projectLicense?: string } | null;
  onCopyAllFixes: () => void;
  groupSmallPackagesEnabled: boolean;
  onToggleGrouping: (enabled: boolean) => void;
};

function getScoreVariant(
  score: string,
): "default" | "secondary" | "destructive" {
  switch (score) {
    case "A":
      return "default"; // green
    case "B":
      return "secondary"; // yellow
    case "C":
      return "destructive"; // red
    default:
      return "secondary";
  }
}

function EmptyState() {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
      <p>Paste your package.json to get started</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="text-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-muted-foreground">Analyzing packages...</p>
    </div>
  );
}

function ResultsContent({
  report,
  parsedData,
  onCopyAllFixes,
  isFetchingSizes,
  groupSmallPackagesEnabled,
  onToggleGrouping,
}: {
  report: Report;
  parsedData: { deps: Dep[]; projectLicense?: string } | null;
  onCopyAllFixes: () => void;
  isFetchingSizes: boolean;
  groupSmallPackagesEnabled: boolean;
  onToggleGrouping: (enabled: boolean) => void;
}) {
  const [viewMode, setViewMode] = useState<"list" | "treemap">("list");
  const hasFixes = report.results.some((r: Result) =>
    r.issues.some((i: Issue) => i.fix),
  );

  return (
    <div className="space-y-4">
      {/* Copy All Fixes Button */}
      {hasFixes && (
        <Button onClick={onCopyAllFixes} className="w-full">
          <Copy className="h-4 w-4 mr-2" />
          Copy All Fixes
        </Button>
      )}

      {/* View Mode and Grouping Controls */}
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("list")}
        >
          <List className="h-4 w-4 mr-2" />
          List View
        </Button>
        <Button
          variant={viewMode === "treemap" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("treemap")}
          disabled={isFetchingSizes}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          Tree Map
          {isFetchingSizes && (
            <span className="ml-2 text-xs">(Loading sizes...)</span>
          )}
        </Button>

        {/* Grouping Toggle */}
        <Button
          variant={groupSmallPackagesEnabled ? "default" : "outline"}
          size="sm"
          onClick={() => onToggleGrouping(!groupSmallPackagesEnabled)}
          disabled={isFetchingSizes}
        >
          <Group className="h-4 w-4 mr-2" />
          Group Small Packages
        </Button>
      </div>

      {/* License Summary */}
      <LicenseSummary
        projectLicense={report.projectLicense}
        topLicenses={report.topLicenses}
      />

      {/* View Content */}
      {viewMode === "list" ? (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {report.results.map((pkg: Result) => {
              const parsedDep = parsedData?.deps.find(
                (d: Dep) => d.name === pkg.name,
              );
              return (
                <PackageRow
                  key={`${pkg.name}@${pkg.version}`}
                  pkg={pkg}
                  parsedDep={parsedDep}
                />
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <TreeMapView results={report.results} />
      )}
    </div>
  );
}

export function AnalysisResults({
  report,
  isAnalyzing,
  isFetchingSizes,
  parsedData,
  onCopyAllFixes,
  groupSmallPackagesEnabled,
  onToggleGrouping,
}: AnalysisResultsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Analysis
          </div>
          {report && (
            <Badge
              variant={getScoreVariant(report.score)}
              className="text-lg px-3 py-1"
            >
              {report.score}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {report ? (
            <>
              {report.count} packages analyzed
              {report.isLimited ? ` of ${report.total} total` : ""} •{" "}
              {report.criticalCount} critical • {report.warningCount} warnings •{" "}
              {report.infoCount} info
              {report.isLimited && (
                <div className="text-xs text-orange-600 mt-1">
                  ⚠️ Limited to first 600 packages for performance
                </div>
              )}
            </>
          ) : (
            "Analysis results will appear here as you type"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!report && !isAnalyzing && <EmptyState />}
        {isAnalyzing && <LoadingState />}
        {report && (
          <ResultsContent
            report={report}
            parsedData={parsedData}
            onCopyAllFixes={onCopyAllFixes}
            isFetchingSizes={isFetchingSizes}
            groupSmallPackagesEnabled={groupSmallPackagesEnabled}
            onToggleGrouping={onToggleGrouping}
          />
        )}
      </CardContent>
    </Card>
  );
}
