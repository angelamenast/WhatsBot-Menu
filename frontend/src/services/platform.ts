import { request } from '../api/http';
export interface Business { id: string; nombreNegocio: string; numeroWhatsapp: string | null; descripcion: string | null }
export interface Plan { id: string; nombre: string; precio: number; limiteMensajes: number | null; limiteTokens: number | null; duracionMeses: number }
export interface Subscription { estado: string; suscripcionId: string | null; plan: Plan | null; fechaFin: string | null; diasRestantes: number | null; puedeEditar: boolean; alerta: { mensaje: string } | null }
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export interface OrderItem { productId: string | null; productName: string; unitPrice: number; quantity: number; subtotal: number }
// customerPhone solo llega en los GET; confirm/cancel no lo devuelven.
export interface Order { id: string; businessId: string; conversationId: string; status: OrderStatus; items: OrderItem[]; total: number; createdAt: string; updatedAt: string; customerPhone?: string }
export interface OrderPage { data: Order[]; total: number; limit: number; offset: number }
export type ConnectionStatus = 'CONNECTED' | 'FAILED' | 'PENDING';
// GET: sin conexión el cuerpo llega vacío (null). Trae simulated pero no los IDs de Meta.
export interface Connection { id: string; phoneNumber: string | null; status: ConnectionStatus; simulated: boolean }
// POST: trae los IDs de Meta pero no simulated. 201 = CONNECTED, 200 = FAILED.
export interface ConnectResult { id: string; businessId: string; phoneNumberId: string; wabaId: string; phoneNumber: string | null; status: ConnectionStatus }
export type AgentTone = 'FORMAL' | 'AMABLE' | 'ENTUSIASTA' | 'SEGURO' | 'CERCANO';
export type AgentRegionalStyle = 'NEUTRO' | 'PAISA' | 'COSTENO' | 'CALENO' | 'BOGOTANO';
export interface Agent { businessId?: string; personality: string | null; tone: AgentTone | null; regionalStyle: AgentRegionalStyle | null; welcomeMessage: string | null; unavailableMessage: string | null; businessHours: Record<string, string> | null }
// PATCH parcial: campo ausente = no tocar, null = borrar.
export type AgentUpdate = Partial<Omit<Agent, 'businessId'>>;
export interface User { id: string; email?: string; user_metadata: Record<string, string>; app_metadata?: { providers?: string[] } }
export interface Checklist { items: { clave: string; completo: boolean; label: string }[]; completo: boolean; porcentaje: number }
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
  order: (id: string) => request<Order>('/orders/' + encodeURIComponent(id)),
  orderAction: (id: string, action: 'confirm' | 'cancel') => request<Order>('/orders/' + encodeURIComponent(id) + '/' + action, { method: 'PATCH' }),
  connection: () => request<Connection | null>('/whatsapp/connections'),
  // El backend valida con Meta dentro de la petición (hasta 10 s): se espera hasta 20 s.
  connect: (phoneNumberId: string, wabaId: string) => request<ConnectResult>('/whatsapp/connections', { ...json('POST', { phoneNumberId, wabaId }), signal: AbortSignal.timeout(20000) }),
  agent: () => request<Agent>('/agent/config'),
  saveAgent: (data: AgentUpdate) => request<Agent>('/agent/config', json('PATCH', data)),
  checklist: () => request<Checklist>('/negocios/me/checklist'),
  setAutoAttention: (activa: boolean) => request<{ atencionAutomaticaActiva: boolean }>('/negocios/me/atencion-automatica', json('PATCH', { activa })),
};
