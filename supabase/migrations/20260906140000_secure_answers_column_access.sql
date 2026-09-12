-- =========================================================
-- Sécurité renforcée : colonnes sensibles des questions/réponses
-- =========================================================
-- Jusqu'ici, nos règles RLS protégeaient les LIGNES visibles, mais pas les
-- COLONNES à l'intérieur : un arbitre techniquement averti aurait pu
-- interroger directement l'API pour lire "answer_options.is_correct" ou
-- "questions.explanation" pendant qu'il passe un QCM, et donc tricher.
--
-- On retire l'accès direct à ces deux colonnes pour tout le monde, et on
-- passe par des fonctions sécurisées (SECURITY DEFINER) qui décident, au
-- cas par cas, qui a le droit de voir quoi :
--   - le formateur/l'admin : tout, sur ses propres QCM ;
--   - l'arbitre en train de répondre : jamais les bonnes réponses ni
--     l'explication ;
--   - l'arbitre après avoir soumis : tout, mais seulement sur sa propre
--     tentative, et seulement si le formateur a autorisé l'affichage du
--     score.

revoke select on public.questions from authenticated;
grant select (id, quiz_id, type, media_url, text, order_index) on public.questions to authenticated;

revoke select on public.answer_options from authenticated;
grant select (id, question_id, text) on public.answer_options to authenticated;

-- ---------------------------------------------------------
-- Formateur / admin : lecture complète de ses propres QCM
-- ---------------------------------------------------------
create or replace function public.get_editor_questions(p_quiz_id uuid)
returns table (
  id uuid,
  type public.question_type,
  media_url text,
  text text,
  explanation text,
  order_index integer,
  options jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.quizzes q
    where q.id = p_quiz_id
      and (q.formateur_id = auth.uid() or public.has_role('admin'))
  ) then
    raise exception 'Non autorisé.';
  end if;

  return query
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.explanation, qu.order_index,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', ao.id, 'text', ao.text, 'is_correct', ao.is_correct) order by ao.id)
       from public.answer_options ao where ao.question_id = qu.id),
      '[]'::jsonb
    ) as options
  from public.questions qu
  where qu.quiz_id = p_quiz_id
  order by qu.order_index;
end;
$$;

grant execute on function public.get_editor_questions(uuid) to authenticated;

-- ---------------------------------------------------------
-- Arbitre : lecture SANS les bonnes réponses ni l'explication,
-- uniquement si le QCM est publié, actif, et le concerne.
-- ---------------------------------------------------------
create or replace function public.get_exam_questions(p_quiz_id uuid)
returns table (
  id uuid,
  type public.question_type,
  media_url text,
  text text,
  order_index integer,
  options jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.quizzes q
    join public.quiz_groups qg on qg.quiz_id = q.id
    join public.group_members gm on gm.group_id = qg.group_id
    where q.id = p_quiz_id
      and q.status = 'published'
      and current_date between q.period_start and q.period_end
      and gm.user_id = auth.uid()
  ) then
    raise exception 'Non autorisé.';
  end if;

  return query
  select
    qu.id, qu.type, qu.media_url, qu.text, qu.order_index,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', ao.id, 'text', ao.text) order by ao.id)
       from public.answer_options ao where ao.question_id = qu.id),
      '[]'::jsonb
    ) as options
  from public.questions qu
  where qu.quiz_id = p_quiz_id
  order by qu.order_index;
end;
$$;

grant execute on function public.get_exam_questions(uuid) to authenticated;

-- ---------------------------------------------------------
-- Arbitre : lecture COMPLÈTE (bonnes réponses + explication),
-- uniquement sur SA PROPRE tentative déjà soumise, et seulement
-- si le formateur a autorisé l'affichage du score.
-- ---------------------------------------------------------
create or replace function public.get_exam_results(p_attempt_id uuid)
returns table (
  question_id uuid,
  question_text text,
  explanation text,
  option_id uuid,
  option_text text,
  is_correct boolean,
  was_selected boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_show_score boolean;
begin
  select qa.quiz_id into v_quiz_id
  from public.quiz_attempts qa
  where qa.id = p_attempt_id
    and qa.user_id = auth.uid()
    and qa.status in ('submitted', 'auto_submitted');

  if v_quiz_id is null then
    raise exception 'Non autorisé.';
  end if;

  select q.show_score into v_show_score from public.quizzes q where q.id = v_quiz_id;
  if not v_show_score then
    raise exception 'Le score n''est pas affiché pour ce QCM.';
  end if;

  return query
  select
    qu.id, qu.text, qu.explanation,
    ao.id, ao.text, ao.is_correct,
    exists(select 1 from public.selected_answers sa where sa.attempt_id = p_attempt_id and sa.option_id = ao.id)
  from public.questions qu
  join public.answer_options ao on ao.question_id = qu.id
  where qu.quiz_id = v_quiz_id
  order by qu.order_index, ao.id;
end;
$$;

grant execute on function public.get_exam_results(uuid) to authenticated;
