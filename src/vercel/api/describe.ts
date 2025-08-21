import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SCORE_CONFIG } from "../../score/utils/config"; 
import { computeTopNForStable, assertStable } from "../utils/scoreHelpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const stable = String(req.query.stable || "").toUpperCase();
  const platform = String(req.query.platform || "");
  try {
    assertStable(stable);
    if (!platform) throw new Error("platform is required");

    const top = await computeTopNForStable(stable as "USDC" | "USDT");
    const item = top.find(it => String(it.platform).toLowerCase() === platform.toLowerCase());
    if (!item) return res.status(404).json({ error: `platform '${platform}' not found in TOP${SCORE_CONFIG.topN}` });

    // Return raw structured JSON (decimal APYs as in your pipeline)
    return res.status(200).json({
      poolId: item.poolId,
      chain: item.chain,
      symbol: item.symbol,
      apy: item.apy,
      apyBase: item.apyBase,
      apyReward: item.apyReward,
      tvlUsd: item.tvlUsd,
      timestamp: item.timestamp,
      parser: item.parser,
      platform: item.platform,
      url: item.url ?? null
    });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || String(e) });
  }
}