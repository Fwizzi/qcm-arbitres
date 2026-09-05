-- =========================================================
-- Profils utilisateurs et rôles
-- =========================================================
-- Sur Supabase, les comptes (email, mot de passe) sont gérés par le
-- schéma "auth" fourni automatiquement (table auth.users). On ne
-- touche jamais à cette table : on la complète avec une table
-- "profiles" qui contient les informations propres à l'application.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Informations complémentaires de chaque utilisateur (arbitre, formateur ou administrateur), liées 1-pour-1 à un compte auth.users.';

-- Création automatique de la ligne "profiles" dès que l'administrateur
-- crée un compte (auth.users) depuis l'espace admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un même utilisateur peut cumuler plusieurs rôles (formateur ET arbitre par exemple).
create type public.app_role as enum ('admin', 'formateur', 'arbitre');

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  primary key (user_id, role)
);

comment on table public.user_roles is 'Rôle(s) attribué(s) à chaque utilisateur par l''administrateur. Une ligne par rôle : un utilisateur peut en avoir plusieurs.';

create index user_roles_user_id_idx on public.user_roles (user_id);
