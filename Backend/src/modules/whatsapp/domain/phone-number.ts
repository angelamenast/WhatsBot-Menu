/**
 * Deja solo los dígitos, sin "+", espacios, guiones ni prefijo "whatsapp:". Es el formato en que
 * Meta entrega y recibe los números (`wa_id`, `to`), y el que se persiste para cliente y conexión.
 */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}
