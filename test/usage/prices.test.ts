import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { costOf, modelKey, PRICES, type MessageUsage } from '../../src/usage/prices.js';

const usage = (u: Partial<MessageUsage>): MessageUsage => ({ model: 'claude-opus-5-5', speed: 'standard', geo: 'global', input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, ...u });
const M = 1_000_000;

describe('prices.json', () => {
  // Read from disk, not through the import: without the file this fails, whatever a bundler would do.
  const raw = JSON.parse(readFileSync(new URL('../../src/usage/prices.json', import.meta.url), 'utf8')) as Record<string, unknown>;

  it('names the page it was read from, the day, the currency and the unit', () => {
    expect(raw.source).toBe('https://platform.claude.com/docs/en/about-claude/pricing');
    expect(raw.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([raw.currency, raw.unit]).toEqual(['USD', 'per million tokens']);
    expect(PRICES.readAt).toBe(raw.readAt);
  });

  it('gives every model five rates: input, the two cache writes, the cache read and output', () => {
    const models = raw.models as Record<string, Record<string, unknown>>;
    expect(Object.keys(models).length).toBeGreaterThan(10);
    for (const [id, m] of Object.entries(models)) {
      for (const k of ['input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output']) expect(typeof m[k], `${id}.${k}`).toBe('number');
      expect(m.output as number, id).toBeGreaterThan(m.input as number);
    }
  });

  it('holds the rates of the models the team runs, as the page gave them on the day', () => {
    expect(PRICES.models['claude-opus-5-5']).toMatchObject({ input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 });
    expect(PRICES.models['claude-fable-5-1']).toMatchObject({ input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 0.25, output: 50 });
    expect(PRICES.models['claude-sonnet-5-5']).toMatchObject({ input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1, output: 10 });
  });
});

describe('modelKey', () => {
  it('reads the model of a transcript as a row of the table, a dated or a provider id too', () => {
    expect(modelKey('claude-opus-5-5')).toBe('claude-opus-5-5');
    expect(modelKey('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5');
    expect(modelKey('claude-opus-5-5[1m]')).toBe('claude-opus-5-5');
    expect(modelKey('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('claude-sonnet-4-5');
  });

  it('knows no model the table does not list', () => {
    expect(modelKey('<synthetic>')).toBeNull();
    expect(modelKey('claude-opus-9-9')).toBeNull();
    expect(modelKey('')).toBeNull();
  });
});

describe('costOf', () => {
  it('prices each kind of token at its own rate per million', () => {
    // Opus 5.5: 1M in at $4, 1M 5m writes at $5, 1M 1h writes at $8, 1M reads at $0.20, 1M out at $20.
    expect(costOf(usage({ input: M, cacheWrite5m: M, cacheWrite1h: M, cacheRead: M, output: M }))).toBeCloseTo(37.2, 6);
    expect(costOf(usage({ model: 'claude-fable-5-1', cacheWrite1h: 32_558, cacheRead: 28_053, input: 2, output: 126 }))).toBeCloseTo((2 * 10 + 32_558 * 20 + 28_053 * 0.25 + 126 * 50) / M, 9);
  });

  it('prices fast mode at its own rates, the cache at the same multiples of its input', () => {
    // Fast Opus 5.5: $8 in, $40 out; a 1h write is twice the input, a read 0.05 of it.
    expect(costOf(usage({ speed: 'fast', input: M, output: M, cacheWrite1h: M, cacheRead: M }))).toBeCloseTo(8 + 40 + 16 + 0.4, 6);
  });

  it('is null for fast mode on a model the page gives no fast rate', () => {
    expect(costOf(usage({ model: 'claude-sonnet-5-5', speed: 'fast', input: M }))).toBeNull();
  });

  it('prices a Haiku 5.5 prompt over 100,000 tokens at the higher rates, the prompt counting the cache', () => {
    expect(costOf(usage({ model: 'claude-haiku-5-5', input: 50_000, cacheRead: 40_000, output: 1000 }))).toBeCloseTo((50_000 * 0.1 + 40_000 * 0.01 + 1000 * 0.5) / M, 9);
    expect(costOf(usage({ model: 'claude-haiku-5-5', input: 50_000, cacheRead: 60_000, output: 1000 }))).toBeCloseTo((50_000 * 0.5 + 60_000 * 0.05 + 1000 * 2.5) / M, 9);
  });

  it('adds a tenth for US-only inference on the models the page names, and nothing for global routing', () => {
    expect(costOf(usage({ geo: 'us', input: M }))).toBeCloseTo(4.4, 6);
    expect(costOf(usage({ geo: 'not_available', input: M }))).toBeCloseTo(4, 6);
    expect(costOf(usage({ model: 'claude-haiku-4-5', geo: 'us', input: M }))).toBeCloseTo(1, 6);
  });

  it('is null for a model the table does not list', () => {
    expect(costOf(usage({ model: 'claude-opus-9-9', input: M }))).toBeNull();
  });
});
