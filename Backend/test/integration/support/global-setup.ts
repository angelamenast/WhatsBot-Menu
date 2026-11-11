import { createTestClient } from './supabase-test-client';

const REQUIRED_TABLES = [
  'usuarios',
  'negocios',
  'categorias_producto',
  'catalogo_productos',
  'planes',
  'suscripciones',
  'transacciones_pago',
  'conversaciones',
  'mensajes',
  'estados_pedido',
  'pedidos',
  'pedido_items',
  'consumo_ia',
  'contador_uso_periodo',
];

const REQUIRED_ESTADOS_PEDIDO = ['pendiente', 'confirmado', 'cancelado'];
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
// PostgREST: función inexistente o con otra firma.
const FUNCTION_NOT_FOUND = 'PGRST202';

/**
 * Corre una vez antes de toda la suite. Aborta si el entorno no es el de pruebas
 * (lo hace createTestClient → loadTestEnv) o si a la base le falta el esquema.
 */
export default async function globalSetup(): Promise<void> {
  const client = createTestClient();
  const problems: string[] = [];

  for (const table of REQUIRED_TABLES) {
    // GET y no HEAD: con head:true supabase-js no informa el error de una tabla inexistente.
    const { error } = await client.from(table).select('*').limit(1);
    if (error) problems.push(`falta la tabla public.${table} (${error.code ?? error.message})`);
  }

  if (problems.length === 0) {
    const estados = await client.from('estados_pedido').select('codigo');
    const codigos = (estados.data ?? []).map((row) => row.codigo as string);
    const faltan = REQUIRED_ESTADOS_PEDIDO.filter((codigo) => !codigos.includes(codigo));
    if (faltan.length > 0) problems.push(`faltan filas en estados_pedido: ${faltan.join(', ')}`);

    const modelo = await client.from('consumo_ia').select('modelo').limit(1);
    if (modelo.error) problems.push('falta la columna consumo_ia.modelo (migración 20261103140000)');

    const cuota = await client.rpc('consultar_cuota_tokens', { p_negocio_id: ZERO_UUID });
    if (cuota.error) problems.push(`falta la función consultar_cuota_tokens (${cuota.error.code})`);

    // Sin items la función lanza ORDER_WITHOUT_ITEMS antes de escribir nada.
    const pedido = await client.rpc('crear_pedido', {
      p_pedido_id: ZERO_UUID,
      p_negocio_id: ZERO_UUID,
      p_conversacion_id: ZERO_UUID,
      p_items: [],
    });
    if (pedido.error?.code === FUNCTION_NOT_FOUND) problems.push('falta la función crear_pedido');

    // Con un negocio inexistente la función falla por FK (23503) sin dejar datos;
    // PGRST202 significa que no existe la firma de 6 parámetros (con p_modelo).
    const consumo = await client.rpc('registrar_consumo_ia', {
      p_negocio_id: ZERO_UUID,
      p_conversacion_id: null,
      p_mensaje_id: null,
      p_tokens_entrada: 0,
      p_tokens_salida: 0,
      p_modelo: null,
    });
    if (consumo.error?.code === FUNCTION_NOT_FOUND) {
      problems.push('falta registrar_consumo_ia(..., p_modelo) (migración 20261103140000)');
    }
  }

  if (problems.length > 0) {
    throw new Error(
      '\n\n[test:int] ABORTADO: la base de pruebas no tiene el esquema esperado:\n  - ' +
        problems.join('\n  - ') +
        '\nCarga el esquema siguiendo Backend/test/integration/README.md y vuelve a correr.\n',
    );
  }
}
