import { CONFIG } from "../utils/config";
import type { Stable } from "../utils/stablecoinlist";
import { symbolMatchesStable } from "../utils/stablecoinlist";
import type { StableFileShape, PlatformPool } from "../utils/writeread";

// Minimal fetch with timeout + retries
async function fetchWithRetry(url: string, opts: RequestInit, tries = CONFIG.http.retries): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.http.timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'user-agent': 'yieldfy/1.0', ...(opts.headers || {}) } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, CONFIG.http.backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

// Types per DefiLlama Yields API (subset we use)
type LlamaPool = {
  pool: string;        // unique id
  project: string;     // platform name, e.g., 'aave-v3'
  chain: string;       // e.g., 'Ethereum'
  symbol: string;      // e.g., 'USDC', 'USDC+USDT', 'aUSDC'
  apy?: number | null;       // percentage, e.g., 3.45
  apyBase?: number | null;   // percentage
  apyReward?: number | null; // percentage
  tvlUsd?: number | null;
  url?: string | null;
};

export async function parseDefiLlamaByStable(stable: Stable): Promise<StableFileShape> {
  const res = await fetchWithRetry(CONFIG.llama.poolsUrl, { method: 'GET' });
  const json = await res.json() as { data: LlamaPool[] };
  const now = Date.now();

  const platformMap: StableFileShape = {};

  for (const p of json.data || []) {
    if (!p.symbol) continue;
    if (!symbolMatchesStable(p.symbol, stable)) continue;

    const pool: PlatformPool = {
      poolId: p.pool,
      chain: p.chain,
      symbol: p.symbol,
      apy: (p.apy ?? undefined) != null ? (Number(p.apy) / 100) : undefined,
      apyBase: (p.apyBase ?? undefined) != null ? (Number(p.apyBase) / 100) : undefined,
      apyReward: (p.apyReward ?? undefined) != null ? (Number(p.apyReward) / 100) : undefined,
      tvlUsd: (p.tvlUsd ?? undefined) != null ? Number(p.tvlUsd) : undefined,
      url: p.url ?? undefined,
      timestamp: now
    };

    const key = p.project || "unknown";
    if (!platformMap[key]) platformMap[key] = [];
    platformMap[key].push(pool);
  }

  return platformMap;
}