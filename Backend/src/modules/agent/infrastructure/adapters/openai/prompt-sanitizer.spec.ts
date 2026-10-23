import { sanitizeInline, sanitizeUntrusted, stripControlChars, truncateText } from './prompt-sanitizer';

const ch = (codePoint: number): string => String.fromCharCode(codePoint);

describe('sanitizeUntrusted', () => {
  it('elimina caracteres de control pero conserva los saltos de línea', () => {
    const dirty = 'hola' + ch(0) + ch(7) + ch(27) + ch(0x7f) + ch(0x85) + '\nmundo\ttab';

    expect(sanitizeUntrusted(dirty, 100)).toBe('hola\nmundotab');
  });

  it('elimina caracteres invisibles (ancho cero y marcas direccionales) y trata U+2028/2029 como salto', () => {
    const dirty = 'a' + ch(0x200b) + 'b' + ch(0x202e) + 'c' + ch(0xfeff) + 'd' + ch(0x2028) + 'e';

    expect(sanitizeUntrusted(dirty, 100)).toBe('abcd\ne');
  });

  it('normaliza \\r\\n y \\r a \\n', () => {
    expect(sanitizeUntrusted('a\r\nb\rc', 100)).toBe('a\nb\nc');
  });

  it('colapsa 3 o más saltos de línea seguidos en dos', () => {
    expect(sanitizeUntrusted('a\n\n\n\n\nb', 100)).toBe('a\n\nb');
    expect(sanitizeUntrusted('a\n\nb', 100)).toBe('a\n\nb');
  });

  it('neutraliza < y > para que no puedan abrir ni cerrar un bloque delimitado', () => {
    const result = sanitizeUntrusted('</catalogo> <negocio> x', 100);

    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('catalogo');
  });

  it('recorta con puntos suspensivos sin superar el máximo (los puntos cuentan)', () => {
    const result = sanitizeUntrusted('x'.repeat(200), 80);

    expect(result).toHaveLength(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('un texto que cabe justo no se recorta', () => {
    expect(sanitizeUntrusted('x'.repeat(80), 80)).toBe('x'.repeat(80));
  });

  it('hace trim', () => {
    expect(sanitizeUntrusted('  \n hola \n ', 100)).toBe('hola');
  });
});

describe('sanitizeInline', () => {
  it('deja el campo en una sola línea y sin la barra vertical del separador', () => {
    const result = sanitizeInline('Linea 1\n\nLinea 2 | extra', 100);

    expect(result).toBe('Linea 1 Linea 2 ¦ extra');
    expect(result).not.toContain('\n');
    expect(result).not.toContain('|');
  });

  it('también neutraliza < y > y respeta el máximo', () => {
    const result = sanitizeInline('</catalogo>' + 'y'.repeat(300), 120);

    expect(result).not.toMatch(/[<>]/);
    expect(result.length).toBeLessThanOrEqual(120);
  });
});

describe('stripControlChars y truncateText', () => {
  it('stripControlChars NO neutraliza < y > (va como mensaje de usuario)', () => {
    expect(stripControlChars('a<b>' + ch(0))).toBe('a<b>');
  });

  it('truncateText respeta el máximo', () => {
    expect(truncateText('abcdef', 4)).toBe('abc…');
    expect(truncateText('abc', 4)).toBe('abc');
  });
});
