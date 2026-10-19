import { describe, expect, it } from 'vitest';
import { FEATURE_SLOTS, fmix32, fnv1a32, ORG_LABEL, ORG_LETTER, ORGS, orgOfAccount, orgOfArea, REPO_SLOTS, slotOf } from '../../src/scene/palette.js';

describe('fnv1a32', () => {
  it('matches the published 32-bit FNV-1a vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('starts from another seed when given one', () => {
    expect(fnv1a32('foobar', 0x811c9dc5)).toBe(0xbf9cf968);
    expect(fnv1a32('', 0x9e3779b9)).toBe(0x9e3779b9);
    expect(fnv1a32('foobar', 0x9e3779b9)).not.toBe(0xbf9cf968);
  });
});

describe('fmix32', () => {
  it("matches murmur3's 32-bit finalizer", () => {
    expect([0, 1, 0x811c9dc5, 0xffffffff].map(fmix32)).toEqual([0, 0x514e28b7, 0xab3e7c0b, 0x81f16f39]);
  });
});

describe('slotOf', () => {
  it('gives every key the same slot every time, within range', () => {
    expect([REPO_SLOTS, FEATURE_SLOTS]).toEqual([8, 8]);
    for (const key of ['orders-api', 'storefront-web', 'checkout-v2', '', 'ünïcode', '\u{1F600}', 'x'.repeat(1000)]) {
      const slot = slotOf(key, REPO_SLOTS);
      expect(slotOf(key, REPO_SLOTS)).toBe(slot);
      expect(Number.isInteger(slot) && slot >= 0 && slot < REPO_SLOTS).toBe(true);
    }
  });

  it('takes the slot from the high bits of the mixed hash, within range for any number of slots', () => {
    // 'web' and 'Web' agree in every code unit's low bits; 'api-v1' and 'api-v9' differ only in their last code unit.
    expect(['web', 'Web', 'api-v1', 'api-v9'].map((k) => slotOf(k, 8))).toEqual([0, 1, 5, 6]);
    // fmix32 of the empty key's hash, the offset basis, is 0xab3e7c0b: its top three bits are 5.
    expect(slotOf('', 8)).toBe(5);
    for (const slots of [1, 3, 1000]) {
      for (const key of ['web', 'Web', 'api-v1', '']) {
        const slot = slotOf(key, slots);
        expect(Number.isInteger(slot) && slot >= 0 && slot < slots).toBe(true);
      }
    }
  });

  it('pins the demo repos and features', () => {
    expect(['/demo/orders-api', '/demo/payments-svc', '/demo/search-svc', '/demo/storefront-web'].map((r) => slotOf(r, REPO_SLOTS))).toEqual([6, 0, 1, 2]);
    expect(['checkout-v2', 'search-ranking'].map((f) => slotOf(f, FEATURE_SLOTS))).toEqual([4, 1]);
  });
});

describe('organisations', () => {
  it("takes an account's organisation from its email's domain: the company's, the farm's, a public provider's (personal), any other", () => {
    expect(orgOfAccount('leonardo.davinci@amatino.ai')).toBe('amatino');
    expect(orgOfAccount('Jacopo@Amatino.AI')).toBe('amatino');
    expect(orgOfAccount('someone@mail.amatino.ai')).toBe('amatino');
    expect(orgOfAccount('jacopo@tenutalarnianone.com')).toBe('tenuta');
    for (const d of ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'yahoo.com']) expect(orgOfAccount(`j@${d}`)).toBe('personal');
    expect(orgOfAccount('x@example.org')).toBe('other');
    // A look-alike is not the company's.
    expect(orgOfAccount('x@notamatino.ai')).toBe('other');
    // A trailing dot is the same domain.
    expect(orgOfAccount('a@amatino.ai.')).toBe('amatino');
    expect(orgOfAccount('x@amatino.ai.evil.com')).toBe('other');
  });

  it('has none for what is not an email: a config directory\'s label, an empty string, null', () => {
    for (const a of ['home', '', '  ', null, undefined, '@amatino.ai', 'a@', 'a@@b']) expect(orgOfAccount(a)).toBeNull();
  });

  it('names each organisation in words and by one letter', () => {
    expect(ORGS.map((o) => [o, ORG_LETTER[o], ORG_LABEL[o]])).toEqual([
      ['amatino', 'A', 'Amatino'],
      ['tenuta', 'T', 'Tenuta Larnianone'],
      ['personal', 'P', 'Personal'],
      ['other', '?', 'Another organisation'],
    ]);
  });

  it("takes a task's area (Gordon's registry) as the same three organisations", () => {
    expect(orgOfArea('amatino')).toBe('amatino');
    expect(orgOfArea('tenuta')).toBe('tenuta');
    expect(orgOfArea('personali')).toBe('personal');
    expect(orgOfArea(' Tenuta ')).toBe('tenuta');
    for (const a of ['elsewhere', '', null, undefined]) expect(orgOfArea(a)).toBeNull();
  });
});
