import { CONFIG as YC } from "../utils/config";
import type { Stable as ST } from "../utils/stablecoinlist";
import { symbolMatchesStable as stableOk } from "../utils/stablecoinlist";
import type { StableFileShape as MOut, PlatformPool as POut } from "../utils/writeread";

const YEARN_PLATFORM = "yearn-v3";

async function yget(path: string){
  const url = `${YC.yearn.ydaemonBase}/1/vaults/all`;
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), YC.http.timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent":"yieldfy/1.0" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function parseYearnByStable(stable: ST): Promise<MOut> {
  const data = await yget("/1/vaults/all") as any[];
  const now = Date.now();
  const rows: POut[] = [];
  for (const v of data) {
    const sym = String(v?.token?.symbol || v?.underlyingToken?.symbol || v?.symbol || "").toUpperCase();
    if (!stableOk(sym, stable)) continue;
    // yDaemon exposes apy fields usually under v.apy.net_apy; sometimes under v.apy.netApy
    const apyRaw = v?.apy?.net_apy ?? v?.apy?.netApy ?? v?.apy?.net ?? undefined;
    const apy = typeof apyRaw === "number" ? apyRaw : (typeof apyRaw === "string" ? parseFloat(apyRaw) : undefined);
    rows.push({
      poolId: String(v?.address || v?.vault?.address || v?.id || sym).toLowerCase(),
      chain: "1",
      symbol: sym,
      apy,
      apyBase: apy,
      apyReward: 0,
      tvlUsd: typeof v?.tvl?.tvl === "number" ? v.tvl.tvl : (typeof v?.tvl === "number" ? v.tvl : undefined),
      url: v?.details?.apy?.metadata?.displayName ? `https://yearn.fi/vaults/${v.address}` : "https://yearn.fi/",
      timestamp: now
    });
  }
  const out: MOut = {}; if (rows.length) out[YEARN_PLATFORM] = rows.sort((a,b)=>(b.apy??0)-(a.apy??0)); return out;
}