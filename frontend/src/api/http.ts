const configured = import.meta.env.PUBLIC_API_URL || import.meta.env.PUBLIC_NEST_API_URL || 'http://localhost:3000/api';
export const API_URL = configured.replace(/\/$/, '').replace(/\/auth$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export interface Session { accessToken: string; refreshToken: string; expiresIn: number }
let sessionRevision = 0;
export const sessionVersion = () => sessionRevision;
const VERIFIED_SESSION = 'verified-v2';
export const hasVerifiedSession = () => localStorage.getItem('tremia_session_version') === VERIFIED_SESSION && Boolean(localStorage.getItem('auth_token'));
function validateSession(session: Session) {
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken || typeof session.refreshToken !== 'string' || !session.refreshToken || !Number.isFinite(session.expiresIn) || session.expiresIn <= 0) throw new ApiError(401, 'No se recibió una sesión válida. Inicia sesión de nuevo.');
}
function writeSession(session: Session) {
  validateSession(session);
  localStorage.setItem('auth_token', session.accessToken);
  localStorage.setItem('refresh_token', session.refreshToken);
  document.cookie = `jwt_token=${encodeURIComponent(session.accessToken)}; path=/; max-age=${session.expiresIn}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}
export function saveSession(session: Session) {
  validateSession(session);
  clearSession();
  writeSession(session);
  localStorage.setItem('tremia_session_version', VERIFIED_SESSION);
}
export function clearSession() {
  sessionRevision++;
  refreshPromise = null;
  for (const key of ['auth_token', 'refresh_token', 'user_profile_data', 'renewal_reference', 'checkout_subscription', 'checkout_selected_id', 'checkout_plan', 'checkout_billing', 'tremia_session_version']) localStorage.removeItem(key);
  document.cookie = 'jwt_token=; path=/; max-age=0; SameSite=Lax';
}

// Único error con código estable del backend: escritura bloqueada por plan vencido.
export const isPlanExpired = (error: unknown) => error instanceof ApiError && error.status === 403 && error.details.codigo === 'PLAN_VENCIDO';

async function decode<T>(response: Response): Promise<T> {
  // Un 200 sin cuerpo (por ejemplo GET /whatsapp/connections sin conexión) se trata como null.
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429) {
      // El backend responde "ThrottlerException: Too Many Requests" en inglés; se usa Retry-After.
      const wait = Number(response.headers.get('Retry-After'));
      throw new ApiError(429, `Demasiadas solicitudes. Espera ${Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) + ' s' : 'un momento'} y vuelve a intentarlo.`, data || {});
    }
    // message puede ser string o string[] (validación de DTO).
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(response.status, response.status >= 500 && response.status !== 503 ? 'Ocurrió un error en el servidor. Vuelve a intentarlo.' : message || 'No se pudo completar la solicitud.', data || {});
  }
  return data as T;
}

let refreshPromise: Promise<void> | null = null;
async function refreshSession() {
  const revision = sessionRevision;
  const token = localStorage.getItem('refresh_token');
  if (!token) throw new ApiError(401, 'Inicia sesión para continuar.');
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: token }),
  });
  const session = await decode<Session>(response);
  if (revision !== sessionRevision || token !== localStorage.getItem('refresh_token')) throw new ApiError(409, 'La sesión cambió. Vuelve a cargar esta página.');
  writeSession(session);
}

export async function request<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  if (authenticated && !hasVerifiedSession()) {
    clearSession();
    throw new ApiError(401, 'Inicia sesión de nuevo para verificar tu cuenta.');
  }
  const revision = sessionRevision;
  const assertCurrentSession = () => { if (authenticated && revision !== sessionRevision) throw new ApiError(409, 'La sesión cambió. Vuelve a cargar esta página.'); };
  const send = () => {
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    const token = localStorage.getItem('auth_token');
    if (authenticated && token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...options, headers });
  };
  let response: Response;
  try { response = await send(); } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new ApiError(0, 'La solicitud tardó demasiado. Vuelve a intentarlo.');
    throw new ApiError(0, 'No se pudo conectar con la API. Comprueba que el backend esté iniciado.');
  }
  assertCurrentSession();
  if (response.status === 401 && authenticated) {
    try {
      if (!refreshPromise) {
        const operation = refreshSession();
        refreshPromise = operation;
        void operation.finally(() => { if (refreshPromise === operation) refreshPromise = null; }).catch(() => {});
      }
      await refreshPromise;
      assertCurrentSession();
      response = await send();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && revision === sessionRevision) clearSession();
      throw error;
    }
  }
  assertCurrentSession();
  try {
    const data = await decode<T>(response);
    assertCurrentSession();
    return data;
  } catch (error) { assertCurrentSession(); throw error; }
}
