import { promises as fs } from "fs";
import * as path from "path";
import { CONFIG } from "./config";
import type { Stable } from "./stablecoinlist";

export type PlatformPool = {
  poolId: string;       // unique id (protocol/pool)
  chain: string;        // e.g., "Ethereum", "Base"
  symbol: string;       // e.g., "USDC", "USDC+USDT", "aUSDC"
  apy?: number;         // decimal (0.05 = 5%)
  apyBase?: number;     // decimal
  apyReward?: number;   // decimal
  tvlUsd?: number;
  url?: string;
  timestamp: number;    // ms
};

// Keep platform grouping inside each parser file (esp. helpful for DefiLlama)
export type StableFileShape = Record<string, PlatformPool[]>; // { platform_name: [pools...] }

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function filePathFor(stable: Stable, parserName: string) {
  // e.g., USDCDefilama.json, USDTMorpho.json
  return path.join(CONFIG.outputDir, `${stable}${parserName}.json`);
}

export async function readParserFile(stable: Stable, parserName: string): Promise<StableFileShape> {
  await ensureDir(CONFIG.outputDir);
  const file = filePathFor(stable, parserName);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as StableFileShape;
  } catch { /* ignore (missing file) */ }
  return {};
}

function mergePlatformPools(existing: PlatformPool[] = [], incoming: PlatformPool[]): PlatformPool[] {
  const byPool = new Map<string, PlatformPool>();
  for (const p of existing) byPool.set(p.poolId, p);
  for (const p of incoming) byPool.set(p.poolId, p); // incoming overwrites by poolId
  return Array.from(byPool.values()).sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
}

export async function writeParserFile(
  stable: Stable,
  parserName: string,
  data: StableFileShape
): Promise<void> {
  await ensureDir(CONFIG.outputDir);
  const file = filePathFor(stable, parserName);

  // Merge with existing content for idempotency
  const current = await readParserFile(stable, parserName);
  const merged: StableFileShape = { ...current };
  for (const [platform, pools] of Object.entries(data)) {
    merged[platform] = mergePlatformPools(current[platform], pools);
  }

  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
  await fs.rename(tmp, file);
}