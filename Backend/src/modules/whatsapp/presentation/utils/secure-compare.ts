import { timingSafeEqual } from 'node:crypto';

/** Comparación en tiempo constante de dos cadenas (firmas, tokens de verificación). */
export function secureCompare(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
