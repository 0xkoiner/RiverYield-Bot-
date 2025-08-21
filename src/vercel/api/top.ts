import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SCORE_CONFIG } from "../../score/utils/config"; 
import { computeTopNForStable, toRankDict, assertStable } from "../utils/scoreHelpers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stable = String(req.query.stable || "").toUpperCase();
  try {
    assertStable(stable);
    const top = await computeTopNForStable(stable as "USDC" | "USDT");
    // Return rank -> platform name dictionary
    return res.status(200).json(toRankDict(top));
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || String(e) });
  }
}