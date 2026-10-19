-- Tono y estilo regional predefinidos del agente (RF-22), módulo agent.
--
-- ATENCIÓN, normalización con pérdida de datos: `tono` era texto libre. Antes de agregar el
-- CHECK se normaliza con trim + mayúsculas; todo valor que no quede exactamente en
-- (FORMAL, AMABLE, ENTUSIASTA, SEGURO, CERCANO) pasa a NULL (el agente lo interpreta como
-- AMABLE). Revisa antes de aplicar:
--   SELECT DISTINCT tono, count(*) FROM configuracion_agente GROUP BY 1;
--
-- Idempotente: se puede ejecutar más de una vez.

alter table public.configuracion_agente
  add column if not exists estilo_regional text;

update public.configuracion_agente
   set tono = upper(btrim(tono))
 where tono is not null
   and tono is distinct from upper(btrim(tono));

update public.configuracion_agente
   set tono = null
 where tono is not null
   and tono not in ('FORMAL', 'AMABLE', 'ENTUSIASTA', 'SEGURO', 'CERCANO');

-- Por si la columna se creó antes con otro contenido: lo desconocido también pasa a NULL.
update public.configuracion_agente
   set estilo_regional = null
 where estilo_regional is not null
   and estilo_regional not in ('NEUTRO', 'PAISA', 'COSTENO', 'CALENO', 'BOGOTANO');

alter table public.configuracion_agente
  drop constraint if exists chk_tono;

alter table public.configuracion_agente
  add constraint chk_tono
  check (tono is null or tono in ('FORMAL', 'AMABLE', 'ENTUSIASTA', 'SEGURO', 'CERCANO'));

alter table public.configuracion_agente
  drop constraint if exists chk_estilo_regional;

alter table public.configuracion_agente
  add constraint chk_estilo_regional
  check (estilo_regional is null or estilo_regional in ('NEUTRO', 'PAISA', 'COSTENO', 'CALENO', 'BOGOTANO'));
