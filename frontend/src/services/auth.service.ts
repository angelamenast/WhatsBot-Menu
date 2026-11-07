import { ApiError, request, saveSession, clearSession, sessionVersion, type Session } from '../api/http';
import type { LoginDto, AuthResponse, UserProfileResponse } from '../types/auth.types';
export const authService = {
  async login(credentials: LoginDto): Promise<AuthResponse> {
    clearSession();
    sessionStorage.removeItem('oauth_pending'); sessionStorage.removeItem('oauth_intent');
    const attempt = sessionVersion();
    try {
      const session = await request<Session>('/auth/login', { method:'POST', body:JSON.stringify(credentials) }, false);
      if (!session?.accessToken) throw new ApiError(401, 'No se pudo iniciar sesión.');
      const { user } = await request<UserProfileResponse>('/auth/me', { headers:{Authorization:`Bearer ${session.accessToken}`} }, false);
      if (user?.email?.trim().toLowerCase() !== credentials.email.trim().toLowerCase()) throw new ApiError(401, 'No se pudo verificar la cuenta solicitada.');
      if (attempt !== sessionVersion()) throw new ApiError(409, 'Este intento de acceso fue reemplazado por otro.');
      saveSession(session);
      return { access_token:session.accessToken,refresh_token:session.refreshToken };
    } catch (error) { if (attempt === sessionVersion()) clearSession(); throw error; }
  },
  getMe(_token?: string) { return request<UserProfileResponse>('/auth/me'); },
  logout(_token?: string) { return request<{message:string}>('/auth/logout',{method:'POST'}); },
  async loginWithGoogle(intent: 'login' | 'register' = 'login') {
    clearSession();
    sessionStorage.removeItem('oauth_pending');
    sessionStorage.removeItem('oauth_intent');
    const { url } = await request<{url:string}>('/auth/google/url', {signal:AbortSignal.timeout(10000)}, false);
    const target = new URL(url);
    if (target.protocol !== 'https:') throw new ApiError(502, 'No se pudo iniciar el acceso con Google.');
    sessionStorage.setItem('oauth_pending', 'true');
    sessionStorage.setItem('oauth_intent', intent);
    location.assign(target.href);
  },
  async completeGoogleCallback(fragment: string) {
    clearSession();
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    const pending = sessionStorage.getItem('oauth_pending');
    const intent = sessionStorage.getItem('oauth_intent') || 'login';
    sessionStorage.removeItem('oauth_pending');
    sessionStorage.removeItem('oauth_intent');
    if (pending !== 'true' || params.has('error') || !params.get('access_token') || !params.get('refresh_token')) throw new ApiError(401, 'No se pudo completar el acceso con Google. Selecciona tu cuenta e inténtalo de nuevo.');
    const attempt = sessionVersion();
    const session = { accessToken:params.get('access_token')!, refreshToken:params.get('refresh_token')!, expiresIn:Number(params.get('expires_in') || 3600) };
    const { user } = await request<UserProfileResponse>('/auth/me', {headers:{Authorization:`Bearer ${session.accessToken}`}}, false);
    if (!user?.id || !user.email) throw new ApiError(401, 'No se pudo verificar la cuenta de Google.');
    if (attempt !== sessionVersion()) throw new ApiError(409, 'Este acceso fue reemplazado por otro.');
    await request('/auth/bootstrap', {method:'POST',headers:{Authorization:`Bearer ${session.accessToken}`},body:JSON.stringify({createProfile:intent === 'register'})}, false);
    if (attempt !== sessionVersion()) throw new ApiError(409, 'Este acceso fue reemplazado por otro.');
    saveSession(session);
    return user;
  },
  register(email: string,password: string,nombre: string,telefono?: string) {
    return request('/auth/register',{method:'POST',body:JSON.stringify({email,password,nombre,telefono})},false);
  },
  recover(email: string) { return request('/auth/request-password-reset',{method:'POST',body:JSON.stringify({email})},false); }
};
