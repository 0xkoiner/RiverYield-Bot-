import { CONFIG } from "../utils/config";
import type { Stable } from "../utils/stablecoinlist";
import { symbolMatchesStable } from "../utils/stablecoinlist";
import type { StableFileShape, PlatformPool } from "../utils/writeread";

async function fetchWithRetry(url: string, opts: RequestInit, tries = CONFIG.http.retries): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG.http.timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "content-type": "application/json", "user-agent": "yieldfy/1.0", ...(opts.headers||{}) } });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, CONFIG.http.backoffMs * (i + 1))); }
  }
  throw lastErr;
}

const PLATFORM = "compound-v3";

// Flexible query against community Compound v3 subgraphs.
// Different deployments may expose different field names; we request a minimal, widely supported set.
const QUERY = `
  query Pools {
    markets(first: 1000) {
      id
      chainId
      baseToken { symbol address }
      marketInfo { supplyApy }
      totals { totalSupplyUsd }
    }
  }
`;

type GqlRes = {
  data?: { markets: Array<{ id: string; chainId: number; baseToken: { symbol: string; address: string }; marketInfo?: { supplyApy?: number }; totals?: { totalSupplyUsd?: number } }> }
};

export async function parseCompoundByStable(stable: Stable): Promise<StableFileShape> {
  const urls = Object.values(CONFIG.compound.subgraphs).filter(Boolean) as string[];
  if (!urls.length) return {};

  const now = Date.now();
  const out: StableFileShape = {};

  // race the configured subgraphs, first to succeed wins
  let resp: Response | undefined;
  for (const url of urls) {
    try { resp = await fetchWithRetry(url, { method: "POST", body: JSON.stringify({ query: QUERY }) }); break; } catch { /* try next */ }
  }
  if (!resp) return {};

  let json: GqlRes | undefined; try { json = await resp.json(); } catch { return {}; }
  const pools: PlatformPool[] = [];

  for (const m of json?.data?.markets || []) {
    const sym = (m.baseToken?.symbol || "").toUpperCase();
    if (!symbolMatchesStable(sym, stable)) continue;
    const apy = typeof m.marketInfo?.supplyApy === "number" ? m.marketInfo!.supplyApy : undefined; // already decimal [0,1]
    pools.push({
      poolId: m.id,
      chain: String(m.chainId),
      symbol: sym,
      apy,
      apyBase: apy,
      apyReward: 0,
      tvlUsd: m.totals?.totalSupplyUsd,
      url: "https://app.compound.finance",
      timestamp: now
    });
  }

  if (pools.length) out[PLATFORM] = pools.sort((a,b) => (b.apy ?? 0) - (a.apy ?? 0));
  return out;
}