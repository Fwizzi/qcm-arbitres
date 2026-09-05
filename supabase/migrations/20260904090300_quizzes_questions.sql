-- =========================================================
-- QCM, questions et propositions de réponse
-- =========================================================

-- "draft"     = brouillon, en cours de préparation, invisible des arbitres.
-- "published" = le formateur a cliqué sur « Prêt / Publier » : le QCM se
--               déverrouillera automatiquement pour les arbitres concernés
--               dès que la date du jour entrera dans [period_start, period_end].
-- Les statuts « actif » et « expiré » vus à l'écran ne sont PAS stockés :
-- ils se déduisent de status='published' + la date du jour comparée à
-- period_start/period_end (voir la vue plus bas). Cela évite d'avoir
-- besoin d'une tâche planifiée pour "faire passer" un QCM à expiré.
create type public.quiz_status as enum ('draft', 'published');

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  formateur_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  status public.quiz_status not null default 'draft',
  time_limit_minutes integer not null check (time_limit_minutes > 0),
  show_score boolean not null default true,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint quizzes_period_valid check (period_end >= period_start)
);

comment on table public.quizzes is 'Un QCM créé par un formateur (ou l''administrateur, qui peut aussi créer des QCM comme un formateur).';

create index quizzes_formateur_id_idx on public.quizzes (formateur_id);

-- Vue pratique qui calcule le statut réellement affiché à l'écran.
create view public.quizzes_with_computed_status as
select
  q.*,
  case
    when q.status = 'draft' then 'draft'
    when current_date < q.period_start then 'a_venir'
    when current_date > q.period_end then 'expire'
    else 'actif'
  end as computed_status
from public.quizzes q;

comment on view public.quizzes_with_computed_status is 'Ajoute une colonne "computed_status" (draft / a_venir / actif / expire) déduite de la date du jour.';

-- Un QCM est envoyé à un ou plusieurs groupes d'arbitres, jamais à tous par défaut.
create table public.quiz_groups (
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  primary key (quiz_id, group_id)
);

create type public.question_type as enum ('video', 'image', 'text');

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  type public.question_type not null,
  media_url text,
  text text not null,
  explanation text,
  order_index integer not null,
  constraint media_matches_type check (
    (type = 'text' and media_url is null)
    or (type in ('video', 'image') and media_url is not null)
  )
);

comment on column public.questions.media_url is 'Lien vers la vidéo (Cloudflare R2) ou l''image (Supabase Storage). Toujours vide pour une question de type texte.';
comment on column public.questions.explanation is 'Explication optionnelle de la bonne réponse, écrite par le formateur, montrée à l''arbitre si show_score est activé sur le QCM.';

create index questions_quiz_id_idx on public.questions (quiz_id);

create table public.answer_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  text text not null,
  is_correct boolean not null default false
);

comment on table public.answer_options is 'Propositions de réponse d''une question. Le nombre de réponses cochables par l''arbitre = le nombre de lignes is_correct=true pour cette question (calculé à la volée, jamais stocké séparément).';

create index answer_options_question_id_idx on public.answer_options (question_id);
