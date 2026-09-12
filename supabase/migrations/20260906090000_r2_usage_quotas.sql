-- =========================================================
-- Suivi mensuel de l'usage Cloudflare R2 (offre gratuite)
-- =========================================================
-- Repères de l'offre gratuite Cloudflare R2 (à la création de ce fichier) :
-- 10 Go de stockage, 1 million d'opérations "Classe A" (écriture,
-- ex. upload) et 10 millions d'opérations "Classe B" (lecture) par mois.
-- Cette table compte, mois par mois, les opérations déclenchées par NOTRE
-- application (la seule à parler à R2), avec une marge de sécurité fixée
-- par l'administrateur pour ne jamais atteindre la vraie limite.

create table public.r2_usage_monthly (
  month date primary key, -- toujours le 1er jour du mois concerné
  class_a_count integer not null default 0,
  class_b_count integer not null default 0,
  bytes_uploaded bigint not null default 0
);

comment on table public.r2_usage_monthly is 'Compteur mensuel des opérations R2 déclenchées par l''application (estimation fiable, basée sur nos propres appels, pas une donnée officielle Cloudflare).';

-- Lecture réservée à l'administrateur (écran Réglages) ; aucune écriture
-- autorisée depuis le navigateur, y compris pour l'admin : seule la
-- fonction serveur (clé secrète) est autorisée à modifier ces compteurs,
-- pour qu'ils ne puissent pas être faussés.
alter table public.r2_usage_monthly enable row level security;

create policy "Seul l'admin consulte l'usage R2"
  on public.r2_usage_monthly for select
  using (public.has_role('admin'));

-- Quotas par défaut, avec marge de sécurité sous les limites réelles.
insert into public.app_settings (key, value) values
  ('r2_quota_class_a_per_month', '900000'),
  ('r2_quota_class_b_per_month', '9000000'),
  ('r2_quota_gb_uploaded_per_month', '9')
on conflict (key) do nothing;
