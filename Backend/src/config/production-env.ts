// Revisión de variables al arrancar con NODE_ENV=production. Sin esto, una variable faltante no
// impide el arranque y falla después en silencio (p. ej. sin WOMPI_EVENTS_SECRET todo webhook de pago
// se rechaza con 401). Nunca incluye valores en los mensajes, solo nombres.

type Env = Record<string, string | undefined>;

const SIEMPRE_OBLIGATORIAS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRONTEND_URL',
  'WOMPI_BASE_URL',
  'WOMPI_PRIVATE_KEY',
  'WOMPI_EVENTS_SECRET',
  'WOMPI_REDIRECT_URL',
];

// Variable que elige el proveedor → valor con el que se exigen más variables.
const CONDICIONALES: Array<{ selector: string; valor: string; obligatorias: string[] }> = [
  { selector: 'LLM_PROVIDER', valor: 'gemini', obligatorias: ['GEMINI_API_KEY'] },
  { selector: 'LLM_PROVIDER', valor: 'openai', obligatorias: ['OPENAI_API_KEY', 'OPENAI_MODEL'] },
  { selector: 'EMAIL_PROVIDER', valor: 'resend', obligatorias: ['RESEND_API_KEY', 'EMAIL_FROM'] },
];

// Proveedores que en producción deberían ser reales. Un "fake" no impide arrancar, pero se avisa.
const PROVEEDORES = [
  'MESSAGING_PROVIDER',
  'PROVISIONING_PROVIDER',
  'PLAN_STATUS_PROVIDER',
  'AGENT_DISPATCH_PROVIDER',
  'LLM_PROVIDER',
  'USAGE_QUOTA_PROVIDER',
  'ORDER_PROVIDER',
  'CATALOG_PROVIDER',
];

// Valores por defecto del código cuando la variable no está definida.
const POR_DEFECTO: Record<string, string> = {
  MESSAGING_PROVIDER: 'fake',
  PROVISIONING_PROVIDER: 'fake',
  PLAN_STATUS_PROVIDER: 'fake',
  AGENT_DISPATCH_PROVIDER: 'fake',
  ORDER_PROVIDER: 'fake',
  LLM_PROVIDER: 'fake',
  USAGE_QUOTA_PROVIDER: 'fake',
  CATALOG_PROVIDER: 'supabase',
};

export interface RevisionEntorno {
  faltantes: string[];
  advertencias: string[];
}

const vacia = (valor: string | undefined) => !valor || valor.trim() === '';

export function revisarEntornoProduccion(env: Env): RevisionEntorno {
  const faltantes = SIEMPRE_OBLIGATORIAS.filter((nombre) => vacia(env[nombre]));

  for (const { selector, valor, obligatorias } of CONDICIONALES) {
    if (env[selector]?.trim() === valor) {
      faltantes.push(...obligatorias.filter((nombre) => vacia(env[nombre])));
    }
  }

  const advertencias: string[] = [];
  const fakes = PROVEEDORES.filter(
    (nombre) => (env[nombre]?.trim() || POR_DEFECTO[nombre]) === 'fake',
  );
  if (fakes.length > 0) {
    advertencias.push(`Proveedores en modo fake: ${fakes.join(', ')}`);
  }
  for (const nombre of ['FRONTEND_URL', 'WOMPI_REDIRECT_URL']) {
    if (/localhost|127\.0\.0\.1/.test(env[nombre] ?? '')) {
      advertencias.push(`${nombre} apunta a localhost`);
    }
  }

  return { faltantes: [...new Set(faltantes)], advertencias };
}
