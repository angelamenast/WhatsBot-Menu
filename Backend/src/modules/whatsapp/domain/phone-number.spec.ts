import { normalizePhoneNumber } from './phone-number';

describe('normalizePhoneNumber', () => {
  it.each([
    ['+573001111111', '573001111111'],
    ['whatsapp:+573001111111', '573001111111'],
    ['573001111111', '573001111111'],
    ['+1 555-025-3483', '15550253483'],
    ['(57) 300 111 1111', '573001111111'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhoneNumber(raw)).toBe(expected);
  });

  it('es idempotente', () => {
    const once = normalizePhoneNumber('whatsapp:+57 300 111 1111');
    expect(normalizePhoneNumber(once)).toBe(once);
  });

  it('sin dígitos devuelve cadena vacía', () => {
    expect(normalizePhoneNumber('whatsapp:+')).toBe('');
    expect(normalizePhoneNumber('')).toBe('');
  });
});
