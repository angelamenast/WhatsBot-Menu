import { randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseService } from '../../../src/shared/supabase/supabase.service';
import { SupabaseNegocioRepository } from '../../../src/modules/business/infrastructure/persistence/supabase-negocio.repository';
import type { Negocio } from '../../../src/modules/business/domain/entities/negocio.entity';
import { SupabaseConversationRepository } from '../../../src/modules/whatsapp/infrastructure/persistence/supabase-conversation.repository';
import { Conversation } from '../../../src/modules/whatsapp/domain/entities/conversation.entity';
import { asSupabaseService, createTestClient } from './supabase-test-client';

export const TEST_PREFIX = 'it_';

export interface TestUser {
  id: string;
  email: string;
}

export interface TestPlanOptions {
  precio?: number;
  limiteTokens?: number | null;
  duracionMeses?: number;
  activo?: boolean;
}

/**
 * Datos de una corrida: todo lo creado lleva el prefijo it_<runId> y queda registrado para
 * borrarlo en cleanup(), en orden inverso a las FK.
 */
export class TestContext {
  readonly runId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  readonly prefix = `${TEST_PREFIX}${this.runId}`;
  readonly client: SupabaseClient = createTestClient();
  readonly service: SupabaseService = asSupabaseService(this.client);

  private readonly users: string[] = [];
  private readonly negocios: string[] = [];
  private readonly planes: string[] = [];
  private readonly passwords = new Map<string, string>();
  private userCount = 0;

  /** Nombre único de la corrida, ej. it_<runId>_categoria. */
  name(suffix: string): string {
    return `${this.prefix}_${suffix}`;
  }

  async createUser(): Promise<TestUser> {
    const n = this.userCount++;
    const email = n === 0 ? `${this.prefix}@test.local` : `${this.prefix}_${n}@test.local`;
    const password = randomBytes(18).toString('base64url');

    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: this.prefix },
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear el usuario de pruebas: ${error?.message}`);
    }
    this.users.push(data.user.id);

    // negocios.usuario_id apunta a public.usuarios (no hay trigger que lo cree).
    const perfil = await this.client.from('usuarios').insert({ id: data.user.id, nombre: this.prefix });
    if (perfil.error) {
      throw new Error(`No se pudo crear el perfil de pruebas: ${perfil.error.message}`);
    }

    this.passwords.set(data.user.id, password);
    return { id: data.user.id, email };
  }

  /**
   * Access token del usuario (signInWithPassword). Usa un cliente aparte: iniciar sesión en
   * this.client cambiaría sus peticiones al rol del usuario en lugar de service_role.
   */
  async signIn(user: TestUser): Promise<string> {
    const { data, error } = await createTestClient().auth.signInWithPassword({
      email: user.email,
      password: this.passwords.get(user.id) ?? '',
    });
    if (error || !data.session) {
      throw new Error(`No se pudo iniciar sesión con el usuario de pruebas: ${error?.message}`);
    }
    return data.session.access_token;
  }

  trackNegocio(id: string): void {
    this.negocios.push(id);
  }

  async createNegocio(usuarioId: string, suffix = 'negocio'): Promise<Negocio> {
    const negocio = await new SupabaseNegocioRepository(this.service).crear({
      usuarioId,
      nombreNegocio: this.name(suffix),
      numeroWhatsapp: null,
      descripcion: `Negocio de pruebas de integración ${this.runId}`,
    });
    this.trackNegocio(negocio.id);
    return negocio;
  }

  /** Usuario + negocio listos para usar. */
  async createUserWithNegocio(suffix = 'negocio'): Promise<{ user: TestUser; negocio: Negocio }> {
    const user = await this.createUser();
    const negocio = await this.createNegocio(user.id, suffix);
    return { user, negocio };
  }

  async createPlan(suffix: string, options: TestPlanOptions = {}): Promise<string> {
    const { data, error } = await this.client
      .from('planes')
      .insert({
        nombre: this.name(suffix),
        precio: options.precio ?? 50000,
        limite_mensajes: null,
        limite_tokens: options.limiteTokens ?? null,
        duracion_meses: options.duracionMeses ?? 1,
        activo: options.activo ?? true,
        descripcion: 'Plan de pruebas de integración',
      })
      .select('id')
      .single();
    if (error) {
      throw new Error(`No se pudo crear el plan de pruebas: ${error.message}`);
    }
    this.planes.push(data.id);
    return data.id;
  }

  /** Conversación activa guardada con el repositorio real (se borra junto con su negocio). */
  async createConversation(businessId: string, customerNumber = this.phone()): Promise<Conversation> {
    const conversation = Conversation.start({ businessId, customerNumber });
    await new SupabaseConversationRepository(this.service).save(conversation);
    return conversation;
  }

  /** Teléfono ficticio único por llamada. */
  phone(): string {
    return `+57999${randomUUID().replace(/\D/g, '').padEnd(7, '0').slice(0, 7)}`;
  }

  /**
   * Borra todo lo creado, hijos antes que padres (varias FK son ON DELETE RESTRICT).
   * Si algo no se puede borrar, lo imprime (solo tabla e id, nunca claves).
   */
  async cleanup(): Promise<void> {
    const leftovers: string[] = [];
    const del = async (table: string, column: string, values: string[]): Promise<void> => {
      if (values.length === 0) return;
      const { error } = await this.client.from(table).delete().in(column, values);
      if (error) {
        leftovers.push(`${table} (${column} in ${values.join(', ')}): ${error.message}`);
      }
    };

    const negocios = [...this.negocios].reverse();
    if (negocios.length > 0) {
      const { data: suscripciones } = await this.client
        .from('suscripciones')
        .select('id')
        .in('negocio_id', negocios);
      const suscripcionIds = (suscripciones ?? []).map((row) => row.id as string);

      await del('pedidos', 'negocio_id', negocios); // pedido_items: ON DELETE CASCADE
      await del('consumo_ia', 'negocio_id', negocios);
      await del('contador_uso_periodo', 'negocio_id', negocios);
      await del('transacciones_pago', 'suscripcion_id', suscripcionIds);
      await del('suscripciones', 'negocio_id', negocios);
      await del('conversaciones', 'negocio_id', negocios); // mensajes: ON DELETE CASCADE
      await del('catalogo_productos', 'negocio_id', negocios);
      await del('categorias_producto', 'negocio_id', negocios);
      await del('negocios', 'id', negocios);
    }

    await del('planes', 'id', [...this.planes].reverse());

    const users = [...this.users].reverse();
    await del('usuarios', 'id', users);
    for (const id of users) {
      const { error } = await this.client.auth.admin.deleteUser(id);
      if (error) leftovers.push(`auth.users (id ${id}): ${error.message}`);
    }

    if (leftovers.length > 0) {
      console.error(
        `[test:int] La limpieza de la corrida ${this.prefix} dejó datos sin borrar:\n  - ${leftovers.join('\n  - ')}`,
      );
    }
  }
}
