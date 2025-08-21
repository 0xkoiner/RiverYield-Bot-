export function pct(dec?: number): string {
    if (dec == null || Number.isNaN(dec)) return "-";
    return `${(dec * 100).toFixed(2)}%`;
  }
  
  export function usd(n?: number): string {
    if (n == null || Number.isNaN(n)) return "-";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `$${(n/1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(n/1_000).toFixed(2)}k`;
    return `$${n.toFixed(2)}`;
  }