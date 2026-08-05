-- Un código de rol es un token al portador: quien lo tiene, se vuelve ese rol.
-- Sin límite ni control, un enlace filtrado convierte a cualquier curioso en
-- Legales y la asimetría de información —el punto del ejercicio— se cae sola.
--
-- Dos frenos, que se combinan:
--   · el cupo del rol, que sale del escenario y actúa solo;
--   · la aprobación de quien conduce, para cuando querés mirar quién entra.
alter table participants
  add column status text not null default 'active'
    check (status in ('active', 'pending', 'rejected'));

-- Los que esperan aprobación se consultan seguido mientras se llena la sala.
create index participants_pending_idx
  on participants (session_id)
  where status = 'pending';

alter table sessions
  add column approval_mode text not null default 'none'
    check (approval_mode in ('none', 'protected', 'all'));
