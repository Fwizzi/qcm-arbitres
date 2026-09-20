-- =========================================================
-- File d'attente des invitations (création de compte sans mot de passe)
-- =========================================================
-- L'administrateur n'invente plus de mot de passe pour les nouveaux
-- comptes : il saisit nom/e-mail/rôle(s) (ou dépose un fichier Excel
-- pour plusieurs personnes d'un coup), et la personne choisit elle-même
-- son mot de passe en cliquant sur un lien d'activation.
--
-- Pour l'envoi automatique par e-mail, le compte auth.users n'est créé
-- qu'au moment réel de l'envoi (pas à la mise en file d'attente), car
-- c'est l'appel qui crée le compte ET envoie l'e-mail en une seule
-- action côté Supabase. Cette table ne contient donc, tant que le statut
-- est 'en_attente', que les informations nécessaires pour créer ce
-- compte plus tard.

create table public.invite_queue (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  roles public.app_role[] not null default '{}',
  -- 'en_cours' est un état transitoire très bref, le temps que la fonction
  -- planifiée envoie l'e-mail : il évite qu'un second déclenchement
  -- concurrent ne traite la même ligne deux fois.
  status text not null default 'en_attente' check (status in ('en_attente', 'en_cours', 'envoye', 'echec')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  user_id uuid references auth.users (id) on delete set null,
  erreur text
);

comment on table public.invite_queue is 'File d''attente des invitations par e-mail (création de compte différée, throttlée pour respecter la limite d''envoi de Supabase).';

create index invite_queue_status_created_idx on public.invite_queue (status, created_at);

-- Empêche de mettre deux fois la même adresse en attente en même temps
-- (ex. import Excel déposé deux fois par erreur).
create unique index invite_queue_email_pending_uidx on public.invite_queue (lower(email)) where status = 'en_attente';

alter table public.invite_queue enable row level security;

-- Lecture et création réservées à l'administrateur (même modèle que les
-- autres écrans d'administration des comptes).
create policy "Admin lit la file d'attente"
  on public.invite_queue for select
  using (public.has_role('admin'));

create policy "Admin met en file d'attente"
  on public.invite_queue for insert
  with check (public.has_role('admin'));

-- Permet à l'admin d'annuler une invitation pas encore envoyée
-- (ex. faute de frappe dans un import Excel).
create policy "Admin annule une invitation en attente"
  on public.invite_queue for delete
  using (public.has_role('admin') and status = 'en_attente');

-- Aucune policy UPDATE côté "authenticated" : seule la fonction
-- planifiée (clé de service, qui contourne RLS) fait passer une ligne de
-- 'en_attente' à 'envoye' ou 'echec'.

grant select, insert, delete on public.invite_queue to authenticated;
