-- Creación atómica de un pedido con sus items (módulo orders).
-- supabase-js no ofrece transacciones multi-tabla: con dos inserts separados un
-- fallo en el segundo dejaba un pedido sin items. Una función plpgsql corre
-- completa en una sola transacción (todo o nada).

create or replace function public.crear_pedido(
  p_pedido_id uuid,
  p_negocio_id uuid,
  p_conversacion_id uuid,
  p_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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

-- Los default privileges del schema public otorgan EXECUTE a anon y authenticated
-- (PostgREST expondría la función como /rpc/crear_pedido). Solo el backend, con
-- service_role, debe poder crear pedidos.
revoke all on function public.crear_pedido(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido(uuid, uuid, uuid, jsonb) to service_role;
