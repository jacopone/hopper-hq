import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from '../../lib/route';

const BUILDING = { floor: null, desk: null, run: null, lobby: false };

describe('hash routes', () => {
  it('reads the building from an empty or unknown hash', () => {
    const hashes = ['', '#', '#/', '#/elevator', '#/floor/', '#/floor/a/desk/', '#/floor/a/b', '#/floor/a/desk/b/c', 'floor/a'];
    hashes.push('#/floor/a/run/', '#/floor/a/run/b/c', '#/floor/a/desk/b/run/c', '#/floor/a/room/b', '#/floor/a/Run/b');
    for (const hash of hashes) {
      expect(parseHash(hash), hash).toEqual(BUILDING);
    }
  });

  it('reads a floor, a desk on it, and a run on it', () => {
    expect(parseHash('#/floor/feature%3Acheckout-v2')).toEqual({ floor: 'feature:checkout-v2', desk: null, run: null, lobby: false });
    expect(parseHash('#/floor/feature%3Acheckout-v2/desk/oa-c3')).toEqual({ floor: 'feature:checkout-v2', desk: 'oa-c3', run: null, lobby: false });
    expect(parseHash('#/floor/feature%3Acheckout-v2/run/wf_demo-checkout')).toEqual({ floor: 'feature:checkout-v2', desk: null, run: 'wf_demo-checkout', lobby: false });
  });

  it('round-trips keys and ids with colons, slashes, spaces, percent signs and hashes', () => {
    const routes = [
      { floor: 'repo:/Users/dev/code/orders-api', desk: null, run: null, lobby: false },
      { floor: 'repo:/tmp/a b/100%/#x', desk: 'id/with:odd #chars%', run: null, lobby: false },
      { floor: 'feature:checkout-v2', desk: '6f1e2a0c-1b2c-4d5e-8f90-a1b2c3d4e5f6', run: null, lobby: false },
      { floor: 'repo:/tmp/a b/100%/#x', desk: null, run: 'wf_0000aaaa-001', lobby: false },
      { floor: 'feature:a/b', desk: null, run: 'run/with:odd #chars%', lobby: false },
    ];
    for (const r of routes) {
      const hash = toHash(r);
      expect(hash.slice(1), hash).not.toMatch(/[# ]/);
      expect(parseHash(hash)).toEqual(r);
    }
  });

  it('writes the building as #/, and ignores a desk or a run without a floor', () => {
    expect(toHash(BUILDING)).toBe('#/');
    expect(toHash({ floor: null, desk: 'oa-c3' })).toBe('#/');
    expect(toHash({ floor: null, desk: null, run: 'wf_0000aaaa-001', lobby: false })).toBe('#/');
    expect(toHash({ floor: 'feature:checkout-v2', desk: null })).toBe('#/floor/feature%3Acheckout-v2');
    expect(toHash({ floor: 'feature:checkout-v2', desk: '', run: '', lobby: false })).toBe('#/floor/feature%3Acheckout-v2');
  });

  it('names a desk or a run, never both: the desk wins', () => {
    expect(toHash({ floor: 'f', desk: null, run: 'wf_0000aaaa-001', lobby: false })).toBe('#/floor/f/run/wf_0000aaaa-001');
    expect(toHash({ floor: 'f', desk: 'oa-c3', run: 'wf_0000aaaa-001', lobby: false })).toBe('#/floor/f/desk/oa-c3');
    expect(parseHash(toHash({ floor: 'f', desk: 'oa-c3', run: 'wf_0000aaaa-001', lobby: false }))).toEqual({ floor: 'f', desk: 'oa-c3', run: null, lobby: false });
  });

  it('reads a malformed escape as the building instead of throwing', () => {
    expect(parseHash('#/floor/%E0%A4%A')).toEqual(BUILDING);
    expect(parseHash('#/floor/ok/desk/%')).toEqual(BUILDING);
    expect(parseHash('#/floor/ok/run/%E0%A4%A')).toEqual(BUILDING);
  });

  it('reads and writes the lobby', () => {
    expect(parseHash('#/lobby')).toEqual({ floor: null, desk: null, run: null, lobby: true });
    expect(toHash({ floor: null, lobby: true })).toBe('#/lobby');
    expect(toHash({ floor: 'repo:/w', lobby: true })).toBe('#/floor/repo%3A%2Fw');
  });
});
