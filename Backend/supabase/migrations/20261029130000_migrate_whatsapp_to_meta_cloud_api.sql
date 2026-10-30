-- Migración de WhatsApp de Twilio a la WhatsApp Cloud API de Meta (módulo whatsapp).
--
-- ANTES DE APLICAR: este script BORRA todas las filas de conexiones_whatsapp. Es seguro solo si
-- son filas de prueba (hasta hoy el único proveedor implementado era el fake, que generaba SIDs
-- aleatorios) y no hay conexiones reales. Verifica con:
--   SELECT id, negocio_id, numero_whatsapp, twilio_subaccount_sid, twilio_sender_sid, estado
--   FROM conexiones_whatsapp;
-- Las conexiones se vuelven a crear con POST /api/whatsapp/connections { phoneNumberId, wabaId }.
-- El borrado es necesario porque phone_number_id y waba_id son NOT NULL y no existe un valor
-- válido con el que rellenar filas antiguas.
--
-- Nombres: los identificadores propios de Meta conservan su nombre (como twilio_* conservaba el
-- de Twilio); la columna neutral al proveedor va en español.

BEGIN;

-- 1. conexiones_whatsapp: identificadores de Meta en lugar de los de Twilio.
DELETE FROM public.conexiones_whatsapp;

ALTER TABLE public.conexiones_whatsapp
  DROP COLUMN twilio_subaccount_sid,
  DROP COLUMN twilio_sender_sid,
  ADD COLUMN phone_number_id text NOT NULL,
  ADD COLUMN waba_id text NOT NULL;

-- Por este id llegan los mensajes entrantes (metadata.phone_number_id) y se envían los salientes.
ALTER TABLE public.conexiones_whatsapp
  ADD CONSTRAINT conexiones_whatsapp_phone_number_id_key UNIQUE (phone_number_id);

-- El número visible solo se conoce después de consultar a Meta: una conexión pendiente o fallida
-- no lo tiene. La unicidad (conexiones_whatsapp_numero_whatsapp_key) se conserva; los NULL no chocan.
ALTER TABLE public.conexiones_whatsapp
  ALTER COLUMN numero_whatsapp DROP NOT NULL;

-- 2. mensajes: id del mensaje en el proveedor (wamid), neutral al proveedor.
-- Ya era UNIQUE, y esa unicidad es la red de seguridad de la deduplicación de reintentos del webhook.
-- Las columnas no se tocan: el rename conserva los valores existentes.
ALTER TABLE public.mensajes
  RENAME COLUMN twilio_message_sid TO id_mensaje_proveedor;

-- RENAME CONSTRAINT también renombra el índice único que lo respalda.
ALTER TABLE public.mensajes
  RENAME CONSTRAINT mensajes_twilio_message_sid_key TO mensajes_id_mensaje_proveedor_key;

COMMIT;
