/**
 * Texto no confiable (lo escribe el dueño o viene de un catálogo importado) que acaba dentro del
 * system prompt. Se sanea para que no pueda cerrar un bloque delimitado ni colar otro. El
 * saneo reduce el riesgo; la defensa principal sigue siendo que el backend decide qué se ejecuta.
 */
export const MAX_BUSINESS_NAME_LENGTH = 80;
export const MAX_PRODUCT_NAME_LENGTH = 80;
export const MAX_CATEGORY_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 120;
export const MAX_PERSONALITY_LENGTH = 500;
export const MAX_BUSINESS_HOURS_LENGTH = 1000;

const ELLIPSIS = '…';

// Rangos de code points a eliminar: controles C0 (salvo \n = 0x0A) y C1, DEL, y caracteres
// invisibles que sirven para ocultar texto o invertir su lectura (ancho cero, marcas
// direccionales, BOM). Se arma con números y no con escapes en el literal para que ninguna
// herramienta de edición los convierta en caracteres reales.
const REMOVED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x09],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

const char = (codePoint: number): string => String.fromCharCode(codePoint);

const CONTROL_CHARS = new RegExp(
  '[' + REMOVED_RANGES.map(([from, to]) => char(from) + '-' + char(to)).join('') + ']',
  'g',
);
// Separadores de línea/párrafo Unicode (U+2028, U+2029): se tratan como salto de línea.
const LINE_SEPARATORS = new RegExp('[' + char(0x2028) + char(0x2029) + ']', 'g');

/**
 * Elimina caracteres de control (conserva \n), colapsa 3+ saltos de línea, neutraliza `<` y `>`
 * (se sustituyen por ‹ y ›, que no son delimitadores) y recorta a `maxLength` con puntos
 * suspensivos. `maxLength` incluye los puntos suspensivos.
 */
export function sanitizeUntrusted(text: string, maxLength: number): string {
  const cleaned = text
    .replace(/\r\n?/g, '\n')
    .replace(LINE_SEPARATORS, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/</g, '‹')
    .replace(/>/g, '›')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return truncateText(cleaned, maxLength);
}

/**
 * Igual que sanitizeUntrusted pero para campos que van en UNA línea de una tabla separada por
 * `|` (el catálogo): los saltos de línea pasan a espacio y la barra vertical se sustituye.
 */
export function sanitizeInline(text: string, maxLength: number): string {
  const singleLine = sanitizeUntrusted(text, Number.MAX_SAFE_INTEGER)
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '¦');

  return truncateText(singleLine, maxLength);
}

/**
 * Quita caracteres de control (conserva \n) de un mensaje de cliente. NO neutraliza `<` ni `>`
 * porque ese texto viaja como mensaje `user`, no dentro del system prompt.
 */
export function stripControlChars(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(LINE_SEPARATORS, '\n').replace(CONTROL_CHARS, '');
}

/** Recorta a `maxLength` (incluidos los puntos suspensivos). */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, Math.max(0, maxLength - ELLIPSIS.length)).trimEnd() + ELLIPSIS;
}
