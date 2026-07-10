import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface AssetManifest {
  hash: string;
  base: string;
}

let manifest: AssetManifest | null = null;

function isDevAssets(): boolean {
  return process.env.CLIPPY_DEV === "1" || process.env.NODE_ENV !== "production";
}

export function loadAssetManifest(): AssetManifest {
  if (manifest && !isDevAssets()) return manifest;

  const manifestPath = join(process.cwd(), "dist", "asset-manifest.json");
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as AssetManifest;
    return manifest;
  }

  manifest = { hash: "dev", base: "/assets/dev" };
  return manifest;
}

export function asset(path: string): string {
  const m = loadAssetManifest();
  return `${m.base}/${path}`;
}

export function assetHash(): string {
  return loadAssetManifest().hash;
}

export function resetAssetManifest() {
  manifest = null;
}
