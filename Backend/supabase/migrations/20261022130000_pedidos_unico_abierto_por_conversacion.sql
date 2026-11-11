-- Un solo pedido NO cancelado por conversación (módulo orders / agent).
--
-- Si el pedido se cancela, el cliente puede hacer otro en la misma conversación. El agente
-- relee la verdad en el backend ("el LLM decide cuándo, el backend decide si"), y este índice
-- es la red de seguridad ante dos creaciones simultáneas.
--
-- Antes de aplicar, esta consulta debe devolver 0 filas (si no, el índice no se puede crear
-- y hay que cancelar o consolidar los pedidos duplicados a mano):
--   SELECT conversacion_id, count(*) FROM pedidos
--   WHERE estado_codigo <> 'cancelado' GROUP BY 1 HAVING count(*) > 1;
--
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_conversacion_abierto
  ON public.pedidos (conversacion_id)
  WHERE estado_codigo <> 'cancelado';
