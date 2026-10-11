-- Índice para el listado de pedidos del dashboard (módulo orders):
--   WHERE negocio_id = $1 [AND created_at >= $2 AND created_at < $3]
--   ORDER BY created_at DESC, id DESC  LIMIT/OFFSET
-- Cubre filtro por negocio, rango de fechas y el orden completo (incluido el
-- desempate por id) sin ordenar en memoria.

create index if not exists idx_pedidos_negocio_created
  on public.pedidos (negocio_id, created_at desc, id desc);

-- idx_pedidos_negocio_id (solo negocio_id) queda redundante: este índice
-- compuesto lo cubre por su prefijo. NO se elimina aquí; hacerlo es decisión
-- aparte, una vez comprobado en producción que el nuevo se usa.
-- drop index if exists public.idx_pedidos_negocio_id;
