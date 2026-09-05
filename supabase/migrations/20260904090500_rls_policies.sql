-- =========================================================
-- Sécurité : Row Level Security (RLS)
-- =========================================================
-- IMPORTANT : sans ces règles, n'importe quelle personne connectée à
-- l'application pourrait lire ou modifier toutes les données via l'API
-- Supabase. RLS restreint chaque requête aux lignes autorisées selon
-- le rôle de la personne connectée (auth.uid()), en suivant le tableau
-- des permissions du §3 du cahier des charges.

-- Fonction utilitaire : la personne connectée a-t-elle ce rôle ?
create or replace function public.has_role(check_role public.app_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = check_role
  );
$$;

-- Fonction utilitaire : la personne connectée est-elle la créatrice de ce QCM ?
-- (SECURITY DEFINER : contourne volontairement RLS pour éviter une boucle
-- infinie entre les règles de "quizzes" et "quiz_groups", qui se
-- vérifient mutuellement.)
create or replace function public.is_quiz_owner(check_quiz_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = check_quiz_id and q.formateur_id = auth.uid()
  );
$$;

-- Fonction utilitaire : la personne connectée est-elle propriétaire de ce groupe ?
-- (SECURITY DEFINER : évite une boucle infinie entre "groups" et
-- "group_shares", qui se vérifient mutuellement.)
create or replace function public.owns_group(check_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.groups g
    where g.id = check_group_id and g.formateur_id = auth.uid()
  );
$$;

-- ---- profiles ----
alter table public.profiles enable row level security;

create policy "Chacun voit son propre profil, l'admin voit tout"
  on public.profiles for select
  using (id = auth.uid() or public.has_role('admin'));

create policy "Seul l'admin crée/modifie/supprime les profils"
  on public.profiles for all
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---- user_roles ----
alter table public.user_roles enable row level security;

create policy "Chacun voit ses propres rôles, l'admin voit tout"
  on public.user_roles for select
  using (user_id = auth.uid() or public.has_role('admin'));

create policy "Seul l'admin gère les rôles"
  on public.user_roles for all
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ---- groups ----
alter table public.groups enable row level security;

create policy "Voir ses groupes, ceux partagés avec soi, ou tout (admin)"
  on public.groups for select
  using (
    formateur_id = auth.uid()
    or public.has_role('admin')
    or exists (
      select 1 from public.group_shares gs
      where gs.group_id = groups.id and gs.shared_with_user_id = auth.uid()
    )
  );

create policy "Un formateur crée ses propres groupes"
  on public.groups for insert
  with check (formateur_id = auth.uid() and public.has_role('formateur'));

create policy "Un formateur modifie ses propres groupes"
  on public.groups for update using (formateur_id = auth.uid());

create policy "Un formateur supprime ses propres groupes"
  on public.groups for delete using (formateur_id = auth.uid());

-- ---- group_members ----
alter table public.group_members enable row level security;

create policy "Voir les membres d'un groupe (proprio, partagé, ou soi-même)"
  on public.group_members for select
  using (
    public.has_role('admin')
    or exists (select 1 from public.groups g where g.id = group_members.group_id and g.formateur_id = auth.uid())
    or exists (select 1 from public.group_shares gs where gs.group_id = group_members.group_id and gs.shared_with_user_id = auth.uid())
    or user_id = auth.uid()
  );

create policy "Le propriétaire du groupe gère ses membres"
  on public.group_members for all
  using (exists (select 1 from public.groups g where g.id = group_members.group_id and g.formateur_id = auth.uid()))
  with check (exists (select 1 from public.groups g where g.id = group_members.group_id and g.formateur_id = auth.uid()));

-- ---- group_shares ----
alter table public.group_shares enable row level security;

create policy "Voir les partages qui nous concernent"
  on public.group_shares for select
  using (
    public.has_role('admin')
    or shared_with_user_id = auth.uid()
    or public.owns_group(group_shares.group_id)
  );

create policy "Le propriétaire du groupe décide des partages"
  on public.group_shares for all
  using (public.owns_group(group_shares.group_id))
  with check (public.owns_group(group_shares.group_id));

-- ---- quizzes ----
alter table public.quizzes enable row level security;

create policy "Un formateur voit ses QCM, l'admin voit tout"
  on public.quizzes for select
  using (formateur_id = auth.uid() or public.has_role('admin'));

create policy "Un arbitre voit les QCM publiés et actifs de ses groupes"
  on public.quizzes for select
  using (
    status = 'published'
    and current_date between period_start and period_end
    and exists (
      select 1 from public.quiz_groups qg
      join public.group_members gm on gm.group_id = qg.group_id
      where qg.quiz_id = quizzes.id and gm.user_id = auth.uid()
    )
  );

create policy "Un formateur (ou l'admin) crée des QCM en son propre nom"
  on public.quizzes for insert
  with check (formateur_id = auth.uid() and (public.has_role('formateur') or public.has_role('admin')));

create policy "Un formateur modifie ses propres QCM, l'admin modifie tout"
  on public.quizzes for update using (formateur_id = auth.uid() or public.has_role('admin'));

create policy "Un formateur supprime ses propres QCM, l'admin supprime tout"
  on public.quizzes for delete using (formateur_id = auth.uid() or public.has_role('admin'));

-- ---- quiz_groups ----
alter table public.quiz_groups enable row level security;

create policy "Voir le ciblage de ses QCM ou celui qui nous concerne"
  on public.quiz_groups for select
  using (
    public.has_role('admin')
    or public.is_quiz_owner(quiz_groups.quiz_id)
    or exists (select 1 from public.group_members gm where gm.group_id = quiz_groups.group_id and gm.user_id = auth.uid())
  );

create policy "Le créateur du QCM choisit ses groupes cibles"
  on public.quiz_groups for all
  using (public.is_quiz_owner(quiz_groups.quiz_id))
  with check (public.is_quiz_owner(quiz_groups.quiz_id));

-- ---- questions (mêmes règles de visibilité que le QCM parent) ----
alter table public.questions enable row level security;

create policy "Voir les questions d'un QCM qu'on peut voir"
  on public.questions for select
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id
      and (
        q.formateur_id = auth.uid()
        or public.has_role('admin')
        or (
          q.status = 'published'
          and current_date between q.period_start and q.period_end
          and exists (
            select 1 from public.quiz_groups qg
            join public.group_members gm on gm.group_id = qg.group_id
            where qg.quiz_id = q.id and gm.user_id = auth.uid()
          )
        )
      )
    )
  );

create policy "Le créateur du QCM gère ses questions"
  on public.questions for all
  using (exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.formateur_id = auth.uid()))
  with check (exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.formateur_id = auth.uid()));

-- ---- answer_options ----
alter table public.answer_options enable row level security;

create policy "Voir les réponses d'une question visible"
  on public.answer_options for select
  using (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id
      and (
        q.formateur_id = auth.uid()
        or public.has_role('admin')
        or (
          q.status = 'published'
          and current_date between q.period_start and q.period_end
          and exists (
            select 1 from public.quiz_groups qg
            join public.group_members gm on gm.group_id = qg.group_id
            where qg.quiz_id = q.id and gm.user_id = auth.uid()
          )
        )
      )
    )
  );

create policy "Le créateur du QCM gère les réponses de ses questions"
  on public.answer_options for all
  using (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id and q.formateur_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.questions qu
      join public.quizzes q on q.id = qu.quiz_id
      where qu.id = answer_options.question_id and q.formateur_id = auth.uid()
    )
  );

-- ---- quiz_attempts ----
alter table public.quiz_attempts enable row level security;

create policy "Un arbitre voit sa propre tentative"
  on public.quiz_attempts for select
  using (user_id = auth.uid());

create policy "Le formateur du QCM et l'admin voient toutes les tentatives"
  on public.quiz_attempts for select
  using (
    public.has_role('admin')
    or exists (select 1 from public.quizzes q where q.id = quiz_attempts.quiz_id and q.formateur_id = auth.uid())
  );

create policy "Un arbitre crée sa propre tentative"
  on public.quiz_attempts for insert
  with check (user_id = auth.uid());

create policy "Un arbitre met à jour sa propre tentative en cours"
  on public.quiz_attempts for update
  using (user_id = auth.uid());

-- ---- selected_answers ----
alter table public.selected_answers enable row level security;

create policy "Voir ses réponses, ou celles de ses QCM (formateur/admin)"
  on public.selected_answers for select
  using (
    exists (select 1 from public.quiz_attempts qa where qa.id = selected_answers.attempt_id and qa.user_id = auth.uid())
    or public.has_role('admin')
    or exists (
      select 1 from public.quiz_attempts qa
      join public.quizzes q on q.id = qa.quiz_id
      where qa.id = selected_answers.attempt_id and q.formateur_id = auth.uid()
    )
  );

create policy "Un arbitre coche ses propres réponses"
  on public.selected_answers for insert
  with check (exists (select 1 from public.quiz_attempts qa where qa.id = selected_answers.attempt_id and qa.user_id = auth.uid()));

create policy "Un arbitre modifie ses propres réponses avant soumission"
  on public.selected_answers for delete
  using (exists (select 1 from public.quiz_attempts qa where qa.id = selected_answers.attempt_id and qa.user_id = auth.uid()));

-- ---- activity_log & error_log : admin uniquement en lecture ----
alter table public.activity_log enable row level security;

create policy "Seul l'admin consulte le journal d'activité"
  on public.activity_log for select
  using (public.has_role('admin'));

create policy "L'application peut inscrire des entrées d'activité"
  on public.activity_log for insert
  with check (true);

alter table public.error_log enable row level security;

create policy "Seul l'admin consulte le journal d'erreurs"
  on public.error_log for select
  using (public.has_role('admin'));

create policy "L'application peut inscrire des erreurs techniques"
  on public.error_log for insert
  with check (true);

-- ---- app_settings ----
alter table public.app_settings enable row level security;

create policy "Tout le monde peut lire les réglages"
  on public.app_settings for select
  using (true);

create policy "Seul l'admin modifie les réglages"
  on public.app_settings for update
  using (public.has_role('admin'));
