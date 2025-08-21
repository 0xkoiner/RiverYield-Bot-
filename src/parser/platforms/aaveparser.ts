import { CONFIG } from "../utils/config";
import type { Stable } from "../utils/stablecoinlist";
import { symbolMatchesStable } from "../utils/stablecoinlist";
import type { StableFileShape, PlatformPool } from "../utils/writeread";

// minimal retrying fetch (mirrors defilama)
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
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, CONFIG.http.backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

// map common chainIds to human labels for display
const CHAIN_NAME: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  42161: "Arbitrum",
  43114: "Avalanche",
  8453: "Base",
  11155111: "Sepolia"
};

// defensive APY normalizer (PercentValue may come as number|string|object)
function normApy(raw: any): number | undefined {
  if (raw == null) return undefined;
  const take = (v: number) => (v > 1 ? v / 100 : v); // if 3.5 → 0.035 ; if 0.035 → 0.035
  if (typeof raw === "number") return take(raw);
  if (typeof raw === "string") {
    const v = parseFloat(raw.replace("%",""));
    return Number.isFinite(v) ? take(v) : undefined;
  }
  if (typeof raw === "object") {
    if (typeof raw.percentage === "number") return take(raw.percentage);
    if (typeof raw.value === "number")     return take(raw.value);
    if (typeof raw.value === "string") {
      const v = parseFloat(raw.value);
      return Number.isFinite(v) ? take(v) : undefined;
    }
  }
  return undefined;
}

// GraphQL: list markets → their supply reserves (we filter to USDC/USDT client-side)
const QUERY = `
  query AaveSupplyReserves {
    markets {
      supplyReserves {
        market { address chainId }
        underlyingToken { symbol address }
        aToken { symbol address }
        supplyInfo { apy }
      }
    }
  }
`;

type GqlRes = {
  data?: {
    markets: {
      supplyReserves: {
        market: { address: string; chainId: number };
        underlyingToken: { symbol: string; address: string };
        aToken: { symbol: string; address: string };
        supplyInfo: { apy: any };
      }[];
    }[];
  };
};

export async function parseAaveByStable(stable: Stable): Promise<StableFileShape> {
  const resp = await fetchWithRetry(CONFIG.aave.graphqlUrl, {
    method: "POST",
    body: JSON.stringify({ query: QUERY })
  });
  const json = (await resp.json()) as GqlRes;

  const now = Date.now();
  const out: StableFileShape = {};
  const PLATFORM = "aave-v3";

  for (const m of json.data?.markets || []) {
    for (const r of m.supplyReserves || []) {
      const sym = (r.underlyingToken?.symbol || "").toUpperCase();
      if (!symbolMatchesStable(sym, stable)) continue;

      const apy = normApy(r.supplyInfo?.apy);
      const pool: PlatformPool = {
        poolId: `${r.market.address}:${r.underlyingToken.address}`.toLowerCase(),
        chain: CHAIN_NAME[r.market.chainId] || String(r.market.chainId),
        symbol: sym,              // e.g. "USDC" | "USDT"
        apy,                      // base APY (Aave supply APY)
        apyBase: apy,
        apyReward: 0,
        tvlUsd: undefined,        // can be added later via market size if needed
        url: "https://app.aave.com/markets",
        timestamp: now
      };

      if (!out[PLATFORM]) out[PLATFORM] = [];
      out[PLATFORM].push(pool);
    }
  }

  // Sort highest APY first inside the platform
  if (out[PLATFORM]) out[PLATFORM].sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
  return out;
}