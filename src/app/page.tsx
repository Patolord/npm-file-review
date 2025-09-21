"use client";

import { AnalysisResults } from "@/components/analyzer/AnalysisResults";
import { PackageInput } from "@/components/analyzer/PackageInput";
import { usePackageAnalyzer } from "@/hooks/usePackageAnalyzer";

export default function AnalyzePage() {
  const {
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
  } = usePackageAnalyzer();

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">
          npm Package Security Analyzer
        </h1>
        <p className="text-muted-foreground">
          Paste your package.json content below for real-time security analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PackageInput
          packageText={packageText}
          onPackageTextChange={setPackageText}
          parsedData={parsedData}
          isAnalyzing={isAnalyzing}
          error={error}
        />

        <AnalysisResults
          report={report}
          isAnalyzing={isAnalyzing}
          isFetchingSizes={isFetchingSizes}
          parsedData={parsedData}
          onCopyAllFixes={copyAllFixes}
          groupSmallPackagesEnabled={groupSmallPackagesEnabled}
          onToggleGrouping={setGroupSmallPackagesEnabled}
        />
      </div>
    </div>
  );
}
