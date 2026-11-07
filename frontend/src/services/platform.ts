import { request } from '../api/http';
export interface Business { id: string; nombreNegocio: string; numeroWhatsapp: string | null; descripcion: string | null }
export interface Plan { id: string; nombre: string; precio: number; limiteMensajes: number | null; limiteTokens: number | null; duracionMeses: number }
export interface Subscription { estado: string; suscripcionId: string | null; plan: Plan | null; fechaFin: string | null; diasRestantes: number | null; puedeEditar: boolean; alerta: { mensaje: string } | null }
export interface Order { id: string; status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'; customerPhone: string; total: number; createdAt: string; items: { productName: string; quantity: number; subtotal: number }[] }
export interface OrderPage { data: Order[]; total: number; limit: number; offset: number }
export interface Connection { phoneNumber: string; status: string; simulated?: boolean }
export interface Agent { personality: string | null; tone: string | null; welcomeMessage: string | null }
export interface User { id: string; email?: string; user_metadata: Record<string, string>; app_metadata?: { providers?: string[] } }
const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });
export const platform = {
  me: () => request<{ user: User }>('/auth/me'),
  business: () => request<Business | null>('/business/mine'),
  saveBusiness: (exists: boolean, data: { nombre_negocio: string; numero_whatsapp?: string; descripcion?: string }) => request<Business>(exists ? '/business/mine' : '/business', json(exists ? 'PATCH' : 'POST', data)),
  profile: (data: { nombre?: string; email?: string; password?: string; currentPassword?: string }) => request<{ user: User }>('/auth/account', json('PATCH', data)),
  plans: () => request<Plan[]>('/payments/plans', {}, false),
  subscription: () => request<Subscription>('/subscriptions/status'),
  checkout: (planId: string) => request<{ paymentUrl: string; suscripcionId: string }>('/payments/generate-link', json('POST', { planId })),
  renew: (confirmed = false) => request<{ referencia: string; paymentUrl: string }>('/subscriptions/renewal', json('POST', { confirmarRenovacionAnticipada: confirmed })),
  renewal: (reference: string) => request<{ estado: string; mensaje: string }>('/subscriptions/renewal/' + encodeURIComponent(reference)),
  orders: (query: URLSearchParams) => request<OrderPage>('/orders?' + query),
  orderAction: (id: string, action: 'confirm' | 'cancel') => request<Order>('/orders/' + encodeURIComponent(id) + '/' + action, { method: 'PATCH' }),
  connection: () => request<Connection | null>('/whatsapp/connections'),
  connect: (phoneNumber: string) => request<Connection>('/whatsapp/connections', json('POST', { phoneNumber })),
  agent: () => request<Agent>('/agent/config'),
  saveAgent: (data: Agent) => request<Agent>('/agent/config', json('PATCH', data)),
};
