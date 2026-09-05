-- =========================================================
-- Tentatives de réponse des arbitres, journal, réglages
-- =========================================================

create type public.attempt_status as enum ('in_progress', 'submitted', 'auto_submitted');

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  status public.attempt_status not null default 'in_progress',
  score integer,
  unique (quiz_id, user_id)
);

comment on table public.quiz_attempts is 'Une ligne par arbitre et par QCM (une seule tentative autorisée, contrainte unique ci-dessus). started_at = heure H de déverrouillage, utilisée pour calculer la limite de temps.';

create index quiz_attempts_user_id_idx on public.quiz_attempts (user_id);
create index quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id);

create table public.selected_answers (
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  option_id uuid not null references public.answer_options (id) on delete cascade,
  primary key (attempt_id, option_id)
);

comment on table public.selected_answers is 'Cases cochées par l''arbitre pour chaque question, au sein d''une tentative.';

create index selected_answers_attempt_id_idx on public.selected_answers (attempt_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.activity_log is 'Traçabilité des actions importantes (création/modification/suppression de QCM, connexions...), consultable par l''administrateur (§10 du cahier des charges).';

create index activity_log_created_at_idx on public.activity_log (created_at desc);

create table public.error_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  context jsonb,
  created_at timestamptz not null default now()
);

comment on table public.error_log is 'Journal des erreurs techniques rencontrées par l''application, consultable par l''administrateur à la demande (pas d''alerte automatique, comme validé).';

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Réglages modifiables par l''administrateur sans toucher au code (ex. durées de rétention des historiques, §11).';

insert into public.app_settings (key, value) values
  ('arbitre_retention_days', '30'),
  ('formateur_retention_days', 'unlimited');
