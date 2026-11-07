-- Ciclo de vida de la conversación (módulo whatsapp).
--
-- Una conversación se cierra (estado = 'cerrada') por inactividad o al confirmarse su pedido, y
-- el cliente siguiente abre otra. El constraint viejo UNIQUE (negocio_id, numero_cliente, estado)
-- permitía solo UNA conversación cerrada por cliente, así que el segundo cierre fallaría. El
-- cierre exige que únicamente la ACTIVA sea única.
--
-- Orden deliberado: el índice nuevo se crea primero y el constraint viejo se elimina después,
-- para que nunca haya una ventana sin protección contra dos conversaciones activas.
--
-- Antes de aplicar, esta consulta debe devolver 0 filas (el índice nuevo fallaría si hay dos
-- activas para el mismo cliente; el constraint viejo ya lo impedía):
--   SELECT negocio_id, numero_cliente, count(*) FROM conversaciones
--   WHERE estado = 'activa' GROUP BY 1, 2 HAVING count(*) > 1;
--
-- unique_conversacion_activa es un CONSTRAINT (no un índice suelto): por eso se elimina con
-- DROP CONSTRAINT y no con DROP INDEX.

BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversaciones_activa
  ON public.conversaciones (negocio_id, numero_cliente)
  WHERE estado = 'activa';
ALTER TABLE public.conversaciones
  DROP CONSTRAINT IF EXISTS unique_conversacion_activa;
COMMIT;
