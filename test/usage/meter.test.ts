import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UsageFile, UsageMeter, usageOfLine } from '../../src/usage/meter.js';

const M = 1_000_000;
const reply = (id: string, u: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'assistant', requestId: `req_${id}`, message: { id: `msg_${id}`, model: 'claude-opus-5-5', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...u } }, ...extra });

async function file(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'shq-usage-'));
  const path = join(dir, 't.jsonl');
  await writeFile(path, lines.map((l) => l + '\n').join(''));
  return path;
}

describe('usageOfLine', () => {
  it("reads a reply's tokens by kind, the cache writes split by their time to live", () => {
    const line = reply('a', { input_tokens: 2, output_tokens: 126, cache_read_input_tokens: 28_053, cache_creation_input_tokens: 32_558, cache_creation: { ephemeral_1h_input_tokens: 32_000, ephemeral_5m_input_tokens: 558 }, speed: 'standard', inference_geo: 'global' });
    expect(usageOfLine(line)).toEqual({ id: 'msg_a', usage: { model: 'claude-opus-5-5', speed: 'standard', geo: 'global', input: 2, cacheWrite5m: 558, cacheWrite1h: 32_000, cacheRead: 28_053, output: 126 } });
  });

  it('counts the cache writes as five-minute ones when the reply does not split them, the API default', () => {
    expect(usageOfLine(reply('a', { cache_creation_input_tokens: 900 }))!.usage).toMatchObject({ cacheWrite5m: 900, cacheWrite1h: 0, speed: 'standard', geo: 'global' });
  });

  it('reads nothing from a line that is not a reply with usage, nor from a synthetic one', () => {
    expect(usageOfLine(JSON.stringify({ type: 'user', message: { content: 'hi' } }))).toBeNull();
    expect(usageOfLine('{not json')).toBeNull();
    expect(usageOfLine(reply('s', { output_tokens: 5 }).replace('claude-opus-5-5', '<synthetic>'))).toBeNull();
  });
});

describe('UsageFile', () => {
  it('counts each reply once, though the transcript writes a line per content block of it', async () => {
    const u = { input_tokens: 2, output_tokens: 312, cache_read_input_tokens: 60_611, cache_creation_input_tokens: 2637 };
    const f = new UsageFile(await file([reply('a', u), reply('a', u), reply('b', { input_tokens: 10, output_tokens: 20 })]));
    await f.read();
    const t = f.tally();
    expect(t.tokens).toEqual({ input: 12, cacheWrite: 2637, cacheRead: 60_611, output: 332 });
    expect(t.replies).toBe(2);
    expect(t.costUsd).toBeCloseTo((12 * 4 + 2637 * 5 + 60_611 * 0.2 + 332 * 20) / M, 9);
    expect([t.unpricedTokens, t.models, f.done]).toEqual([0, ['claude-opus-5-5'], true]);
  });

  it('keeps the largest count of a reply read twice, a streamed one growing', async () => {
    const f = new UsageFile(await file([reply('a', { output_tokens: 10 }), reply('a', { output_tokens: 300 })]));
    await f.read();
    expect(f.tally().tokens.output).toBe(300);
  });

  it('reads the whole file, the middle of a long one too, in steps of a byte budget, and then what is appended', async () => {
    const lines = Array.from({ length: 200 }, (_, i) => reply(`m${i}`, { output_tokens: 1 }, { pad: 'x'.repeat(500) }));
    const path = await file(lines);
    const f = new UsageFile(path);
    await f.read(16 * 1024);
    expect(f.done).toBe(false);
    while (!f.done) await f.read(16 * 1024);
    expect(f.tally().tokens.output).toBe(200);
    await appendFile(path, reply('late', { output_tokens: 7 }) + '\n');
    await f.read();
    expect(f.tally().tokens.output).toBe(207);
  });

  it('counts the tokens of a model without a price apart, and gives the cost of the rest', async () => {
    const f = new UsageFile(await file([reply('a', { input_tokens: 100 }).replace('claude-opus-5-5', 'claude-opus-9-9'), reply('b', { input_tokens: M })]));
    await f.read();
    expect(f.tally()).toMatchObject({ unpricedTokens: 100, models: ['claude-opus-5-5', 'claude-opus-9-9'] });
    expect(f.tally().costUsd).toBeCloseTo(4, 6);
  });

  it('starts again from nothing when the file is replaced by a shorter one', async () => {
    const path = await file([reply('a', { output_tokens: 50 }), reply('b', { output_tokens: 50 })]);
    const f = new UsageFile(path);
    await f.read();
    await writeFile(path, reply('c', { output_tokens: 1 }) + '\n');
    await f.read();
    expect(f.tally().tokens.output).toBe(1);
  });

  it('is empty and done for a file that cannot be read', async () => {
    const f = new UsageFile('/nonexistent/t.jsonl');
    await f.read();
    expect([f.tally().replies, f.done]).toEqual([0, true]);
  });
});

describe('UsageMeter', () => {
  it('reads the transcript of each session it is given, and forgets one that left', async () => {
    const a = await file([reply('a', { output_tokens: 5 })]);
    const b = await file([reply('b', { output_tokens: 9 })]);
    const m = new UsageMeter();
    await m.poll([{ id: 'A', transcript: a }, { id: 'B', transcript: b }, { id: 'C', transcript: null }]);
    expect([...m.read()].map(([id, u]) => [id, u.main.tokens.output, u.main.done])).toEqual([['A', 5, true], ['B', 9, true]]);
    await m.poll([{ id: 'B', transcript: b }]);
    expect([...m.read().keys()]).toEqual(['B']);
  });

  it('spreads the first pass over polls within its budget, the files not read whole first', async () => {
    const lines = (p: string) => Array.from({ length: 100 }, (_, i) => reply(`${p}${i}`, { output_tokens: 1 }, { pad: 'x'.repeat(500) }));
    const a = await file(lines('a'));
    const b = await file(lines('b'));
    const m = new UsageMeter(40 * 1024);
    await m.poll([{ id: 'A', transcript: a }, { id: 'B', transcript: b }]);
    const first = [...m.read().values()].map((u) => u.main.tokens.output);
    expect(first.reduce((x, y) => x + y, 0)).toBeLessThan(200);
    for (let i = 0; i < 10; i++) await m.poll([{ id: 'A', transcript: a }, { id: 'B', transcript: b }]);
    expect([...m.read().values()].map((u) => [u.main.tokens.output, u.main.done])).toEqual([[100, true], [100, true]]);
  });
});
