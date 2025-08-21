import { promises as fs } from "fs";
import * as path from "path";
import { SCORE_CONFIG } from "./utils/config";
import type { StableFileShape, TopRow, PlatformPool } from "./utils/types";

const STABLES = ["USDC", "USDT"] as const;
type Stable = typeof STABLES[number];

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function isJsonFileForStable(filename: string, stable: Stable): boolean {
  return new RegExp(`^${stable}.*\\.json$`, "i").test(filename);
}

function parserNameFromFile(stable: Stable, filename: string): string {
  // e.g., USDCDefilama.json -> Defilama
  return filename.replace(new RegExp(`^${stable}`), "").replace(/\.json$/i, "");
}

// --- NEW: single-asset stable filter (no LP pairs) ---
function isSingleTokenStableSymbol(symbol: string | undefined, stable: Stable): boolean {
  if (!symbol) return false;
  const sym = symbol.toUpperCase().replace(/\s+/g, "");

  // reject common LP separators
  if (/[+\-\/]/.test(sym)) return false;

  // Accept common wrappers/aliases that clearly denote the stable asset.
  // USDC: allow USDC, USDC.E, AXLUSDC, aUSDC, sUSDC, USDbC, etc.
  // USDT: allow USDT, USDT.E, AXLUSDT, aUSDT, sUSDT, etc.
  if (stable === "USDC") {
    // USDC or USDbC anywhere in the string, e.g., aUSDC, sUSDC, axlUSDC, USDC.e
    if (/(USDC|USDBC)/.test(sym)) return true;
    return false;
  } else {
    // USDT and typical wrappers
    if (/USDT/.test(sym)) return true;
    return false;
  }
}

async function readStableParserFile(fullPath: string): Promise<StableFileShape | null> {
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as StableFileShape;
  } catch {
    // ignore bad file
  }
  return null;
}

function flattenMap(map: StableFileShape, parser: string, stable: Stable): TopRow[] {
  const out: TopRow[] = [];
  for (const [platform, pools] of Object.entries(map)) {
    for (const p of pools || []) {
      // must be single-asset for the requested stable
      if (!isSingleTokenStableSymbol(p?.symbol, stable)) continue;
      if (p.apy == null || Number.isNaN(p.apy)) continue; // require APY
      out.push({ ...(p as PlatformPool), parser, platform });
    }
  }
  return out;
}

function dedupeKeepHighest(rows: TopRow[]): TopRow[] {
  // Deduplicate across aggregator/direct by (platform|chain|symbol)
  const best = new Map<string, TopRow>();
  for (const r of rows) {
    const key = `${r.platform}|${r.chain}|${r.symbol}`;
    const prev = best.get(key);
    if (!prev || (r.apy ?? 0) > (prev.apy ?? 0)) best.set(key, r);
  }
  return Array.from(best.values());
}

function takeTopN(rows: TopRow[]): TopRow[] {
  const n = Math.max(1, Math.floor(SCORE_CONFIG.topN || 10));
  const sorted = rows.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
  return sorted.slice(0, n);
}

async function computeTopNForStable(stable: Stable): Promise<TopRow[]> {
  const files = await fs.readdir(SCORE_CONFIG.inputDir);
  const mine = files.filter(f => isJsonFileForStable(f, stable));

  const allRows: TopRow[] = [];
  for (const file of mine) {
    const parser = parserNameFromFile(stable, file);
    const full = path.join(SCORE_CONFIG.inputDir, file);
    const map = await readStableParserFile(full);
    if (!map) continue;
    allRows.push(...flattenMap(map, parser, stable));
  }

  const deduped = dedupeKeepHighest(allRows);
  return takeTopN(deduped);
}

async function writeTopFile(stable: Stable, rows: TopRow[]) {
  await ensureDir(SCORE_CONFIG.outputDir);
  const file = path.join(SCORE_CONFIG.outputDir, `${stable}TOP${SCORE_CONFIG.topN}.json`);
  const payload = {
    stable,
    generatedAt: new Date().toISOString(),
    count: rows.length,
    items: rows
  };
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function main() {
  const n = Math.max(1, Math.floor(SCORE_CONFIG.topN || 10));
  for (const s of STABLES) {
    console.log(`[score] computing TOP${n} for ${s} (single-asset only)...`);
    const top = await computeTopNForStable(s);
    await writeTopFile(s, top);
    console.log(`[score] wrote ${s}TOP${SCORE_CONFIG.topN}.json with ${top.length} items.`);
  }
}

main().catch(err => { console.error("[score] fatal:", err); process.exit(1); });