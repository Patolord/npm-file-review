"use client";

import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Result } from "@/types/report";

type TreeMapData = {
  name: string;
  size: number;
  result: Result;
  children?: TreeMapData[];
};

type TreeMapViewProps = {
  results: Result[];
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function getSeverityColor(result: Result): string {
  const criticalIssues = result.issues.filter(
    (issue) => issue.level === "critical",
  ).length;
  const warningIssues = result.issues.filter(
    (issue) => issue.level === "warning",
  ).length;

  if (criticalIssues > 0) return "#dc2626"; // red-600
  if (warningIssues > 0) return "#ea580c"; // orange-600
  return "#16a34a"; // green-600
}

export function TreeMapView({ results }: TreeMapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !results.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Prepare data for treemap
    const treeMapData: TreeMapData = {
      name: "root",
      size: 0,
      result: {} as Result,
      children: results.map((result) => ({
        name: result.name,
        size: result.size || 100000, // Use actual npm size
        result,
      })),
    };

    // Create hierarchy
    const root = d3
      .hierarchy(treeMapData, (d) => d.children)
      .sum((d) => d.size)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    // Create treemap layout
    const treemap = d3
      .treemap<TreeMapData>()
      .size([innerWidth, innerHeight])
      .padding(2)
      .round(true);

    treemap(root);

    // Type assertion for treemap nodes that have x0, y0, x1, y1 properties
    type TreeMapNode = d3.HierarchyNode<TreeMapData> & {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create tooltip
    const tooltip = d3.select(tooltipRef.current);

    // Draw rectangles
    const leaves = g
      .selectAll("g")
      .data(root.leaves() as TreeMapNode[])
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

    leaves
      .append("rect")
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("fill", (d) => getSeverityColor(d.data.result))
      .attr("fill-opacity", 0.7)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        // Highlight on hover
        d3.select(this).attr("fill-opacity", 0.9);

        // Show tooltip
        tooltip
          .style("opacity", 1)
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY - 10}px`)
          .html(`
            <div class="bg-white p-3 border rounded shadow-lg">
              <div class="font-semibold">${d.data.name}</div>
              <div class="text-sm text-gray-600">v${d.data.result.version}</div>
              <div class="text-sm">Size: ${formatBytes(d.data.result.size || 0)}</div>
              <div class="text-sm">Issues: ${d.data.result.issues.length}</div>
              ${d.data.result.license ? `<div class="text-sm">License: ${d.data.result.license}</div>` : ""}
            </div>
          `);
      })
      .on("mouseout", function () {
        d3.select(this).attr("fill-opacity", 0.7);
        tooltip.style("opacity", 0);
      });

    // Add text labels for larger rectangles
    leaves
      .filter((d) => d.x1 - d.x0 > 60 && d.y1 - d.y0 > 30)
      .append("text")
      .attr("x", 4)
      .attr("y", 16)
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .attr("fill", "#fff")
      .text((d) =>
        d.data.name.length > 12
          ? `${d.data.name.slice(0, 12)}...`
          : d.data.name,
      );

    // Add size labels for larger rectangles
    leaves
      .filter((d) => d.x1 - d.x0 > 80 && d.y1 - d.y0 > 50)
      .append("text")
      .attr("x", 4)
      .attr("y", 32)
      .attr("font-size", "10px")
      .attr("fill", "#fff")
      .attr("opacity", 0.8)
      .text((d) => formatBytes(d.data.size));
  }, [results]);

  const totalSize = results.reduce(
    (sum, result) => sum + (result.size || 0),
    0,
  );
  const criticalPackages = results.filter((r) =>
    r.issues.some((i) => i.level === "critical"),
  ).length;
  const warningPackages = results.filter((r) =>
    r.issues.some((i) => i.level === "warning"),
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Package Size Tree Map</span>
          <div className="flex gap-2">
            <Badge variant="destructive">{criticalPackages} Critical</Badge>
            <Badge variant="secondary">{warningPackages} Warnings</Badge>
          </div>
        </CardTitle>
        <CardDescription>
          Total size: {formatBytes(totalSize)} • Hover over rectangles for
          details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <svg ref={svgRef} className="w-full h-auto" viewBox="0 0 800 600" />
          <div
            ref={tooltipRef}
            className="absolute pointer-events-none opacity-0 transition-opacity z-10"
            style={{ position: "absolute" }}
          />
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-600 rounded"></div>
            <span>No Critical Issues</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-600 rounded"></div>
            <span>Warnings</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-600 rounded"></div>
            <span>Critical Issues</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
