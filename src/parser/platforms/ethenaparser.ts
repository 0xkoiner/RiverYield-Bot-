import { CONFIG as EC } from "../utils/config";
import type { Stable as STB } from "../utils/stablecoinlist";
import type { StableFileShape as MapE, PlatformPool as PE } from "../utils/writeread";

const ETHENA_PLATFORM = "ethena";

// Minimal parser — Ethena's public APIs for APY require whitelisting.
// If EC.ethena.apyUrl is provided and returns a known structure, we parse it.
// Otherwise, we no‑op gracefully.
export async function parseEthenaByStable(stable: STB): Promise<MapE> {
  if (!EC.ethena.apyUrl) return {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), EC.http.timeoutMs);
    const r = await fetch(EC.ethena.apyUrl, { signal: ctrl.signal, headers: { "user-agent":"yieldfy/1.0" } });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json: any = await r.json();
    const now = Date.now();

    // Expecting something like { susdeApy: 0.12 } or { data: { apy: 12.3 } }
    const apyRaw = json?.susdeApy ?? json?.data?.apy ?? json?.apy;
    const apy = typeof apyRaw === "number" ? (apyRaw > 1 ? apyRaw/100 : apyRaw) : (typeof apyRaw === "string" ? (parseFloat(apyRaw)/100) : undefined);

    if (apy == null) return {};

    const pool: PE = {
      poolId: "ethena:susde",
      chain: "Ethereum",
      symbol: stable, // only include if querying USDC/USDT and you want to display sUSDe integrations later
      apy,
      apyBase: apy,
      apyReward: 0,
      tvlUsd: undefined,
      url: "https://app.ethena.fi/dashboards/apy",
      timestamp: now
    };

    return { [ETHENA_PLATFORM]: [pool] };
  } catch {
    return {};
  }
}