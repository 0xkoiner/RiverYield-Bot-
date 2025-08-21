export type PlatformPool = {
    poolId: string;
    chain: string;
    symbol: string;
    apy?: number;
    apyBase?: number;
    apyReward?: number;
    tvlUsd?: number;
    url?: string;
    timestamp: number;
  };
  
  export type StableFileShape = Record<string, PlatformPool[]>; // { platform_name: [pools...] }
  
  export type TopRow = PlatformPool & {
    parser: string;      // e.g., "Defilama", "Aave"
    platform: string;    // e.g., "aave-v3", "curve", "morpho"
  };