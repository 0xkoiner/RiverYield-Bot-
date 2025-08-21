export const CONFIG = {
  outputDir: "src/parser/data",
  llama: { poolsUrl: "https://yields.llama.fi/pools" },
  aave:  { graphqlUrl: "https://api.v3.aave.com/graphql" },
  // --- NEW: per‑platform endpoints/urls (customize as needed) ---
  compound: {
    // The Graph gateway URLs require an API key. Replace YOUR_KEY and IDs with real ones.
    // See community subgraphs repo & explorer for IDs.
    // mainnet example id sourced from explorer; add others (base, arb, op) as you like.
    subgraphs: {
      mainnet: "https://gateway.thegraph.com/api/YOUR_KEY/subgraphs/id/AwoxEZbiWLvv6e3QdvdMZw4WDURdGbvPfHmZRc8Dpfz9",
      base:    "https://gateway.thegraph.com/api/YOUR_KEY/subgraphs/id/REPLACE_WITH_BASE_ID"
    }
  },
  spark: {
    // Spark Lend (Aave v3 fork) subgraph on The Graph decentralized network
    mainnetSubgraph: "https://gateway.thegraph.com/api/YOUR_KEY/subgraphs/id/GbKdmBe4ycCYCQLQSjqGg6UHYoYfbyJyq5WrG35pv1si"
  },
  morpho: { graphqlUrl: "https://api.morpho.org/graphql" },
  curve: {
    // The Curve API has several flavors; we try these in order until one works.
    poolsUrls: [
      "https://api.curve.fi/api/getPools/ethereum/main",
      "https://api.curve.fi/api/getPools/all/ethereum",
      "https://api.curve.finance/v1/getPools/all"
    ]
  },
  yearn: { ydaemonBase: "https://ydaemon.yearn.fi" },
  ethena: {
    // Optional: if you have an internal/whitelisted feed, place it here
    // and ensure the parser knows how to read it. Otherwise the parser will no‑op gracefully.
    apyUrl: undefined as string | undefined
  },
  http:  { timeoutMs: 10_000, retries: 3, backoffMs: 400 },
  scheduler: { parseDelayMs: 250, concurrency: 2 }
} as const;