"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LicenseSummaryProps = {
  projectLicense?: string;
  topLicenses?: Array<{ license: string; count: number }>;
};

export function LicenseSummary({ projectLicense, topLicenses }: LicenseSummaryProps) {
  if (!projectLicense || !topLicenses || topLicenses.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">📜 License Summary (Project: {projectLicense})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {topLicenses.slice(0, 6).map((item, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="truncate" title={item.license}>
                {item.license}
              </span>
              <span className="text-muted-foreground">{item.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


