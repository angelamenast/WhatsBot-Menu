-- Periodicidad de los planes: cuántos meses de vigencia da un pago (1 = mensual, 12 = anual).
-- El webhook de pagos y la renovación suman esta duración a fecha_fin.
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS duracion_meses integer NOT NULL DEFAULT 1;

ALTER TABLE public.planes
  DROP CONSTRAINT IF EXISTS planes_duracion_meses_check;

ALTER TABLE public.planes
  ADD CONSTRAINT planes_duracion_meses_check CHECK (duracion_meses > 0);

-- Hasta ahora el front distinguía los planes anuales solo por el nombre; se conserva ese criterio
-- para los planes que ya existen. Revisar el resultado y corregir a mano si algún nombre no aplica.
UPDATE public.planes
SET duracion_meses = 12
WHERE nombre ILIKE '%anual%' OR nombre ILIKE '%annual%';
