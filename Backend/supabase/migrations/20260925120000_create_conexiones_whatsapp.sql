-- Conexión de WhatsApp por negocio (RF-17)
create table conexiones_whatsapp (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null unique references negocios(id) on delete cascade,
  numero_whatsapp text not null unique,
  twilio_subaccount_sid text,
  twilio_sender_sid text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'conectado', 'fallido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El número de WhatsApp del negocio ahora vive en conexiones_whatsapp
alter table negocios drop column numero_whatsapp;

-- Estado de envío por mensaje saliente (RF-19)
alter table mensajes
  add column estado_envio text check (estado_envio in ('enviado', 'fallido', 'pendiente') or estado_envio is null);

-- RLS: mismo patrón de negocios (subquery contra auth.uid())
alter table conexiones_whatsapp enable row level security;

create policy "usuarios ven la conexion whatsapp de su negocio"
  on conexiones_whatsapp
  for select
  using (
    negocio_id in (select id from negocios where usuario_id = auth.uid())
  );

create policy "usuarios crean la conexion whatsapp de su negocio"
  on conexiones_whatsapp
  for insert
  with check (
    negocio_id in (select id from negocios where usuario_id = auth.uid())
  );

create policy "usuarios actualizan la conexion whatsapp de su negocio"
  on conexiones_whatsapp
  for update
  using (
    negocio_id in (select id from negocios where usuario_id = auth.uid())
  )
  with check (
    negocio_id in (select id from negocios where usuario_id = auth.uid())
  );

create policy "usuarios eliminan la conexion whatsapp de su negocio"
  on conexiones_whatsapp
  for delete
  using (
    negocio_id in (select id from negocios where usuario_id = auth.uid())
  );
