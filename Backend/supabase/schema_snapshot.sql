


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."consultar_cuota_tokens"("p_negocio_id" "uuid") RETURNS TABLE("hay_suscripcion" boolean, "limite_tokens" bigint, "tokens_usados" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_limite bigint;
  v_fecha_fin timestamptz;
  v_inicio timestamptz;
  v_usados bigint;
begin
  select p.limite_tokens, s.fecha_fin
    into v_limite, v_fecha_fin
  from public.suscripciones s
  join public.planes p on p.id = s.plan_id
  where s.negocio_id = p_negocio_id
    and s.estado = 'activa'
    and s.fecha_fin > now()
  order by s.fecha_fin desc
  limit 1;

  if not found then
    return query select false, null::bigint, 0::bigint;
    return;
  end if;

  select u.periodo_inicio into v_inicio from public.periodo_uso_actual(v_fecha_fin, now()) u;

  select coalesce(c.tokens_usados, 0)
    into v_usados
  from public.contador_uso_periodo c
  where c.negocio_id = p_negocio_id
    and c.periodo_inicio = v_inicio;

  return query select true, v_limite, coalesce(v_usados, 0);
end;
$$;


ALTER FUNCTION "public"."consultar_cuota_tokens"("p_negocio_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_pedido"("p_pedido_id" "uuid", "p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_items" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_total numeric(12, 2);
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_WITHOUT_ITEMS: un pedido necesita al menos un item';
  end if;

  -- pedidos.conversacion_id solo tiene FK a conversaciones(id): no impide
  -- asociar un pedido a la conversación de OTRO negocio. Se verifica aquí.
  if not exists (
    select 1
    from public.conversaciones c
    where c.id = p_conversacion_id
      and c.negocio_id = p_negocio_id
  ) then
    raise exception 'CONVERSATION_NOT_IN_BUSINESS: la conversación % no pertenece al negocio %',
      p_conversacion_id, p_negocio_id;
  end if;

  -- El total se calcula aquí desde los items, nunca llega como parámetro.
  -- round(..., 2) iguala la precisión de pedido_items.precio_unitario (numeric(12,2))
  -- para que el total coincida con la suma de los subtotales ya guardados.
  select coalesce(sum(round(i.precio_unitario, 2) * i.cantidad), 0)
    into v_total
  from jsonb_to_recordset(p_items) as i(
    producto_id uuid,
    nombre_producto_snapshot text,
    precio_unitario numeric,
    cantidad integer
  );

  insert into public.pedidos (id, negocio_id, conversacion_id, estado_codigo, total)
  values (p_pedido_id, p_negocio_id, p_conversacion_id, 'pendiente', v_total);

  -- subtotal es una columna generada: no se inserta.
  insert into public.pedido_items (
    pedido_id, producto_id, nombre_producto_snapshot, precio_unitario, cantidad
  )
  select
    p_pedido_id,
    i.producto_id,
    i.nombre_producto_snapshot,
    i.precio_unitario,
    i.cantidad
  from jsonb_to_recordset(p_items) as i(
    producto_id uuid,
    nombre_producto_snapshot text,
    precio_unitario numeric,
    cantidad integer
  );

  return p_pedido_id;
end;
$$;


ALTER FUNCTION "public"."crear_pedido"("p_pedido_id" "uuid", "p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."periodo_uso_actual"("p_fecha_fin" timestamp with time zone, "p_ahora" timestamp with time zone) RETURNS TABLE("periodo_inicio" timestamp with time zone, "periodo_fin" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_fin_local timestamp := p_fecha_fin at time zone 'America/Bogota';
  v_k integer := 0;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  loop
    v_fin := (v_fin_local - (v_k * interval '1 month')) at time zone 'America/Bogota';
    v_inicio := (v_fin_local - ((v_k + 1) * interval '1 month')) at time zone 'America/Bogota';
    exit when p_ahora >= v_inicio;
    v_k := v_k + 1;
  end loop;

  return query select v_inicio, v_fin;
end;
$$;


ALTER FUNCTION "public"."periodo_uso_actual"("p_fecha_fin" timestamp with time zone, "p_ahora" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_consumo_ia"("p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_mensaje_id" "uuid", "p_tokens_entrada" integer, "p_tokens_salida" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_suscripcion_id uuid;
  v_fecha_fin timestamptz;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  insert into public.consumo_ia (negocio_id, conversacion_id, mensaje_id, tokens_entrada, tokens_salida)
  values (p_negocio_id, p_conversacion_id, p_mensaje_id, p_tokens_entrada, p_tokens_salida);

  select s.id, s.fecha_fin
    into v_suscripcion_id, v_fecha_fin
  from public.suscripciones s
  where s.negocio_id = p_negocio_id
    and s.estado = 'activa'
    and s.fecha_fin > now()
  order by s.fecha_fin desc
  limit 1;

  if not found then
    return;
  end if;

  select u.periodo_inicio, u.periodo_fin
    into v_inicio, v_fin
  from public.periodo_uso_actual(v_fecha_fin, now()) u;

  insert into public.contador_uso_periodo (negocio_id, suscripcion_id, periodo_inicio, periodo_fin, tokens_usados)
  values (p_negocio_id, v_suscripcion_id, v_inicio, v_fin, p_tokens_entrada + p_tokens_salida)
  on conflict (negocio_id, periodo_inicio) do update
    set tokens_usados = public.contador_uso_periodo.tokens_usados + excluded.tokens_usados,
        periodo_fin = excluded.periodo_fin,
        suscripcion_id = excluded.suscripcion_id;
end;
$$;


ALTER FUNCTION "public"."registrar_consumo_ia"("p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_mensaje_id" "uuid", "p_tokens_entrada" integer, "p_tokens_salida" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."catalogo_productos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "categoria_id" "uuid",
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "precio" numeric(12,2) NOT NULL,
    "disponible" boolean DEFAULT true NOT NULL,
    "imagen_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "catalogo_productos_precio_check" CHECK (("precio" >= (0)::numeric))
);


ALTER TABLE "public"."catalogo_productos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias_producto" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."categorias_producto" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conexiones_whatsapp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "numero_whatsapp" "text" NOT NULL,
    "twilio_subaccount_sid" "text",
    "twilio_sender_sid" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conexiones_whatsapp_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'conectado'::"text", 'fallido'::"text"])))
);


ALTER TABLE "public"."conexiones_whatsapp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion_agente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "personalidad" "text",
    "tono" "text",
    "mensaje_bienvenida" "text",
    "horario_atencion" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "estilo_regional" "text",
    "mensaje_no_disponible" "text",
    CONSTRAINT "chk_estilo_regional" CHECK ((("estilo_regional" IS NULL) OR ("estilo_regional" = ANY (ARRAY['NEUTRO'::"text", 'PAISA'::"text", 'COSTENO'::"text", 'CALENO'::"text", 'BOGOTANO'::"text"])))),
    CONSTRAINT "chk_tono" CHECK ((("tono" IS NULL) OR ("tono" = ANY (ARRAY['FORMAL'::"text", 'AMABLE'::"text", 'ENTUSIASTA'::"text", 'SEGURO'::"text", 'CERCANO'::"text"]))))
);


ALTER TABLE "public"."configuracion_agente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumo_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "conversacion_id" "uuid",
    "mensaje_id" "uuid",
    "tokens_entrada" integer NOT NULL,
    "tokens_salida" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "consumo_ia_tokens_entrada_check" CHECK (("tokens_entrada" >= 0)),
    CONSTRAINT "consumo_ia_tokens_salida_check" CHECK (("tokens_salida" >= 0))
);


ALTER TABLE "public"."consumo_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contador_uso_periodo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "suscripcion_id" "uuid" NOT NULL,
    "periodo_inicio" timestamp with time zone NOT NULL,
    "periodo_fin" timestamp with time zone NOT NULL,
    "tokens_usados" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."contador_uso_periodo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "numero_cliente" "text" NOT NULL,
    "estado" "text" DEFAULT 'activa'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversaciones_estado_check" CHECK (("estado" = ANY (ARRAY['activa'::"text", 'cerrada'::"text"])))
);


ALTER TABLE "public"."conversaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estados_pedido" (
    "codigo" "text" NOT NULL,
    "orden" integer NOT NULL
);


ALTER TABLE "public"."estados_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mensajes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "remitente" "text" NOT NULL,
    "contenido" "text" NOT NULL,
    "twilio_message_sid" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "estado_envio" "text",
    CONSTRAINT "mensajes_estado_envio_check" CHECK ((("estado_envio" = ANY (ARRAY['enviado'::"text", 'fallido'::"text", 'pendiente'::"text"])) OR ("estado_envio" IS NULL))),
    CONSTRAINT "mensajes_remitente_check" CHECK (("remitente" = ANY (ARRAY['cliente'::"text", 'agente_ia'::"text", 'sistema'::"text"])))
);


ALTER TABLE "public"."mensajes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."negocios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "nombre_negocio" "text" NOT NULL,
    "descripcion" "text",
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "numero_whatsapp" "text",
    "atencion_automatica_activa" boolean DEFAULT false NOT NULL,
    CONSTRAINT "negocios_estado_check" CHECK (("estado" = ANY (ARRAY['activo'::"text", 'inactivo'::"text", 'suspendido'::"text"])))
);


ALTER TABLE "public"."negocios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedido_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "producto_id" "uuid",
    "nombre_producto_snapshot" "text" NOT NULL,
    "precio_unitario" numeric(12,2) NOT NULL,
    "cantidad" integer NOT NULL,
    "subtotal" numeric(12,2) GENERATED ALWAYS AS (("precio_unitario" * ("cantidad")::numeric)) STORED,
    CONSTRAINT "pedido_items_cantidad_check" CHECK (("cantidad" > 0)),
    CONSTRAINT "pedido_items_precio_unitario_check" CHECK (("precio_unitario" >= (0)::numeric))
);


ALTER TABLE "public"."pedido_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "estado_codigo" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "pedidos_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "precio" numeric(12,2) NOT NULL,
    "limite_mensajes" integer,
    "limite_tokens" bigint,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "duracion_meses" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "planes_duracion_meses_check" CHECK (("duracion_meses" > 0)),
    CONSTRAINT "planes_precio_check" CHECK (("precio" >= (0)::numeric))
);


ALTER TABLE "public"."planes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suscripciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "negocio_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "estado" "text" NOT NULL,
    "fecha_inicio" timestamp with time zone NOT NULL,
    "fecha_fin" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "suscripciones_estado_check" CHECK (("estado" = ANY (ARRAY['activa'::"text", 'vencida'::"text", 'cancelada'::"text", 'pendiente'::"text"])))
);


ALTER TABLE "public"."suscripciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transacciones_pago" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suscripcion_id" "uuid" NOT NULL,
    "referencia_wompi" "text" NOT NULL,
    "monto" numeric(12,2) NOT NULL,
    "estado" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transacciones_pago_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aprobado'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "transacciones_pago_monto_check" CHECK (("monto" >= (0)::numeric))
);


ALTER TABLE "public"."transacciones_pago" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


ALTER TABLE ONLY "public"."catalogo_productos"
    ADD CONSTRAINT "catalogo_productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias_producto"
    ADD CONSTRAINT "categorias_producto_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conexiones_whatsapp"
    ADD CONSTRAINT "conexiones_whatsapp_negocio_id_key" UNIQUE ("negocio_id");



ALTER TABLE ONLY "public"."conexiones_whatsapp"
    ADD CONSTRAINT "conexiones_whatsapp_numero_whatsapp_key" UNIQUE ("numero_whatsapp");



ALTER TABLE ONLY "public"."conexiones_whatsapp"
    ADD CONSTRAINT "conexiones_whatsapp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_agente"
    ADD CONSTRAINT "configuracion_agente_negocio_id_key" UNIQUE ("negocio_id");



ALTER TABLE ONLY "public"."configuracion_agente"
    ADD CONSTRAINT "configuracion_agente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumo_ia"
    ADD CONSTRAINT "consumo_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contador_uso_periodo"
    ADD CONSTRAINT "contador_uso_periodo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversaciones"
    ADD CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estados_pedido"
    ADD CONSTRAINT "estados_pedido_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_twilio_message_sid_key" UNIQUE ("twilio_message_sid");



ALTER TABLE ONLY "public"."negocios"
    ADD CONSTRAINT "negocios_numero_whatsapp_key" UNIQUE ("numero_whatsapp");



ALTER TABLE ONLY "public"."negocios"
    ADD CONSTRAINT "negocios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planes"
    ADD CONSTRAINT "planes_nombre_key" UNIQUE ("nombre");



ALTER TABLE ONLY "public"."planes"
    ADD CONSTRAINT "planes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transacciones_pago"
    ADD CONSTRAINT "transacciones_pago_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transacciones_pago"
    ADD CONSTRAINT "transacciones_pago_referencia_wompi_key" UNIQUE ("referencia_wompi");



ALTER TABLE ONLY "public"."categorias_producto"
    ADD CONSTRAINT "unique_negocio_categoria_nombre" UNIQUE ("negocio_id", "nombre");



ALTER TABLE ONLY "public"."contador_uso_periodo"
    ADD CONSTRAINT "unique_negocio_periodo" UNIQUE ("negocio_id", "periodo_inicio");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_consumo_ia_negocio_id" ON "public"."consumo_ia" USING "btree" ("negocio_id");



CREATE INDEX "idx_contador_uso_negocio_id" ON "public"."contador_uso_periodo" USING "btree" ("negocio_id");



CREATE INDEX "idx_conversaciones_negocio_id" ON "public"."conversaciones" USING "btree" ("negocio_id");



CREATE INDEX "idx_mensajes_conversacion_created" ON "public"."mensajes" USING "btree" ("conversacion_id", "created_at");



CREATE INDEX "idx_negocios_usuario_id" ON "public"."negocios" USING "btree" ("usuario_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_pedido_items_pedido_id" ON "public"."pedido_items" USING "btree" ("pedido_id");



CREATE INDEX "idx_pedidos_negocio_created" ON "public"."pedidos" USING "btree" ("negocio_id", "created_at" DESC, "id" DESC);



CREATE INDEX "idx_pedidos_negocio_id" ON "public"."pedidos" USING "btree" ("negocio_id");



CREATE INDEX "idx_productos_negocio_id" ON "public"."catalogo_productos" USING "btree" ("negocio_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_suscripciones_negocio_id" ON "public"."suscripciones" USING "btree" ("negocio_id");



CREATE INDEX "idx_transacciones_suscripcion_id" ON "public"."transacciones_pago" USING "btree" ("suscripcion_id");



CREATE UNIQUE INDEX "uq_conversaciones_activa" ON "public"."conversaciones" USING "btree" ("negocio_id", "numero_cliente") WHERE ("estado" = 'activa'::"text");



CREATE UNIQUE INDEX "uq_pedidos_conversacion_abierto" ON "public"."pedidos" USING "btree" ("conversacion_id") WHERE ("estado_codigo" <> 'cancelado'::"text");



CREATE UNIQUE INDEX "uq_productos_negocio_nombre_activo" ON "public"."catalogo_productos" USING "btree" ("negocio_id", "lower"("nombre")) WHERE ("deleted_at" IS NULL);



ALTER TABLE ONLY "public"."catalogo_productos"
    ADD CONSTRAINT "catalogo_productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_producto"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."catalogo_productos"
    ADD CONSTRAINT "catalogo_productos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categorias_producto"
    ADD CONSTRAINT "categorias_producto_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conexiones_whatsapp"
    ADD CONSTRAINT "conexiones_whatsapp_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."configuracion_agente"
    ADD CONSTRAINT "configuracion_agente_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consumo_ia"
    ADD CONSTRAINT "consumo_ia_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consumo_ia"
    ADD CONSTRAINT "consumo_ia_mensaje_id_fkey" FOREIGN KEY ("mensaje_id") REFERENCES "public"."mensajes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consumo_ia"
    ADD CONSTRAINT "consumo_ia_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contador_uso_periodo"
    ADD CONSTRAINT "contador_uso_periodo_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contador_uso_periodo"
    ADD CONSTRAINT "contador_uso_periodo_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversaciones"
    ADD CONSTRAINT "conversaciones_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."negocios"
    ADD CONSTRAINT "negocios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."catalogo_productos"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_estado_codigo_fkey" FOREIGN KEY ("estado_codigo") REFERENCES "public"."estados_pedido"("codigo");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suscripciones"
    ADD CONSTRAINT "suscripciones_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transacciones_pago"
    ADD CONSTRAINT "transacciones_pago_suscripcion_id_fkey" FOREIGN KEY ("suscripcion_id") REFERENCES "public"."suscripciones"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "backend can insert usuarios" ON "public"."usuarios" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "backend can manage negocios" ON "public"."negocios" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."catalogo_productos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categorias_producto" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conexiones_whatsapp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."configuracion_agente" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consumo_ia" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contador_uso_periodo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversaciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cualquier autenticado puede leer los estados" ON "public"."estados_pedido" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cualquier autenticado puede leer los planes" ON "public"."planes" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."estados_pedido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensajes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."negocios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedido_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suscripciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transacciones_pago" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuario ve solo categorias de sus negocios" ON "public"."categorias_producto" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo conversaciones de sus negocios" ON "public"."conversaciones" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo items de sus pedidos" ON "public"."pedido_items" USING (("pedido_id" IN ( SELECT "p"."id"
   FROM ("public"."pedidos" "p"
     JOIN "public"."negocios" "n" ON (("n"."id" = "p"."negocio_id")))
  WHERE ("n"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo la configuración de sus negocios" ON "public"."configuracion_agente" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo mensajes de sus conversaciones" ON "public"."mensajes" USING (("conversacion_id" IN ( SELECT "c"."id"
   FROM ("public"."conversaciones" "c"
     JOIN "public"."negocios" "n" ON (("n"."id" = "c"."negocio_id")))
  WHERE ("n"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo pedidos de sus negocios" ON "public"."pedidos" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo productos de sus negocios" ON "public"."catalogo_productos" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo su consumo de ia" ON "public"."consumo_ia" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo su contador de uso" ON "public"."contador_uso_periodo" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo su propio perfil" ON "public"."usuarios" USING (("id" = "auth"."uid"()));



CREATE POLICY "usuario ve solo sus negocios" ON "public"."negocios" USING (("usuario_id" = "auth"."uid"()));



CREATE POLICY "usuario ve solo sus suscripciones" ON "public"."suscripciones" USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuario ve solo sus transacciones" ON "public"."transacciones_pago" USING (("suscripcion_id" IN ( SELECT "s"."id"
   FROM ("public"."suscripciones" "s"
     JOIN "public"."negocios" "n" ON (("n"."id" = "s"."negocio_id")))
  WHERE ("n"."usuario_id" = "auth"."uid"()))));



ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios actualizan la conexion whatsapp de su negocio" ON "public"."conexiones_whatsapp" FOR UPDATE USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"())))) WITH CHECK (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuarios crean la conexion whatsapp de su negocio" ON "public"."conexiones_whatsapp" FOR INSERT WITH CHECK (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuarios eliminan la conexion whatsapp de su negocio" ON "public"."conexiones_whatsapp" FOR DELETE USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



CREATE POLICY "usuarios ven la conexion whatsapp de su negocio" ON "public"."conexiones_whatsapp" FOR SELECT USING (("negocio_id" IN ( SELECT "negocios"."id"
   FROM "public"."negocios"
  WHERE ("negocios"."usuario_id" = "auth"."uid"()))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."consultar_cuota_tokens"("p_negocio_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consultar_cuota_tokens"("p_negocio_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_pedido"("p_pedido_id" "uuid", "p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_pedido"("p_pedido_id" "uuid", "p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."periodo_uso_actual"("p_fecha_fin" timestamp with time zone, "p_ahora" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."periodo_uso_actual"("p_fecha_fin" timestamp with time zone, "p_ahora" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_consumo_ia"("p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_mensaje_id" "uuid", "p_tokens_entrada" integer, "p_tokens_salida" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_consumo_ia"("p_negocio_id" "uuid", "p_conversacion_id" "uuid", "p_mensaje_id" "uuid", "p_tokens_entrada" integer, "p_tokens_salida" integer) TO "service_role";



GRANT ALL ON TABLE "public"."catalogo_productos" TO "anon";
GRANT ALL ON TABLE "public"."catalogo_productos" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogo_productos" TO "service_role";



GRANT ALL ON TABLE "public"."categorias_producto" TO "anon";
GRANT ALL ON TABLE "public"."categorias_producto" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_producto" TO "service_role";



GRANT ALL ON TABLE "public"."conexiones_whatsapp" TO "anon";
GRANT ALL ON TABLE "public"."conexiones_whatsapp" TO "authenticated";
GRANT ALL ON TABLE "public"."conexiones_whatsapp" TO "service_role";



GRANT ALL ON TABLE "public"."configuracion_agente" TO "anon";
GRANT ALL ON TABLE "public"."configuracion_agente" TO "authenticated";
GRANT ALL ON TABLE "public"."configuracion_agente" TO "service_role";



GRANT ALL ON TABLE "public"."consumo_ia" TO "anon";
GRANT ALL ON TABLE "public"."consumo_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."consumo_ia" TO "service_role";



GRANT ALL ON TABLE "public"."contador_uso_periodo" TO "anon";
GRANT ALL ON TABLE "public"."contador_uso_periodo" TO "authenticated";
GRANT ALL ON TABLE "public"."contador_uso_periodo" TO "service_role";



GRANT ALL ON TABLE "public"."conversaciones" TO "anon";
GRANT ALL ON TABLE "public"."conversaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."conversaciones" TO "service_role";



GRANT ALL ON TABLE "public"."estados_pedido" TO "anon";
GRANT ALL ON TABLE "public"."estados_pedido" TO "authenticated";
GRANT ALL ON TABLE "public"."estados_pedido" TO "service_role";



GRANT ALL ON TABLE "public"."mensajes" TO "anon";
GRANT ALL ON TABLE "public"."mensajes" TO "authenticated";
GRANT ALL ON TABLE "public"."mensajes" TO "service_role";



GRANT ALL ON TABLE "public"."negocios" TO "anon";
GRANT ALL ON TABLE "public"."negocios" TO "authenticated";
GRANT ALL ON TABLE "public"."negocios" TO "service_role";



GRANT ALL ON TABLE "public"."pedido_items" TO "anon";
GRANT ALL ON TABLE "public"."pedido_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pedido_items" TO "service_role";



GRANT ALL ON TABLE "public"."pedidos" TO "anon";
GRANT ALL ON TABLE "public"."pedidos" TO "authenticated";
GRANT ALL ON TABLE "public"."pedidos" TO "service_role";



GRANT ALL ON TABLE "public"."planes" TO "anon";
GRANT ALL ON TABLE "public"."planes" TO "authenticated";
GRANT ALL ON TABLE "public"."planes" TO "service_role";



GRANT ALL ON TABLE "public"."suscripciones" TO "anon";
GRANT ALL ON TABLE "public"."suscripciones" TO "authenticated";
GRANT ALL ON TABLE "public"."suscripciones" TO "service_role";



GRANT ALL ON TABLE "public"."transacciones_pago" TO "anon";
GRANT ALL ON TABLE "public"."transacciones_pago" TO "authenticated";
GRANT ALL ON TABLE "public"."transacciones_pago" TO "service_role";



GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







