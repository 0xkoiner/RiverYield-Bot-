export const STABLES = ["USDC", "USDT"] as const;
export type Stable = typeof STABLES[number];

// Helper to decide if a DefiLlama symbol belongs to a given stable
// Accepts wrappers (aUSDC, sUSDC), bridge variants (USDC.e, axlUSDC), and LPs like USDC+USDT.
export function symbolMatchesStable(symbol: string, stable: Stable): boolean {
  const sym = symbol.toUpperCase();
  if (sym.includes(stable)) return true;
  // LP split check: allow only if *all* legs are stables we track (prevents USDC+ETH, etc.)
  const parts = sym.split(/[+\-\/]/).filter(Boolean);
  if (parts.length > 1) {
    return parts.every(p => STABLES.some(s => p.includes(s)));
  }
  return false;
}