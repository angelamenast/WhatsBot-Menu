import { revisarEntornoProduccion } from './production-env';

const base = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  FRONTEND_URL: 'https://app.example.com',
  WOMPI_BASE_URL: 'https://sandbox.wompi.co/v1',
  WOMPI_PRIVATE_KEY: 'k',
  WOMPI_EVENTS_SECRET: 's',
  WOMPI_REDIRECT_URL: 'https://app.example.com/billing',
  MESSAGING_PROVIDER: 'meta',
  PROVISIONING_PROVIDER: 'meta',
  PLAN_STATUS_PROVIDER: 'subscriptions',
  AGENT_DISPATCH_PROVIDER: 'agent',
  LLM_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'g',
  USAGE_QUOTA_PROVIDER: 'supabase',
  ORDER_PROVIDER: 'orders',
  CATALOG_PROVIDER: 'supabase',
};

describe('revisarEntornoProduccion', () => {
  it('no reporta nada con una configuración completa y real', () => {
    expect(revisarEntornoProduccion(base)).toEqual({ faltantes: [], advertencias: [] });
  });

  it('reporta las obligatorias vacías o ausentes', () => {
    const { faltantes } = revisarEntornoProduccion({ ...base, WOMPI_EVENTS_SECRET: '  ', SUPABASE_URL: undefined });
    expect(faltantes).toEqual(['SUPABASE_URL', 'WOMPI_EVENTS_SECRET']);
  });

  it('exige las claves del proveedor elegido', () => {
    expect(revisarEntornoProduccion({ ...base, GEMINI_API_KEY: '' }).faltantes).toEqual(['GEMINI_API_KEY']);
    expect(
      revisarEntornoProduccion({ ...base, EMAIL_PROVIDER: 'resend' }).faltantes,
    ).toEqual(['RESEND_API_KEY', 'EMAIL_FROM']);
  });

  it('avisa de proveedores fake, también cuando quedan en su valor por defecto', () => {
    const { advertencias } = revisarEntornoProduccion({ ...base, LLM_PROVIDER: 'fake', MESSAGING_PROVIDER: undefined });
    expect(advertencias).toEqual(['Proveedores en modo fake: MESSAGING_PROVIDER, LLM_PROVIDER']);
  });

  it('avisa si las URL públicas apuntan a localhost', () => {
    const { advertencias } = revisarEntornoProduccion({ ...base, FRONTEND_URL: 'http://localhost:4321' });
    expect(advertencias).toEqual(['FRONTEND_URL apunta a localhost']);
  });
});
