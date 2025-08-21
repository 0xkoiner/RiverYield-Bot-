import { CONFIG as CFG } from "../utils/config";
import type { Stable as St } from "../utils/stablecoinlist";
import { symbolMatchesStable as okStable } from "../utils/stablecoinlist";
import type { StableFileShape as MapOut, PlatformPool as PoolOut } from "../utils/writeread";

const MORPHO_PLATFORM = "morpho";

// Query adapted from Morpho docs: https://docs.morpho.org/tools/offchain/api/morpho/
// We ask for market APYs, rewards, and USD supplies. Items do not expose chainId directly,
// but rewards.asset.chain.id is present when rewards exist. We default to Ethereum when absent.
const QUERY = `
  query Markets($first: Int = 500, $chains: [Int!]) {
    markets(
      first: $first
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
      where: { chainId_in: $chains }
    ) {
      items {
        uniqueKey
        loanAsset { address symbol decimals }
        collateralAsset { address symbol decimals }
        state {
          supplyApy
          avgSupplyApy
          avgNetSupplyApy
          supplyAssetsUsd
          utilization
          rewards {
            supplyApr
            borrowApr
            asset { address chain { id } }
          }
        }
      }
    }
  }
`;

type MarketsRes = {
  data?: {
    markets: {
      items: Array<{
        uniqueKey: string;
        loanAsset: { address: string; symbol: string; decimals: number };
        collateralAsset: { address: string; symbol: string; decimals: number };
        state: {
          supplyApy?: number | null;
          avgSupplyApy?: number | null;
          avgNetSupplyApy?: number | null;
          supplyAssetsUsd?: number | null;
          utilization?: number | null;
          rewards?: Array<{
            supplyApr?: number | null;
            borrowApr?: number | null;
            asset?: { address?: string; chain?: { id?: number } };
          }> | null;
        };
      }>;
    };
  };
};

const CHAIN_NAME: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  42161: "Arbitrum",
  43114: "Avalanche",
  8453: "Base",
};

async function gfetch(url: string, body: any) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CFG.http.timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      body: JSON.stringify(body),
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "user-agent": "yieldfy/1.0" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as MarketsRes;
  } finally {
    clearTimeout(t);
  }
}

export async function parseMorphoByStable(stable: St): Promise<MapOut> {
  // Query popular chains; adjust as you extend coverage
  const chains = [1, 8453, 42161, 10, 137, 43114];
  const json = await gfetch(CFG.morpho.graphqlUrl, { query: QUERY, variables: { first: 500, chains } });

  const now = Date.now();
  const rows: PoolOut[] = [];

  for (const m of json.data?.markets?.items || []) {
    const sym = (m.loanAsset?.symbol || "").toUpperCase();
    if (!okStable(sym, stable)) continue;

    // Prefer avgNetSupplyApy (includes rewards & fees over 6h) then avgSupplyApy then supplyApy.
    const apy = [m.state?.avgNetSupplyApy, m.state?.avgSupplyApy, m.state?.supplyApy]
      .map(v => (typeof v === "number" ? v : undefined))
      .find(v => v != null);

    // Sum rewards supply APRs if present (already decimal per docs).
    const rewardApr = (m.state?.rewards || [])
      .map(r => (typeof r?.supplyApr === "number" ? r!.supplyApr! : 0))
      .reduce((a, b) => a + b, 0);

    // Best-effort chain id from first rewards entry; default to Ethereum if absent
    const chainId = m.state?.rewards?.[0]?.asset?.chain?.id ?? 1;

    rows.push({
      poolId: m.uniqueKey,
      chain: CHAIN_NAME[chainId] || String(chainId),
      symbol: sym,
      apy: apy,
      apyBase: apy != null ? apy - rewardApr : undefined,
      apyReward: rewardApr || undefined,
      tvlUsd: typeof m.state?.supplyAssetsUsd === "number" ? m.state!.supplyAssetsUsd! : undefined,
      url: "https://app.morpho.org/",
      timestamp: now,
    });
  }

  const out: MapOut = {};
  if (rows.length) out[MORPHO_PLATFORM] = rows.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));
  return out;
}