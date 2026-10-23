import table from './prices.json' with { type: 'json' };

/** Rates in USD per million tokens, as the pricing page lists them. */
export interface Rates {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

export interface ModelPrice extends Rates {
  label: string;
  /** Fast mode's input and output; the cache keeps the same multiples of the input. */
  fast?: { input: number; output: number };
  /** The rates of a prompt over this many tokens (input, cache writes and reads). */
  over?: Rates & { promptTokens: number };
}

export interface PriceTable {
  source: string;
  /** The day the page was read, YYYY-MM-DD. */
  readAt: string;
  currency: 'USD';
  unit: 'per million tokens';
  models: Record<string, ModelPrice>;
  /** US-only inference costs `multiplier` times every rate, on the models listed. */
  usOnly: { multiplier: number; from: string[] };
}

/** The list prices read from the public pricing page (src/usage/prices.json). Nothing here calls an API. */
export const PRICES = table as PriceTable;

/** The tokens of one model reply, by kind, and how it was served. */
export interface MessageUsage {
  model: string;
  speed: string;
  geo: string;
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

/** A transcript's model as a row of the table: without a date, a context suffix or a cloud provider's wrapping; null when the table has no such row. */
export function modelKey(model: string, prices: PriceTable = PRICES): string | null {
  const key = model
    .replace(/\[[^\]]*\]$/, '')
    .replace(/^(?:[a-z]{2,4}\.)?anthropic\./, '')
    .replace(/-v\d+:\d+$/, '')
    .replace(/-\d{8}$/, '');
  return key in prices.models ? key : null;
}

/** One reply's list price in USD; null when its model, or its speed on that model, has no price. */
export function costOf(u: MessageUsage, prices: PriceTable = PRICES): number | null {
  const key = modelKey(u.model, prices);
  if (key === null) return null;
  const p = prices.models[key]!;
  const prompt = u.input + u.cacheWrite5m + u.cacheWrite1h + u.cacheRead;
  let r: Rates = p.over && prompt > p.over.promptTokens ? p.over : p;
  if (u.speed === 'fast') {
    if (!p.fast) return null;
    const k = p.fast.input / r.input;
    r = { input: p.fast.input, cacheWrite5m: r.cacheWrite5m * k, cacheWrite1h: r.cacheWrite1h * k, cacheRead: r.cacheRead * k, output: p.fast.output };
  }
  const geo = u.geo === 'us' && prices.usOnly.from.includes(key) ? prices.usOnly.multiplier : 1;
  return ((u.input * r.input + u.cacheWrite5m * r.cacheWrite5m + u.cacheWrite1h * r.cacheWrite1h + u.cacheRead * r.cacheRead + u.output * r.output) * geo) / 1_000_000;
}
