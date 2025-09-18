"use client";
import { useState, useEffect, useMemo } from "react";
import { useAction } from "convex/react";

import { detectFileKind, parseNpmLock, parsePnpmLock, parsePackageJson, Dep } from "@/lib/lockfile";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Shield, AlertTriangle, Info, Package, HelpCircle, Pin } from "lucide-react";

type Report = { 
  score: "A"|"B"|"C"; 
  count: number;
  total: number;
  isLimited: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  projectLicense?: string;
  topLicenses?: Array<{license: string; count: number}>;
  results: Array<{name:string;version:string;license?:string;latest?:string;issues:{level:string;kind:string;msg:string;fix?:string}[]}> 
};

export default function AnalyzePage() {
  const [packageText, setPackageText] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // @ts-ignore - Convex API types are generated at build time
  const analyze = useAction(api.analyze.analyzePackages);

  // Parse dependencies from the text input
  const parsedData = useMemo(() => {
    if (!packageText.trim()) return null;
    
    try {
      const kind = detectFileKind("package.json", packageText);
    let deps: Dep[] = [];
    let projectLicense: string | undefined;

      if (kind === "npm-lock") deps = parseNpmLock(packageText);
      else if (kind === "pnpm-lock") deps = parsePnpmLock(packageText);
      else if (kind === "pkg-json") {
        const parsed = parsePackageJson(packageText);
        deps = parsed.deps;
        projectLicense = parsed.projectLicense;
      } else {
        // Try to parse as package.json by default
        const parsed = parsePackageJson(packageText);
        deps = parsed.deps;
        projectLicense = parsed.projectLicense;
      }

      return { deps, projectLicense };
    } catch (err) {
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
        const r = await analyze({ 
          deps: parsedData.deps, 
          projectLicense: parsedData.projectLicense 
        });
      setReport(r as Report);
    } catch (err: any) {
        setError(`Analysis error: ${err.message ?? String(err)}`);
        setReport(null);
      } finally {
        setIsAnalyzing(false);
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timeoutId);
  }, [parsedData, analyze]);

  const copyAllFixes = async () => {
    if (!report) return;
    const fixes = report.results
      .flatMap(r => r.issues)
      .filter(i => i.fix)
      .map(i => i.fix!)
      .join(' ');
    
    if (fixes) {
      await navigator.clipboard.writeText(fixes);
    }
  };

  const getScoreVariant = (score: string): "default" | "secondary" | "destructive" => {
    switch (score) {
      case 'A': return 'default'; // green
      case 'B': return 'secondary'; // yellow
      case 'C': return 'destructive'; // red
      default: return 'secondary';
    }
  };

  const getIssueIcon = (level: string) => {
    switch (level) {
      case 'critical': return <Shield className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info': return <Info className="h-4 w-4 text-blue-500" />;
      default: return <Package className="h-4 w-4 text-gray-500" />;
    }
  };

  const getIssueVariant = (level: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (level) {
      case 'critical': return 'destructive';
      case 'warning': return 'secondary';
      case 'info': return 'outline';
      default: return 'outline';
    }
  };

  // Analyze version range configuration
  const analyzeVersionRange = (requested: string) => {
    const trimmed = requested.trim();
    
    if (trimmed.startsWith('^')) {
      return {
        symbol: '^',
        type: 'caret',
        description: 'Compatible with version (minor and patch updates allowed)',
        explanation: 'Allows updates that do not modify the major version. Safe for new features and bug fixes.',
        example: '^1.2.3 allows 1.2.4, 1.3.0, but not 2.0.0',
        risk: 'low'
      };
    } else if (trimmed.startsWith('~')) {
      return {
        symbol: '~',
        type: 'tilde',
        description: 'Approximately equivalent (patch updates only)',
        explanation: 'Allows patch-level changes if a minor version is specified. Most restrictive.',
        example: '~1.2.3 allows 1.2.4, but not 1.3.0',
        risk: 'very-low'
      };
    } else if (trimmed.startsWith('>=')) {
      return {
        symbol: '>=',
        type: 'gte',
        description: 'Greater than or equal to',
        explanation: 'Allows any version greater than or equal to the specified version.',
        example: '>=1.2.3 allows 1.2.3, 1.3.0, 2.0.0, 3.0.0',
        risk: 'high'
      };
    } else if (trimmed.startsWith('>')) {
      return {
        symbol: '>',
        type: 'gt',
        description: 'Greater than',
        explanation: 'Allows any version greater than the specified version.',
        example: '>1.2.3 allows 1.2.4, 1.3.0, 2.0.0',
        risk: 'high'
      };
    } else if (trimmed.includes(' - ')) {
      return {
        symbol: '-',
        type: 'range',
        description: 'Version range',
        explanation: 'Allows versions within the specified range (inclusive).',
        example: '1.2.3 - 2.3.4 allows any version between 1.2.3 and 2.3.4',
        risk: 'medium'
      };
    } else if (trimmed.includes('||')) {
      return {
        symbol: '||',
        type: 'or',
        description: 'Multiple acceptable ranges',
        explanation: 'Allows versions that satisfy any of the specified ranges.',
        example: '^1.0.0 || ^2.0.0 allows 1.x.x or 2.x.x',
        risk: 'medium'
      };
    } else if (trimmed === 'latest') {
      return {
        symbol: 'latest',
        type: 'latest',
        description: 'Always use the latest version',
        explanation: 'Always installs the most recent version. Can introduce breaking changes.',
        example: 'latest always gets the newest available version',
        risk: 'very-high'
      };
    } else if (trimmed === '*') {
      return {
        symbol: '*',
        type: 'any',
        description: 'Any version',
        explanation: 'Allows any version of the package. Highly risky.',
        example: '* allows any version ever published',
        risk: 'very-high'
      };
    } else if (/^\d+\.\d+\.\d+$/.test(trimmed)) {
      return {
        symbol: 'exact',
        type: 'exact',
        description: 'Exact version pinning',
        explanation: 'Uses exactly this version. No automatic updates.',
        example: '1.2.3 only allows exactly version 1.2.3',
        risk: 'very-low'
      };
    } else {
      return {
        symbol: '?',
        type: 'complex',
        description: 'Complex version pattern',
        explanation: 'Custom or complex version specification.',
        example: 'Various patterns possible',
        risk: 'medium'
      };
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'very-low': return 'text-green-600';
      case 'low': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'high': return 'text-orange-500';
      case 'very-high': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getRiskBadge = (risk: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (risk) {
      case 'very-low': case 'low': return 'default';
      case 'medium': return 'secondary';
      case 'high': case 'very-high': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-2">npm Package Security Analyzer</h1>
        <p className="text-muted-foreground">
          Paste your package.json content below for real-time security analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Package Configuration
            </CardTitle>
            <CardDescription>
              Paste your package.json content here for live analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={`{
  "name": "your-project",
  "dependencies": {
    "react": "^18.0.0",
    "lodash": "^4.17.20"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`}
              value={packageText}
              onChange={(e) => setPackageText(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
            />
            
            {parsedData && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  ✅ Found {parsedData.deps.length} packages
                  {isAnalyzing && " • Analyzing..."}
                </p>
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Analysis
              </div>
              {report && (
                <Badge variant={getScoreVariant(report.score)} className="text-lg px-3 py-1">
                  {report.score}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {report ? (
                <>
                  {report.count} packages analyzed{report.isLimited ? ` of ${report.total} total` : ""} • 
                  {report.criticalCount} critical • 
                  {report.warningCount} warnings • 
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
            {!report && !isAnalyzing && (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Paste your package.json to get started</p>
              </div>
            )}

            {isAnalyzing && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Analyzing packages...</p>
              </div>
            )}

      {report && (
              <div className="space-y-4">
                {/* Copy All Fixes Button */}
                {report.results.some(r => r.issues.some(i => i.fix)) && (
                  <Button onClick={copyAllFixes} className="w-full">
                    <Copy className="h-4 w-4 mr-2" />
                    Copy All Fixes
                  </Button>
                )}

                {/* License Summary */}
                {report.projectLicense && report.topLicenses && report.topLicenses.length > 0 && (
                  <Card className="mb-4">
                    <CardHeader>
                      <CardTitle className="text-sm">
                        📜 License Summary (Project: {report.projectLicense})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {report.topLicenses.slice(0, 6).map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span className="truncate" title={item.license}>
                              {item.license}
                            </span>
                            <span className="text-muted-foreground">
                              {item.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Package List with Inline Status */}
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {report.results.map((pkg) => {
                      const criticalIssues = pkg.issues.filter(i => i.level === 'critical');
                      const warningIssues = pkg.issues.filter(i => i.level === 'warning');
                      const infoIssues = pkg.issues.filter(i => i.level === 'info');
                      
                      // Find the corresponding parsed dependency to get the requested version
                      const parsedDep = parsedData?.deps.find(d => d.name === pkg.name);
                      const versionInfo = parsedDep?.requested ? analyzeVersionRange(parsedDep.requested) : null;
                      
                      return (
                        <div
                          key={`${pkg.name}@${pkg.version}`}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code 
                                className="font-mono text-sm font-semibold truncate"
                                title={`${pkg.name}@${pkg.version}`}
                              >
                                {pkg.name}@{pkg.version}
                              </code>
                              {pkg.latest && pkg.latest !== pkg.version && (
                                <span 
                                  className="text-xs text-muted-foreground"
                                  title={`Latest available version: ${pkg.latest}`}
                                >
                                  → {pkg.latest}
                                </span>
                              )}
                            </div>
                            
                            {/* Version Configuration Info */}
                            {versionInfo && (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-1">
                                  <Badge 
                                    variant={getRiskBadge(versionInfo.risk)} 
                                    className="text-xs flex items-center gap-1"
                                    title={`${versionInfo.description}. ${versionInfo.explanation} Example: ${versionInfo.example} Risk: ${versionInfo.risk.replace('-', ' ')}`}
                                  >
                                    {versionInfo.symbol === 'exact' ? (
                                      <>
                                        <Pin className="h-3 w-3" aria-hidden="true" />
                                       
                                      </>
                                    ) : (
                                      versionInfo.symbol
                                    )}
                                  </Badge>
                                  <button
                                    type="button"
                                    className="focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                    title={`${versionInfo.description}. ${versionInfo.explanation} Example: ${versionInfo.example} Risk: ${versionInfo.risk.replace('-', ' ')}`}
                                    aria-label={`Version range explanation: ${versionInfo.description}`}
                                  >
                                    <HelpCircle className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                                    <span className="sr-only">Version range explanation</span>
                                  </button>
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
                                    key={idx}
                                    variant="destructive"
                                    className="text-xs cursor-help"
                                    title={`Critical Issue: ${issue.msg}${issue.fix ? ` Fix: ${issue.fix}` : ''}`}
                                  >
                                    <Shield className="h-3 w-3 mr-1" aria-hidden="true" />
                                    {issue.kind}
                                  </Badge>
                                ))}
                                {warningIssues.map((issue, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="text-xs cursor-help"
                                    title={`Warning: ${issue.msg}${issue.fix ? ` Fix: ${issue.fix}` : ''}`}
                                  >
                                    <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                                    {issue.kind}
                                  </Badge>
                                ))}
                                {infoIssues.map((issue, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-xs cursor-help"
                                    title={`Information: ${issue.msg}${issue.fix ? ` Suggestion: ${issue.fix}` : ''}`}
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
                              <div 
                                title={`${criticalIssues.length} critical issue${criticalIssues.length > 1 ? 's' : ''}`}
                                aria-label={`${criticalIssues.length} critical security issue${criticalIssues.length > 1 ? 's' : ''}`}
                              >
                                <Shield className="h-4 w-4 text-red-500" />
                              </div>
                            )}
                            {warningIssues.length > 0 && !criticalIssues.length && (
                              <div 
                                title={`${warningIssues.length} warning${warningIssues.length > 1 ? 's' : ''}`}
                                aria-label={`${warningIssues.length} warning${warningIssues.length > 1 ? 's' : ''}`}
                              >
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                              </div>
                            )}
                            {infoIssues.length > 0 && !criticalIssues.length && !warningIssues.length && (
                              <div 
                                title={`${infoIssues.length} update suggestion${infoIssues.length > 1 ? 's' : ''}`}
                                aria-label={`${infoIssues.length} update suggestion${infoIssues.length > 1 ? 's' : ''}`}
                              >
                                <Info className="h-4 w-4 text-blue-500" />
                              </div>
                            )}
                            {pkg.issues.length === 0 && (
                              <div 
                                className="h-4 w-4 rounded-full bg-green-500"
                                title="No issues found"
                                aria-label="Package has no security issues"
                              ></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
