import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Regla de arquitectura: el único punto donde `agent` conoce a `orders` es
 * OrdersOrderAdapter (más agent.module.ts, que debe importar OrdersModule para
 * poder inyectarlo). Ni el puerto, ni el caso de uso, ni el dominio de agent
 * pueden importar nada de orders.
 */
const AGENT_DIR = join(process.cwd(), 'src', 'modules', 'agent');

const ALLOWED = new Set([
  'infrastructure/adapters/orders-order.adapter.ts',
  'infrastructure/adapters/orders-order.adapter.spec.ts',
  'agent.module.ts',
  'agent-orders-boundary.spec.ts',
]);

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return tsFiles(full);
    }
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const IMPORTS_ORDERS = /from\s+['"][^'"]*\/orders\/[^'"]*['"]|from\s+['"][^'"]*\/orders['"]/;

describe('frontera agent → orders', () => {
  const files = tsFiles(AGENT_DIR).map((file) => ({
    path: relative(AGENT_DIR, file).split('\\').join('/'),
    content: readFileSync(file, 'utf8'),
  }));

  it('encuentra los archivos de agent (el test no es vacío)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('solo OrdersOrderAdapter y agent.module importan de orders', () => {
    const offenders = files
      .filter(({ path }) => !ALLOWED.has(path))
      .filter(({ content }) => IMPORTS_ORDERS.test(content))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('el adapter sí importa de orders (la regla detecta lo que debe detectar)', () => {
    const adapter = files.find(
      ({ path }) => path === 'infrastructure/adapters/orders-order.adapter.ts',
    );

    expect(adapter).toBeDefined();
    expect(IMPORTS_ORDERS.test(adapter!.content)).toBe(true);
  });

  it('el puerto de agent no depende de orders', () => {
    const port = files.find(
      ({ path }) => path === 'application/ports/out/order.port.ts',
    );

    expect(port).toBeDefined();
    expect(IMPORTS_ORDERS.test(port!.content)).toBe(false);
  });
});
