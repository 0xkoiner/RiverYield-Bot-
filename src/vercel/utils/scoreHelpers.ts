import { SCORE_CONFIG } from "../../score/utils/config"; 
import { parseDefiLlamaByStable } from "../../parser/platforms/defilamaparser"; 
import { parseAaveByStable } from "../../parser/platforms/aaveparser";
import { parseCompoundByStable } from "../../parser/platforms/compoundparser";
import { parseSparkByStable } from "../../parser/platforms/straklendparser";
import { parseMorphoByStable } from "../../parser/platforms/morphoparser";
import { parseCurveByStable } from "../../parser/platforms/curveparser";
import { parseYearnByStable } from "../../parser/platforms/yearnparser";
import { parseEthenaByStable } from "../../parser/platforms/ethenaparser";

export type Stable = "USDC" | "USDT";

export type PlatformPool = {
  poolId: string;
  chain: string;
  symbol: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
  url?: string;
  timestamp: number;
};

export type StableFileShape = Record<string, PlatformPool[]>;
export type TopRow = PlatformPool & { parser: string; platform: string };

const PARSERS: Array<[string, (s: Stable) => Promise<StableFileShape>]> = [
  ["Defilama",  parseDefiLlamaByStable],
  ["Aave",      parseAaveByStable],
  ["Compound",  parseCompoundByStable],
  ["SparkLend", parseSparkByStable],
  ["Morpho",    parseMorphoByStable],
  ["Curve",     parseCurveByStable],
  ["Yearn",     parseYearnByStable],
  ["Ethena",    parseEthenaByStable],
];

export function assertStable(s: string): asserts s is Stable {
  if (s !== "USDC" && s !== "USDT") throw new Error("stable must be USDC or USDT");
}

// accept wrappers (USDbC, aUSDC, sUSDT, USDC.e, axlUSDC) but reject LP separators
function isSingleTokenStableSymbol(symbol: string | undefined, stable: Stable): boolean {
  if (!symbol) return false;
  const sym = symbol.toUpperCase().replace(/\s+/g, "");
  if (/[+\-\/]/.test(sym)) return false; // LP-like
  if (stable === "USDC") return /(USDC|USDBC)/.test(sym);
  return /USDT/.test(sym);
}

function flattenMaps(maps: StableFileShape[], parserNames: string[], stable: Stable): TopRow[] {
  const rows: TopRow[] = [];
  maps.forEach((m, i) => {
    const parser = parserNames[i];
    for (const [platform, pools] of Object.entries(m || {})) {
      for (const p of pools || []) {
        if (!isSingleTokenStableSymbol(p?.symbol, stable)) continue;
        if (p.apy == null || Number.isNaN(p.apy)) continue;
        rows.push({ ...p, parser, platform });
      }
    }
  });
  return rows;
}

function dedupeKeepHighest(rows: TopRow[]): TopRow[] {
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

export async function computeTopNForStable(stable: Stable): Promise<TopRow[]> {
  const results = await Promise.allSettled(PARSERS.map(([, fn]) => fn(stable)));
  const maps: StableFileShape[] = [];
  const names: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") { maps.push(r.value); names.push(PARSERS[i][0]); }
  });
  const flat = flattenMaps(maps, names, stable);
  return takeTopN(dedupeKeepHighest(flat));
}

export function toRankDict(top: TopRow[]): Record<string, string> {
  const dict: Record<string, string> = {};
  top.forEach((it, i) => { dict[String(i + 1)] = it.platform; });
  return dict;
}