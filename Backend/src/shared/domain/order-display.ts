// Cómo se muestra un pedido al cliente final. Lo comparten los módulos que le escriben al
// cliente (whatsapp para los avisos de estado, agent para confirmar un pedido recién registrado).

const copFormat = (fractionDigits: 0 | 2) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const copWithoutDecimals = copFormat(0);
const copWithDecimals = copFormat(2);

/** Pesos enteros sin decimales ($ 36.000); con centavos, siempre dos ($ 15.000,50). */
export function formatCop(amount: number): string {
  return (Number.isInteger(amount) ? copWithoutDecimals : copWithDecimals).format(amount);
}

/** Referencia corta que ve el cliente: primeros 8 caracteres del UUID. */
export function orderReference(orderId: string): string {
  return orderId.slice(0, 8);
}
