-- Modelo que realmente respondió en cada llamada al LLM (módulo agent).
--
-- Con modelo de respaldo, el que responde puede no ser el configurado como principal: el consumo
-- se registra con el modelo real para poder auditar costos y fallos por modelo.
--
--   * consumo_ia.modelo: texto libre, NULL para filas anteriores y para proveedores que no lo informan.
--   * registrar_consumo_ia recibe p_modelo (default NULL). Se elimina la firma anterior de 5
--     parámetros: si se dejaran las dos, una llamada con nombres de parámetros sería ambigua.
--
-- ORDEN DE DESPLIEGUE: aplica esta migración ANTES de desplegar el código nuevo. El código llama a
-- registrar_consumo_ia con p_modelo; sin la migración la función no existe con esa firma y el consumo
-- de tokens no se registraría (la respuesta al cliente se entrega igual, pero se pierde el registro).
--
-- Idempotente: se puede ejecutar más de una vez.

BEGIN;

ALTER TABLE public.consumo_ia
  ADD COLUMN IF NOT EXISTS modelo text;

DROP FUNCTION IF EXISTS public.registrar_consumo_ia(uuid, uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.registrar_consumo_ia(
  p_negocio_id uuid,
  p_conversacion_id uuid,
  p_mensaje_id uuid,
  p_tokens_entrada integer,
  p_tokens_salida integer,
  p_modelo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_suscripcion_id uuid;
  v_fecha_fin timestamptz;
  v_inicio timestamptz;
  v_fin timestamptz;
BEGIN
  INSERT INTO public.consumo_ia (negocio_id, conversacion_id, mensaje_id, tokens_entrada, tokens_salida, modelo)
  VALUES (p_negocio_id, p_conversacion_id, p_mensaje_id, p_tokens_entrada, p_tokens_salida, p_modelo);

  SELECT s.id, s.fecha_fin
    INTO v_suscripcion_id, v_fecha_fin
  FROM public.suscripciones s
  WHERE s.negocio_id = p_negocio_id
    AND s.estado = 'activa'
    AND s.fecha_fin > now()
  ORDER BY s.fecha_fin DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT u.periodo_inicio, u.periodo_fin
    INTO v_inicio, v_fin
  FROM public.periodo_uso_actual(v_fecha_fin, now()) u;

  INSERT INTO public.contador_uso_periodo (negocio_id, suscripcion_id, periodo_inicio, periodo_fin, tokens_usados)
  VALUES (p_negocio_id, v_suscripcion_id, v_inicio, v_fin, p_tokens_entrada + p_tokens_salida)
  ON CONFLICT (negocio_id, periodo_inicio) DO UPDATE
    SET tokens_usados = public.contador_uso_periodo.tokens_usados + excluded.tokens_usados,
        periodo_fin = excluded.periodo_fin,
        suscripcion_id = excluded.suscripcion_id;
END;
$$;

-- Mismo patrón de permisos que el resto de funciones de cuota: solo el backend (service_role).
REVOKE ALL ON FUNCTION public.registrar_consumo_ia(uuid, uuid, uuid, integer, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_ia(uuid, uuid, uuid, integer, integer, text) TO service_role;

COMMIT;
