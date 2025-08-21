import { CONFIG as CONFIG2 } from "../utils/config";
import type { Stable as Stable2 } from "../utils/stablecoinlist";
import { symbolMatchesStable as symOk } from "../utils/stablecoinlist";
import type { StableFileShape as SFS, PlatformPool as PP } from "../utils/writeread";

const SPARK_PLATFORM = "spark-lend";

const SPARK_QUERY = `
  query SparkSupplyReserves {
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

type SparkRes = { data?: { markets: { supplyReserves: { market:{address:string;chainId:number}; underlyingToken:{symbol:string;address:string}; aToken:{symbol:string;address:string}; supplyInfo:{apy:any} }[] }[] } };

async function fetchRetry(url: string, opts: RequestInit, tries = CONFIG2.http.retries): Promise<Response> {
  let e:any; for (let i=0;i<tries;i++){ const c=new AbortController(); const t=setTimeout(()=>c.abort(), CONFIG2.http.timeoutMs); try{ const r=await fetch(url,{...opts,signal:c.signal,headers:{"content-type":"application/json","user-agent":"yieldfy/1.0",...(opts.headers||{})}}); clearTimeout(t); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r;}catch(err){e=err; await new Promise(r=>setTimeout(r, CONFIG2.http.backoffMs*(i+1)));}} throw e; }

function normApy(raw:any){ if(raw==null) return undefined; if(typeof raw==="number") return raw>1?raw/100:raw; if(typeof raw==="string"){ const v=parseFloat(raw.replace("%","")); return Number.isFinite(v)?(v>1?v/100:v):undefined } if(typeof raw==="object"){ const v = (typeof raw.percentage==="number"?raw.percentage: (typeof raw.value==="number"?raw.value: (typeof raw.value==="string"?parseFloat(raw.value):undefined))); return v!=null?(v>1?v/100:v):undefined } return undefined; }

export async function parseSparkByStable(stable: Stable2): Promise<SFS> {
  const url = CONFIG2.spark.mainnetSubgraph;
  if (!url) return {};
  const resp = await fetchRetry(url, { method: "POST", body: JSON.stringify({ query: SPARK_QUERY }) });
  const json = await resp.json() as SparkRes;
  const now = Date.now();
  const arr: PP[] = [];

  for (const m of json.data?.markets || []) {
    for (const r of m.supplyReserves || []) {
      const sym = (r.underlyingToken?.symbol || "").toUpperCase();
      if (!symOk(sym, stable)) continue;
      const apy = normApy(r.supplyInfo?.apy);
      arr.push({
        poolId: `${r.market.address}:${r.underlyingToken.address}`.toLowerCase(),
        chain: String(r.market.chainId),
        symbol: sym,
        apy,
        apyBase: apy,
        apyReward: 0,
        tvlUsd: undefined,
        url: "https://spark.fi/",
        timestamp: now
      });
    }
  }
  const out: SFS = {}; if (arr.length) out[SPARK_PLATFORM] = arr.sort((a,b)=>(b.apy??0)-(a.apy??0)); return out;
}