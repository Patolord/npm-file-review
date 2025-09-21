"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Package } from "lucide-react";
import type { ChangeEvent } from "react";
import type { Dep } from "@/lib/lockfile";

type PackageInputProps = {
  packageText: string;
  onPackageTextChange: (text: string) => void;
  parsedData: { deps: Dep[]; projectLicense?: string } | null;
  isAnalyzing: boolean;
  error: string | null;
};

const PACKAGE_JSON_PLACEHOLDER = `{
  "name": "your-project",
  "dependencies": {
    "react": "^18.0.0",
    "lodash": "^4.17.20"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`;

export function PackageInput({
  packageText,
  onPackageTextChange,
  parsedData,
  isAnalyzing,
  error,
}: PackageInputProps) {
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onPackageTextChange(e.target.value);
  };

  return (
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
          placeholder={PACKAGE_JSON_PLACEHOLDER}
          value={packageText}
          onChange={handleTextChange}
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
  );
}
