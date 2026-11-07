import { ApiError, request } from '../api/http';
import type { Business, Connection, User } from './platform';
export interface UserProfileData { adminName:string; email:string; businessName?:string; hasBusiness:boolean; avatarUrl?:string|null }
let pending: Promise<UserProfileData|null> | null = null;
let pendingToken = '';

async function readCurrentProfile(): Promise<UserProfileData> {
  const [{user}, business, channel] = await Promise.all([
    request<{user:User}>('/auth/me'),
    request<Business|null>('/business/mine'),
    request<Connection|null>('/whatsapp/connections').then(connection => ({known:true,connection})).catch(error => {
      if (error instanceof ApiError && (error.status === 401 || error.status === 409)) throw error;
      return {known:false,connection:null};
    }),
  ]);
  const meta = user.user_metadata || {};
  const profile: UserProfileData = {
    email:user.email || '',
    adminName:meta.nombre || meta.full_name || meta.name || user.email?.split('@')[0] || 'Usuario',
    businessName:business?.nombreNegocio || '',
    hasBusiness:Boolean(business),
    avatarUrl:meta.avatar_url || meta.picture || null,
  };
  localStorage.setItem('user_profile_data',JSON.stringify(profile));
  document.querySelectorAll('[data-profile-email]').forEach(element => { element.textContent = profile.email; });
  document.querySelectorAll('[data-profile-business]').forEach(element => { element.textContent = profile.businessName || 'Sin negocio registrado'; });
  const status = !channel.known ? 'Estado de WhatsApp no disponible' : !channel.connection ? 'WhatsApp sin vincular' : channel.connection.simulated ? 'WhatsApp en modo de prueba' : channel.connection.status === 'CONNECTED' ? 'WhatsApp conectado' : 'WhatsApp: '+channel.connection.status;
  document.querySelectorAll('[data-whatsapp-status]').forEach(element => { element.textContent = status; });
  document.querySelectorAll('[data-whatsapp-phone]').forEach(element => { element.textContent = channel.connection?.phoneNumber || 'Sin número vinculado'; });
  const google = (user as User & {app_metadata?:{providers?:string[]}}).app_metadata?.providers?.includes('google');
  document.querySelectorAll('[data-google-status]').forEach(element => { element.textContent = google ? 'Vinculado' : 'No vinculado'; });
  window.dispatchEvent(new CustomEvent('profile-updated',{detail:profile}));
  document.documentElement.dataset.identityState = 'ready';
  return profile;
}

export function syncUserSession(): Promise<UserProfileData|null> {
  const token = localStorage.getItem('auth_token');
  if (!token) return Promise.resolve(null);
  if (pending && pendingToken === token) return pending;
  const operation = readCurrentProfile();
  pending = operation; pendingToken = token;
  void operation.finally(() => { if (pending === operation) pending = null; }).catch(() => {});
  return operation;
}
