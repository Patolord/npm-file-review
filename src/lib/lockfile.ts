import YAML from "yaml";

export type Dep = { name: string; version: string; requested?: string };

export function detectFileKind(fileName: string, text: string) {
  if (fileName.endsWith("package-lock.json")) return "npm-lock";
  if (fileName.endsWith("pnpm-lock.yaml") || fileName.endsWith("pnpm-lock.yml")) return "pnpm-lock";
  if (fileName.endsWith("package.json")) return "pkg-json";
  return "unknown";
}

// package.json
export function parsePackageJson(text: string): { deps: Dep[]; projectLicense?: string } {
  const j = JSON.parse(text);
  const deps: Dep[] = [];
  const add = (obj?: Record<string, string>) => {
    if (!obj) return;
    for (const [name, requested] of Object.entries(obj)) {
      deps.push({ name, version: requested.replace(/^[^\d]*/, ""), requested });
    }
  };
  add(j.dependencies);
  add(j.devDependencies);
  return { deps, projectLicense: j.license as string | undefined };
}

// npm v2+ lockfile
export function parseNpmLock(text: string): Dep[] {
  const j = JSON.parse(text);
  // npm v7+ has "packages" map keyed by paths ("" is root). Each entry may have name, version.
  const packages = j.packages ?? {};
  const deps: Dep[] = [];
  for (const [path, meta] of Object.entries<any>(packages)) {
    const name = meta?.name;
    const version = meta?.version;
    if (name && version) deps.push({ name, version });
  }
  if (deps.length === 0 && j.dependencies) {
    // fallback older structure
    const walk = (obj: any) => {
      for (const [name, meta] of Object.entries<any>(obj)) {
        if (meta?.version) deps.push({ name, version: meta.version });
        if (meta?.dependencies) walk(meta.dependencies);
      }
    };
    walk(j.dependencies);
  }
  return uniqueByNameVersion(deps);
}

// pnpm lockfile
export function parsePnpmLock(text: string): Dep[] {
  const y = YAML.parse(text);
  const packages = y.packages ?? {};
  const deps: Dep[] = [];
  for (const [key, meta] of Object.entries<any>(packages)) {
    // key like "/lodash@4.17.21"
    const m = /^\/(.+?)@(.+)$/.exec(key);
    if (!m) continue;
    let name = m[1];
    const version = meta?.resolution?.version ?? m[2];
    // handle alias "npm:actualName@version"
    if (name.startsWith("npm:")) {
      const mm = /^npm:([^@]+)@?(.+)?$/.exec(name);
      if (mm) {
        name = mm[1];
      }
    }
    if (name && version) deps.push({ name, version });
  }
  return uniqueByNameVersion(deps);
}

function uniqueByNameVersion(arr: Dep[]): Dep[] {
  const set = new Set<string>();
  const out: Dep[] = [];
  for (const d of arr) {
    const k = `${d.name}@${d.version}`;
    if (!set.has(k)) { set.add(k); out.push(d); }
  }
  return out;
}
