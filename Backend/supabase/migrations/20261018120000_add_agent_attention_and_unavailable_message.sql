-- Atención automática del agente y mensaje de no disponibilidad (módulo agent).
--
-- * negocios.atencion_automatica_activa: interruptor del dueño. DEFAULT false: tras aplicar
--   esta migración NINGÚN negocio existente recibe respuestas del agente hasta que lo active
--   (con false, el agente responde solo el mensaje de no disponibilidad, sin LLM).
-- * configuracion_agente.mensaje_no_disponible: texto que se envía mientras la atención
--   automática está desactivada. NULL = el backend usa su texto por defecto.
--
-- Idempotente: se puede ejecutar más de una vez.

alter table public.negocios
  add column if not exists atencion_automatica_activa boolean not null default false;

alter table public.configuracion_agente
  add column if not exists mensaje_no_disponible text;
