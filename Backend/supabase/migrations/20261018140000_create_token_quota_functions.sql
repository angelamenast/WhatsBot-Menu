-- Cuota de tokens por plan (RNF-08), módulo agent.
--
-- Tres funciones. El periodo de cuota se calcula SOLO aquí, para que lectura y escritura del
-- contador no puedan discrepar en la clave (negocio_id, periodo_inicio):
--
--   * periodo_uso_actual: ventana mensual (calendario de Colombia) anclada en la fecha_fin de
--     la suscripción: [fecha_fin - (k+1) meses, fecha_fin - k meses) con la menor k que
--     contiene "ahora". Renovar extiende la MISMA suscripción moviendo fecha_fin un mes
--     (procesar-webhook-pago), así que las ventanas siguen alineadas y el contador continúa.
--     Si se renueva ya vencida, fecha_fin = ahora + 1 mes y arranca un periodo nuevo.
--   * consultar_cuota_tokens: lee límite del plan y tokens usados en el periodo actual.
--   * registrar_consumo_ia: en UNA transacción inserta en consumo_ia y suma en
--     contador_uso_periodo (upsert por negocio_id + periodo_inicio). Sin suscripción vigente
--     inserta solo en consumo_ia.
--
-- "Vigente" = suscripcion.estado = 'activa' y fecha_fin > now() (igual que calcularEstadoAcceso).
-- Mismo patrón de permisos que crear_pedido: solo el backend (service_role) puede ejecutarlas.
-- Idempotente (create or replace).

create or replace function public.periodo_uso_actual(
  p_fecha_fin timestamptz,
  p_ahora timestamptz
)
returns table (periodo_inicio timestamptz, periodo_fin timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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

create or replace function public.consultar_cuota_tokens(p_negocio_id uuid)
returns table (hay_suscripcion boolean, limite_tokens bigint, tokens_usados bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
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

create or replace function public.registrar_consumo_ia(
  p_negocio_id uuid,
  p_conversacion_id uuid,
  p_mensaje_id uuid,
  p_tokens_entrada integer,
  p_tokens_salida integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.periodo_uso_actual(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.periodo_uso_actual(timestamptz, timestamptz) to service_role;

revoke all on function public.consultar_cuota_tokens(uuid) from public, anon, authenticated;
grant execute on function public.consultar_cuota_tokens(uuid) to service_role;

revoke all on function public.registrar_consumo_ia(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.registrar_consumo_ia(uuid, uuid, uuid, integer, integer) to service_role;
