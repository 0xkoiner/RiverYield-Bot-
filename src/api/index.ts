import express from "express";
import { promises as fs } from "fs";
import * as path from "path";
import { runTsScript } from "./utils/run";
import { SCORE_CONFIG } from "../score/utils/config";
import type { TopRow } from "../score/utils/types";
import { pct, usd } from "./utils/format";

const app = express();
app.use(express.json());

const STABLES = new Set(["USDC", "USDT"]);

function topFilePath(stable: string) {
  return path.join(SCORE_CONFIG.outputDir, `${stable}TOP${SCORE_CONFIG.topN}.json`);
}

async function readTop(stable: string): Promise<{ items: TopRow[] } | null> {
  try {
    const raw = await fs.readFile(topFilePath(stable), "utf8");
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.items)) return json;
  } catch {}
  return null;
}

// POST /api/top?stable=USDC  -> runs parser + score, returns rank→name dict
app.post("/api/top", async (req, res) => {
    try {
      const stable = String(req.query.stable || "").toUpperCase();
      if (!STABLES.has(stable)) return res.status(400).json({ error: "stable must be USDC or USDT" });
  
      // 1) run parser (all platforms)
      await runTsScript("src/parser/index.ts");
      // 2) run score (respects SCORE_CONFIG.topN)
      await runTsScript("src/score/index.ts");
      // 3) read the freshly written TOP file
      const top = await readTop(stable);
      if (!top) return res.status(500).json({ error: "TOP file not found after scoring" });
  
      // build rank→platform-name dict
      const dict: Record<string, string> = {};
      top.items.forEach((it: TopRow, idx: number) => {
        dict[String(idx + 1)] = String(it.platform);
      });
  
      return res.json(dict);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

// GET /api/describe?stable=USDC&platform=yearn-finance
// Returns the raw JSON item details (no human text)
app.get("/api/describe", async (req, res) => {
    try {
      const stable = String(req.query.stable || "").toUpperCase();
      const platform = String(req.query.platform || "");
      if (!STABLES.has(stable)) return res.status(400).json({ error: "stable must be USDC or USDT" });
      if (!platform) return res.status(400).json({ error: "platform is required" });
  
      const top = await readTop(stable);
      if (!top) return res.status(404).json({ error: "TOP file not found. Run /api/top first." });
  
      const item = top.items.find((it: TopRow) => String(it.platform).toLowerCase() === platform.toLowerCase());
      if (!item) return res.status(404).json({ error: `platform '${platform}' not found in TOP${SCORE_CONFIG.topN}` });
  
      // return the raw item (plus url if missing -> null for consistency)
      return res.json({
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
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});