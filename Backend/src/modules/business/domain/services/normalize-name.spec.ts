import { normalizeName } from './normalize-name';

describe('normalizeName', () => {
  it('ignores case, accents and surrounding whitespace', () => {
    expect(normalizeName('  PÓSTRES ')).toBe('postres');
    expect(normalizeName('Postres')).toBe('postres');
  });

  it('collapses repeated spaces between words', () => {
    expect(normalizeName('Hamburguesa   clásica')).toBe('hamburguesa clasica');
  });

  it('does not treat singular and plural as the same (strict validation relies on this)', () => {
    expect(normalizeName('Postre')).not.toBe(normalizeName('Postres'));
  });
});