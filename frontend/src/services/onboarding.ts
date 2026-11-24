import type { User } from './platform';

// Onboarding de inicio de sesión: una cuenta creada con Google debe crear una contraseña para
// poder entrar también con su correo y cambiarla después. El resto de la configuración del
// negocio la guía el checklist de Personalización.
export interface OnboardingStep { key: string; label: string; help: string; route: string; pages: string[] }

export const PASSWORD_STEP: OnboardingStep = {
  key: 'contrasena',
  label: 'Contraseña de acceso',
  help: 'Tu cuenta entra con Google. Crea una contraseña para poder entrar también con tu correo y cambiarla cuando quieras.',
  route: '/profile#password-form',
  pages: ['/profile'],
};

// Pantallas que nunca se bloquean.
const ALWAYS_ALLOWED = ['/support'];

/** Misma regla que el backend (AccountController): sin lista de proveedores, con 'email' o con la marca password_set. */
export function accountHasPassword(user: Pick<User, 'app_metadata'>): boolean {
  const providers = user.app_metadata?.providers;
  return !Array.isArray(providers) || providers.includes('email') || user.app_metadata?.password_set === true;
}

export const pendingSteps = (hasPassword: boolean): OnboardingStep[] => hasPassword ? [] : [PASSWORD_STEP];

/** Ruta a la que hay que ir desde `path`, o null si la pantalla actual sirve para el paso pendiente. */
export function redirectFor(path: string, pending: OnboardingStep[]): string | null {
  const current = pending[0];
  if (!current || ALWAYS_ALLOWED.includes(path) || current.pages.includes(path)) return null;
  return current.route;
}
