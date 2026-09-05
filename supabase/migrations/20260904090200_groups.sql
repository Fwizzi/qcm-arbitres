-- =========================================================
-- Groupes d'arbitres (créés et gérés par les formateurs)
-- =========================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  formateur_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.groups is 'Groupe d''arbitres créé et géré par un formateur, utilisé pour cibler l''envoi des QCM.';

create index groups_formateur_id_idx on public.groups (formateur_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

comment on table public.group_members is 'Arbitres appartenant à un groupe. Un arbitre peut appartenir à plusieurs groupes.';

create index group_members_user_id_idx on public.group_members (user_id);

-- Un formateur peut partager un groupe avec un(des) collègue(s) : celui-ci
-- peut l'utiliser tel quel pour cibler ses propres QCM, mais ne peut pas
-- en modifier la composition (voir §5 du cahier des charges).
create table public.group_shares (
  group_id uuid not null references public.groups (id) on delete cascade,
  shared_with_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, shared_with_user_id)
);

comment on table public.group_shares is 'Partage en lecture seule d''un groupe d''arbitres à un autre formateur.';
