"use client";

import {
  Clock,
  ExternalLink,
  Package2,
  Scale,
  Shield,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CompetitorMapping } from "@/types/sponsors";

type SponsoredAlternativeProps = {
  mapping: CompetitorMapping;
  onDismiss?: () => void;
};

function getReasonIcon(reason: CompetitorMapping["reason"]) {
  switch (reason) {
    case "security":
      return <Shield className="h-4 w-4 text-red-500" />;
    case "performance":
      return <Zap className="h-4 w-4 text-blue-500" />;
    case "bundle-size":
      return <Package2 className="h-4 w-4 text-green-500" />;
    case "license":
      return <Scale className="h-4 w-4 text-orange-500" />;
    case "maintenance":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case "features":
      return <TrendingUp className="h-4 w-4 text-purple-500" />;
    default:
      return <Package2 className="h-4 w-4 text-gray-500" />;
  }
}

function formatReason(reason: CompetitorMapping["reason"]): string {
  switch (reason) {
    case "security":
      return "Security concerns";
    case "performance":
      return "Performance improvement";
    case "bundle-size":
      return "Bundle size optimization";
    case "license":
      return "License compatibility";
    case "maintenance":
      return "Better maintenance";
    case "features":
      return "Enhanced features";
    default:
      return "Alternative available";
  }
}

export function SponsoredAlternative({
  mapping,
  onDismiss,
}: SponsoredAlternativeProps) {
  const { competitorPackage, alternatives, reason, priority } = mapping;

  // For now, show the first alternative
  const alternative = alternatives[0];

  if (!alternative) return null;

  const handleNpmClick = () => {
    window.open(alternative.npmUrl, "_blank");
  };

  const priorityColor =
    priority === "high"
      ? "border-orange-200 bg-orange-50"
      : priority === "medium"
        ? "border-blue-200 bg-blue-50"
        : "border-gray-200 bg-gray-50";

  return (
    <Card className={`mt-2 border-l-4 ${priorityColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getReasonIcon(reason)}
            <CardTitle className="text-sm">Sponsored Alternative</CardTitle>
            <Badge variant="outline" className="text-xs">
              {formatReason(reason)}
            </Badge>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
        <CardDescription className="text-xs">
          Consider <strong>{alternative.name}</strong> as an alternative to{" "}
          <strong>{competitorPackage}</strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Alternative Package Info */}
          <div className="flex flex-col gap-1">
            <code className="font-mono text-sm font-semibold">
              {alternative.name}
            </code>
            <p className="text-xs text-muted-foreground">
              {alternative.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7"
              onClick={handleNpmClick}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View on npm
            </Button>
          </div>

          {/* Sponsor attribution */}
          <div className="text-xs text-gray-400 border-t pt-2">
            Sponsored by {alternative.sponsorName}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
