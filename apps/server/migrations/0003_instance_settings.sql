-- Look and feel of this instance, set by whoever runs it.
--
-- Two colours only. Everything else in the interface is derived from them, so a
-- self-hoster can make it look like their organisation without being able to
-- leave the projected screen unreadable.
--
-- The boolean primary key with a check is a single-row table: there is exactly
-- one instance, and no way to accidentally end up with two configurations.
create table instance_settings (
  id           boolean primary key default true check (id),
  base_color   text not null default '#0f3040',
  accent_color text not null default '#4fa8cc',
  updated_at   timestamptz not null default now()
);

insert into instance_settings (id) values (true);
