import { CONFIG as CC } from "../utils/config";
import type { Stable as S } from "../utils/stablecoinlist";
import { symbolMatchesStable as symStable } from "../utils/stablecoinlist";
import type { StableFileShape as MapS, PlatformPool as Pool } from "../utils/writeread";

const CURVE_PLATFORM = "curve";

async function fetchJSON(url: string){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), CC.http.timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent":"yieldfy/1.0" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function parseCurveByStable(stable: S): Promise<MapS> {
  let payload: any | undefined;
  for (const url of CC.curve.poolsUrls) {
    try { payload = await fetchJSON(url); if (payload) break; } catch { /* try next */ }
  }
  if (!payload) return {};

  const list: any[] = (payload.data?.poolData || payload.data?.pools || payload.pools || []);
  const now = Date.now();
  const rows: Pool[] = [];

  for (const p of list) {
    const symbol: string = String(p.symbol || p.coins?.join("+") || "").toUpperCase();
    if (!symStable(symbol, stable)) continue;
    const apyPct = (p.apy || p.baseApy || p.latestDailyApy || p.gaugeCrvApy || 0); // best‑effort
    const apy = typeof apyPct === "number" ? (apyPct > 1 ? apyPct/100 : apyPct) : undefined;
    const tvl = typeof p.usdTotal === "number" ? p.usdTotal : (typeof p.tvl === "number" ? p.tvl : undefined);

    rows.push({
      poolId: String(p.address || p.id || p.pool || symbol),
      chain: String(p.chain || p.network || "Ethereum"),
      symbol,
      apy,
      apyBase: apy,
      apyReward: undefined,
      tvlUsd: tvl,
      url: p.url || p.poolUrl || "https://curve.fi/",
      timestamp: now
    });
  }

  const out: MapS = {}; if (rows.length) out[CURVE_PLATFORM] = rows.sort((a,b)=>(b.apy??0)-(a.apy??0)); return out;
}