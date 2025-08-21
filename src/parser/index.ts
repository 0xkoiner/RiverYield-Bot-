import { CONFIG } from "./utils/config";
import { STABLES, type Stable } from "./utils/stablecoinlist";
import { writeParserFile } from "./utils/writeread";

import { parseDefiLlamaByStable } from "./platforms/defilamaparser";
import { parseAaveByStable } from "./platforms/aaveparser";
import { parseCompoundByStable } from "./platforms/compoundparser";
import { parseSparkByStable } from "./platforms/straklendparser";
import { parseMorphoByStable } from "./platforms/morphoparser";
import { parseCurveByStable } from "./platforms/curveparser";
import { parseYearnByStable } from "./platforms/yearnparser";
import { parseEthenaByStable } from "./platforms/ethenaparser";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

type ParserTuple = readonly [parserName: string, fn: (s: Stable) => Promise<Record<string, any[]>>];

const PARSERS: ParserTuple[] = [
  ["Defilama",  parseDefiLlamaByStable],
  ["Aave",      parseAaveByStable],
  ["Compound",  parseCompoundByStable],
  ["SparkLend", parseSparkByStable],
  ["Morpho",    parseMorphoByStable],
  ["Curve",     parseCurveByStable],
  ["Yearn",     parseYearnByStable],
  ["Ethena",    parseEthenaByStable],
];

async function runForStable(stable: Stable) {
  console.log(`[yieldfy] parsing all platforms for ${stable}...`);

  // kick all parsers at once for this stable
  const settled = await Promise.allSettled(PARSERS.map(([, fn]) => fn(stable)));

  // write each parser’s result to its own file
  const writes: Promise<void>[] = [];
  settled.forEach((res, i) => {
    const name = PARSERS[i][0];
    if (res.status === "fulfilled") {
      const data = res.value || {};
      writes.push(writeParserFile(stable, name, data));
    } else {
      console.warn(`[yieldfy] ${name} failed for ${stable}:`, res.reason);
    }
  });

  await Promise.allSettled(writes);
  console.log(`[yieldfy] wrote ${stable}* parser files: ${writes.length}/${PARSERS.length} succeeded.`);
}

async function main() {
  // Sequential per stable (simple I/O), each stable runs all parsers in parallel
  for (let i = 0; i < STABLES.length; i++) {
    await runForStable(STABLES[i]);
    if (i < STABLES.length - 1) await sleep(CONFIG.scheduler.parseDelayMs);
  }
}

main().catch((err) => {
  console.error("[yieldfy] fatal:", err);
  process.exit(1);
});