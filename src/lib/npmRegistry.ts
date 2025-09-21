import type { Result } from "@/types/report";

export type PackageSizeInfo = {
  name: string;
  version: string;
  size: number;
  gzipSize?: number;
  error?: string;
};

// Cache for package sizes to avoid repeated API calls
const sizeCache = new Map<string, PackageSizeInfo>();

// Threshold for grouping small packages (500KB)
const SIZE_THRESHOLD = 500 * 1024;

/**
 * Fetch package size from npm registry
 */
async function fetchPackageSize(
  name: string,
  version: string,
): Promise<PackageSizeInfo> {
  const cacheKey = `${name}@${version}`;

  // Return cached result if available
  if (sizeCache.has(cacheKey)) {
    const cached = sizeCache.get(cacheKey);
    if (cached) return cached;
  }

  try {
    // First, get the package metadata to find the tarball URL
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const response = await fetch(registryUrl);

    if (!response.ok) {
      throw new Error(`Registry response: ${response.status}`);
    }

    const data = await response.json();
    const dist = data.dist;

    if (!dist || !dist.tarball) {
      throw new Error("No tarball found in registry data");
    }

    // Get size from the dist object (unpackedSize is usually available)
    let size = dist.unpackedSize || 0;
    const gzipSize = dist.fileCount || undefined;

    // If unpackedSize is not available, estimate from tarball size
    if (!size && dist.tarball) {
      // We could fetch the tarball to get actual size, but that's expensive
      // Instead, use a reasonable estimate (tarball is usually ~20-30% of unpacked)
      const tarballSize = await fetchTarballSize(dist.tarball);
      size = Math.round(tarballSize * 3.5); // Estimate unpacked size
    }

    // If still no size, we simply don't have size data - don't estimate
    if (!size) {
      // We'll indicate this package has no size data available
      size = 0;
    }

    const result: PackageSizeInfo = {
      name,
      version,
      size,
      gzipSize,
    };

    // Cache the result
    sizeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    const errorResult: PackageSizeInfo = {
      name,
      version,
      size: 0,
      error: error instanceof Error ? error.message : String(error),
    };

    // Cache error results to avoid retry spam
    sizeCache.set(cacheKey, errorResult);
    return errorResult;
  }
}

/**
 * Fetch tarball size by making a HEAD request
 */
async function fetchTarballSize(tarballUrl: string): Promise<number> {
  try {
    const response = await fetch(tarballUrl, { method: "HEAD" });
    const contentLength = response.headers.get("content-length");
    return contentLength ? parseInt(contentLength, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Get actual package metadata for deterministic analysis
 */
async function getPackageMetadata(name: string, version: string) {
  try {
    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const response = await fetch(registryUrl);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch sizes for multiple packages with rate limiting
 */
export async function fetchPackageSizes(results: Result[]): Promise<Result[]> {
  // Fetch sizes for all packages in parallel with rate limiting
  const sizePromises = results.map(async (result, index) => {
    // Add small delay to avoid overwhelming the API (stagger requests)
    await new Promise((resolve) => setTimeout(resolve, index * 50));
    return fetchPackageSize(result.name, result.version);
  });

  const sizeInfos = await Promise.all(sizePromises);

  // Merge size info back into results
  const resultsWithSizes = results.map((result, index) => ({
    ...result,
    size: sizeInfos[index]?.size || 0,
  }));

  // Sort by size (largest first) for better visualization
  return resultsWithSizes.sort((a, b) => (b.size || 0) - (a.size || 0));
}

/**
 * Group small packages into "Others" category after fetching sizes
 */
export function groupSmallPackages(results: Result[]): Result[] {
  // Separate large packages from small ones
  const largePackages: Result[] = [];
  const smallPackages: Result[] = [];

  for (const result of results) {
    if ((result.size || 0) >= SIZE_THRESHOLD) {
      largePackages.push(result);
    } else {
      smallPackages.push(result);
    }
  }

  // If we have small packages, create an "Others" aggregate
  if (smallPackages.length > 1) {
    // Only group if we have multiple small packages
    const totalSmallSize = smallPackages.reduce(
      (sum, pkg) => sum + (pkg.size || 0),
      0,
    );
    const totalIssues = smallPackages.flatMap((pkg) => pkg.issues);

    // Count issue types
    const criticalIssues = totalIssues.filter(
      (issue) => issue.level === "critical",
    );
    const warningIssues = totalIssues.filter(
      (issue) => issue.level === "warning",
    );
    const infoIssues = totalIssues.filter((issue) => issue.level === "info");

    const othersPackage: Result = {
      name: `Others (${smallPackages.length} packages)`,
      version: "mixed",
      size: totalSmallSize,
      issues: [
        ...criticalIssues.slice(0, 5), // Limit to prevent UI overflow
        ...warningIssues.slice(0, 10),
        ...infoIssues.slice(0, 5),
      ],
      license: `${new Set(smallPackages.map((p) => p.license).filter(Boolean)).size} different licenses`,
    };

    return [...largePackages, othersPackage];
  }

  // If only one small package or no small packages, return all individually
  return [...largePackages, ...smallPackages];
}

/**
 * Get cached size info for a package (useful for debugging)
 */
export function getCachedSize(
  name: string,
  version: string,
): PackageSizeInfo | undefined {
  return sizeCache.get(`${name}@${version}`);
}

/**
 * Clear the size cache
 */
export function clearSizeCache(): void {
  sizeCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: sizeCache.size,
    entries: Array.from(sizeCache.entries()).map(([key, value]) => ({
      package: key,
      size: value.size,
      error: value.error,
    })),
  };
}
